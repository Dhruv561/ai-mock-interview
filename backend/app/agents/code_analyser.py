"""Deterministic-first static analysis of candidate code (architecture.md
§K, Feature 09).

Decision (architecture.md §1's decision table): the Python stdlib `ast`
module only, for Python submissions. Other languages fall back to
LLM-only analysis with no static parser here — writing multi-language
static analyzers is out of scope for a hackathon, and Python is the
default/demo language on LeetCode.

Deliberate simplification vs architecture.md §K's original prose: §K
describes a structured `CodeAnalysis` object
(`syntax_ok`/`complexity_estimate`/`suspicious_patterns[]`/...). This
module instead returns `list[str]` — plain human-readable observation
strings — because that already matches the shape
`InterviewState.code_analysis_observations` committed to in Feature 07,
and what `interview/prompts.py:build_user_prompt` consumes: the same
"labelled block of plain-text bullets" style already used for
`recent_interviewer_actions`. Documented here rather than silently
changing architecture.md's prose, per CLAUDE.md's "do not silently change
requirements" rule.

Every check below is a best-effort heuristic derived from the AST, not a
real linter or type checker — false negatives (and occasionally false
positives) are expected and acceptable. Findings are only ever interview
*context* for the LLM, never shown to the candidate as authoritative
(architecture.md §K risk note).

Pure and side-effect-free: no I/O, no network, deterministic for a given
(code, language) input — same discipline as interview/state.py and
interview/controller.py.
"""

from __future__ import annotations

import ast


def analyse_code(code: str, language: str) -> list[str]:
    """Returns human-readable observations about `code`, or `[]` if
    `language` isn't Python (case-insensitive) — there is no static parser
    for other languages (architecture.md §1)."""
    if language.strip().lower() != "python":
        return []

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        # A candidate mid-thought will very often have unparseable code —
        # that's expected interview state, not an error condition, and must
        # never crash the session by propagating.
        return [f"Syntax error at line {exc.lineno}: {exc.msg}"]

    observations: list[str] = []
    observations.extend(_check_nested_loops(tree))
    observations.extend(_check_missing_return(tree))
    observations.extend(_check_recursion_without_base_case(tree))
    observations.extend(_check_bare_except(tree))
    observations.extend(_check_unused_imports(tree))
    return observations


def _iter_own_body(node: ast.AST):
    """Yields every descendant of `node`, without descending into a nested
    function/class's own body. Without this, a helper function's `return`
    or a loop inside a nested `def` would be misattributed to the
    enclosing function/loop when reasoning about "this function" or "this
    loop" in isolation."""
    for child in ast.iter_child_nodes(node):
        yield child
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            continue
        yield from _iter_own_body(child)


def _check_nested_loops(tree: ast.AST) -> list[str]:
    """A loop containing another loop is a common, easy-to-spot Big-O
    signal (likely O(n^2) or worse) worth surfacing to the interviewer even
    though the AST can't know the actual iteration counts. Only the first
    occurrence is reported — the goal is to prompt a complexity
    conversation, not to enumerate every nested loop in the file."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.While)):
            for inner in _iter_own_body(node):
                if isinstance(inner, (ast.For, ast.While)):
                    line = getattr(node, "lineno", "?")
                    return [
                        f"Nested loop detected (outer loop at line {line}) — check "
                        "whether this affects the time complexity."
                    ]
    return []


def _is_stub_body(body: list[ast.stmt]) -> bool:
    """True if a function body is only a docstring, `pass`, and/or `...` —
    i.e. a deliberate stub with nothing to return, not an omission."""
    meaningful = [
        stmt
        for stmt in body
        if not (
            isinstance(stmt, ast.Expr)
            and isinstance(stmt.value, ast.Constant)
            and (isinstance(stmt.value.value, str) or stmt.value.value is Ellipsis)
        )
    ]
    if not meaningful:
        return True
    return len(meaningful) == 1 and isinstance(meaningful[0], ast.Pass)


def _check_missing_return(tree: ast.AST) -> list[str]:
    """Flags a non-stub function that never returns a value. Deliberately
    approximate: plenty of correct LeetCode solutions mutate in place and
    intentionally return None (e.g. "modify the array in place"), so this
    is phrased as a question for the interviewer to raise, not a defect
    report — and stub bodies (`pass`/`...`/docstring-only) and generators
    (contain `yield`) are excluded to avoid the most obvious false
    positives."""
    observations = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if _is_stub_body(node.body):
            continue
        own = list(_iter_own_body(node))
        if any(isinstance(n, (ast.Yield, ast.YieldFrom)) for n in own):
            continue  # generator — absence of a value-returning `return` is normal
        has_value_return = any(isinstance(n, ast.Return) and n.value is not None for n in own)
        if not has_value_return:
            observations.append(
                f"Function '{node.name}' has no return statement with a value — "
                "confirm this is intentional."
            )
    return observations


def _check_recursion_without_base_case(tree: ast.AST) -> list[str]:
    """Flags a function that calls itself by name but contains no visible
    `if`/conditional expression anywhere in its body. Best-effort only: a
    base case guarded some other way (e.g. a `while`/`try` construct, or a
    call routed through a conditional in a helper) won't be recognised as
    one, and this can't verify the guard actually terminates recursion —
    it only checks that *some* conditional exists at all."""
    observations = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        own = list(_iter_own_body(node))
        calls_self = any(
            isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == node.name
            for n in own
        )
        if not calls_self:
            continue
        has_conditional = any(isinstance(n, (ast.If, ast.IfExp)) for n in own)
        if not has_conditional:
            observations.append(
                f"Function '{node.name}' calls itself recursively but has no visible "
                "conditional — verify there's a base case that terminates it."
            )
    return observations


def _check_bare_except(tree: ast.AST) -> list[str]:
    """A bare `except:` or `except Exception:` swallows essentially
    everything, including bugs the candidate would want surfaced during an
    interview — worth a flag regardless of whether it's "correct" Python."""
    observations = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        if node.type is None:
            observations.append(
                f"Bare 'except:' at line {node.lineno} catches every exception "
                "(including e.g. KeyboardInterrupt/SystemExit) — consider a specific "
                "exception type."
            )
        elif isinstance(node.type, ast.Name) and node.type.id == "Exception":
            observations.append(
                f"'except Exception' at line {node.lineno} is very broad — consider a "
                "more specific exception type."
            )
    return observations


def _check_unused_imports(tree: ast.AST) -> list[str]:
    """Flags an imported name with no matching `ast.Name` load anywhere in
    the module. Star imports (`from x import *`) are skipped — there's no
    way to attribute usage to a specific name. This only checks bare name
    usage, so it can't tell whether the import is used purely for a type
    annotation string or via some other indirect reference; a reasonable
    trade-off for a hackathon-grade heuristic."""
    imported: dict[str, int] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                imported[name] = node.lineno
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == "*":
                    continue
                name = alias.asname or alias.name
                imported[name] = node.lineno

    used = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
    return [
        f"Import '{name}' (line {line}) appears unused."
        for name, line in imported.items()
        if name not in used
    ]
