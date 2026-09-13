"""Prompt templates for the end-of-interview evaluator LLM (architecture.md
§P, Feature 14). Separate from interview/prompts.py (the live interviewer's
prompts) — a different job (grade a finished session, not converse during
one) with a different, evidence-only input shape.

Versioned like interview/prompts.py, for the same reason: bump
EVALUATOR_PROMPT_VERSION whenever the templates below change in a way that
could affect model behaviour.

Prompt contract (relied on by providers/llm/mock.py's propose_review, the
same way providers/llm/mock.py's propose_action relies on prompts.py's
"Stage: <stage>" marker convention):
  - Every evidence item appears in the user prompt as exactly one line of
    the form `  id=<id> kind=<kind> text="<text>"` under the "Evidence"
    header. These ids are the only ones the model may cite in
    ReviewPoint.evidence_ids, and the mock provider parses this exact line
    shape back into EvidenceItem objects.
  - Every stage_history-derived timeline entry appears as exactly one line
    of the form `  evidence_id=<id> stage=<stage> elapsed_seconds=<n>`
    under the "Stage timeline" header — elapsed_seconds is computed once,
    here, as entry.timestamp - state.started_at (deterministic, not left
    to the model's arithmetic), and the model is instructed to copy these
    values into FinalReview.timeline verbatim rather than recompute them.
  - Rubric-so-far appears under the "Rubric so far" header as one
    `  <category>: <score>` line per category, mirroring interview/
    prompts.py's own rubric section format.
"""

from __future__ import annotations

from app.interview.schemas import EvidenceItem
from app.interview.state import InterviewState

EVALUATOR_PROMPT_VERSION = "v1"

_RUBRIC_CATEGORIES_TEXT = (
    "clarifying, approach, code_quality, complexity, communication, testing"
)

EVALUATOR_SYSTEM_PROMPT_TEMPLATE = """You are grading a completed technical coding interview for \
the problem "{problem_title}" ({difficulty}).

You are given the complete evidentiary record of the interview as a flat list of evidence \
items, each with a stable id, a kind (transcript / code_analysis / hint / rubric / stage), and \
a short text description. This evidence list is the ONLY source material you may draw on.

Produce a single structured final review with:
- overall_score: 0-10, your overall judgement of the candidate's performance.
- rubric: one 0-3 integer score for each of these categories: {categories}. You may adjust a \
category from its "rubric so far" value if the evidence supports a different score, but any \
change must be grounded in the evidence given.
- strengths: 1-4 bullets, each citing at least one evidence id that supports it.
- areas_to_improve: 1-4 bullets, each citing at least one evidence id that supports it.
- timeline: one entry per line under "Stage timeline" below, using its exact elapsed_seconds \
value and the stage name as the label, in the same chronological order they're given.
- evidence: return the evidence list given to you, unchanged.

Hard rules (CLAUDE.md "evidence-based final feedback" / architecture.md §P):
- Every strength and area_to_improve bullet MUST cite at least one evidence id from the list \
given to you. Never invent an id and never cite one that isn't listed.
- Never write a generic claim ("communicates well", "clean code") that isn't traceable to a \
specific listed evidence item. If there isn't enough evidence for a category, say so rather \
than guessing.
- Do not add evidence items beyond the ones given to you.
"""


def build_system_prompt(state: InterviewState) -> str:
    return EVALUATOR_SYSTEM_PROMPT_TEMPLATE.format(
        problem_title=state.problem.title,
        difficulty=state.problem.difficulty or "unspecified difficulty",
        categories=_RUBRIC_CATEGORIES_TEXT,
    )


def build_user_prompt(
    state: InterviewState, evidence: list[EvidenceItem], *, retry_note: str | None = None
) -> str:
    lines: list[str] = []

    if retry_note:
        # Only present on the single retry attempt (agents/evaluator.py) —
        # nice-to-have context for why the second attempt is happening, not
        # required for correctness (the hard rules above already say what's
        # allowed).
        lines.append(f"NOTE: {retry_note}")
        lines.append("")

    lines.append(f"Problem: {state.problem.title}")
    lines.append("")

    lines.append("Evidence (cite these ids only; do not invent new ones):")
    if evidence:
        for item in evidence:
            lines.append(f'  id={item.id} kind={item.kind} text="{item.text}"')
    else:
        lines.append("  (no evidence recorded this session)")
    lines.append("")

    lines.append("Stage timeline (use these exact elapsed_seconds values for the timeline field):")
    stage_items = [item for item in evidence if item.kind == "stage"]
    if stage_items:
        for item in stage_items:
            stage_name, elapsed = _stage_and_elapsed(item, state)
            lines.append(
                f"  evidence_id={item.id} stage={stage_name} elapsed_seconds={elapsed:.1f}"
            )
    else:
        lines.append("  (no stage transitions recorded)")
    lines.append("")

    lines.append("Rubric so far (0-3 each; you may adjust with evidence-based justification):")
    for category, score in state.rubric.items():
        lines.append(f"  {category}: {score}")

    return "\n".join(lines)


def _stage_and_elapsed(item: EvidenceItem, state: InterviewState) -> tuple[str, float]:
    """Recovers the (stage, elapsed_seconds) pair for one stage-kind
    evidence item. Evidence text is `"Moved to stage: <stage>"`
    (agents/evaluator.build_evidence) and stage evidence ids are assigned
    in the same order as state.stage_history, so the index in the id
    (`stage-<i>`) is also the index into stage_history — this avoids
    re-parsing elapsed time back out of prose."""
    index = int(item.id.removeprefix("stage-"))
    entry = state.stage_history[index]
    return entry.stage, entry.timestamp - state.started_at
