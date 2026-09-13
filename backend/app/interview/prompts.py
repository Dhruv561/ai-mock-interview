"""Prompt templates for the interviewer LLM (architecture.md §J).

Versioned so a prompt change is a deliberate, tracked decision rather than
silent drift — bump PROMPT_VERSION whenever SYSTEM_PROMPT_TEMPLATE or
STAGE_GUIDANCE changes in a way that could affect model behaviour.

build_user_prompt's first line is always "Stage: <stage>" and its second
"Trigger: <trigger>" — a documented, stable contract that
providers/llm/mock.py relies on to pick a deterministic canned response
without needing structured state access of its own. When trigger is
"hint_requested", a further "Hint level requested: <n>" marker line is
also guaranteed to appear (right after "Hint level so far: ..."), which
providers/llm/mock.py likewise keys off to pick a level-appropriate canned
hint.
"""

from typing import Literal

from app.interview.schemas import InterviewStage
from app.interview.state import InterviewState

PROMPT_VERSION = "v1"

Trigger = Literal["code_update", "transcript_final", "hint_requested"]

# Mirrors controller.MAX_HINT_LEVEL — the cap on how many hint tiers exist.
# Duplicated here (rather than imported) to keep prompts.py a leaf module
# with no dependency on the controller; if the cap ever changes, both
# constants must move together (there is no third place either reads from).
MAX_HINT_LEVEL = 3

# Distinct guidance per hint tier (FR12/architecture.md §N): each level is
# strictly stronger than the last, but level 3 still stops short of the
# full solution — see SYSTEM_PROMPT_TEMPLATE's "never reveal the optimal
# solution outright" rule, which has no exception in this MVP (no
# interviewer-mode override exists to lift it).
HINT_LEVEL_GUIDANCE: dict[int, str] = {
    1: (
        "Give hint level 1: a conceptual nudge. Point at the idea or "
        "observation the candidate seems to be missing, without naming a "
        "specific data structure, algorithm, or technique."
    ),
    2: (
        "Give hint level 2: a more specific direction. You may now name the "
        "relevant data structure or algorithmic idea, but do not explain "
        "how to apply it step by step."
    ),
    3: (
        "Give hint level 3, the strongest hint allowed: concrete guidance "
        "toward the solution, detailed enough that the candidate can "
        "implement it themselves. Still do not write the solution code or "
        "state the final answer outright."
    ),
}

# One line of stage-specific guidance each, reflecting CLAUDE.md's "guide
# rather than solve" and "interviewer should not speak on every event"
# principles.
STAGE_GUIDANCE: dict[InterviewStage, str] = {
    "intro": "Greet the candidate briefly and confirm they understand the problem statement.",
    "clarification": (
        "Encourage the candidate to ask clarifying questions about edge cases, input "
        "constraints, and expected output before they start coding."
    ),
    "approach": (
        "Probe the candidate's reasoning about their intended approach before they write "
        "code. Ask them to justify their choice rather than accepting it silently."
    ),
    "coding": (
        "Watch their progress. Ask about edge cases or design decisions only if it would "
        "genuinely help — don't interrupt productive, uneventful work."
    ),
    "complexity": (
        "Ask the candidate to state the time and space complexity of their solution "
        "and justify it."
    ),
    "testing": (
        "Ask the candidate to walk through test cases against their solution, "
        "including edge cases."
    ),
    "optimisation": "Ask whether the current solution can be improved, and in what way.",
    "review": "The interview is over. Always remain silent.",
}

SYSTEM_PROMPT_TEMPLATE = """You are conducting a technical coding interview for the \
problem "{problem_title}" ({difficulty}).

Your role:
- Ask questions, probe reasoning, identify inconsistencies, encourage \
clarification, and give graduated hints.
- Do not reveal the optimal solution outright. Hints escalate up to level 3 (strong, \
concrete guidance), but even level 3 stops short of the full solution — there is no \
mode in this system that lifts that restriction.
- When the candidate's words or code just gave clear evidence about their clarifying \
questions, approach, code quality, complexity reasoning, communication, or testing, \
include rubric_updates (0-3 per category, only the categories that changed) with a \
concise rubric_evidence string describing what you observed. Never update a rubric \
category speculatively or without evidence.
- Silence is a valid and often correct response — do not speak on every event. \
The candidate should feel like they're talking to an interviewer, not a live \
autocomplete.
- Never ask a question you have already asked or said before (see "Already asked \
/ said by you" in the next message).

Current stage: {stage}. {stage_guidance}

Respond with exactly one action: ask_question, remain_silent, transition_stage, \
or give_hint."""


def build_system_prompt(state: InterviewState) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        problem_title=state.problem.title,
        difficulty=state.problem.difficulty or "unspecified difficulty",
        stage=state.stage,
        stage_guidance=STAGE_GUIDANCE[state.stage],
    )


def build_user_prompt(state: InterviewState, *, trigger: Trigger = "code_update") -> str:
    lines = [f"Stage: {state.stage}", f"Trigger: {trigger}", ""]

    lines.append(f"Problem: {state.problem.title}")
    lines.append(f"Current code ({state.language}):")
    lines.append(state.current_code or "(no code yet)")
    lines.append("")

    lines.append("Recent transcript:")
    if state.transcript:
        for entry in state.transcript[-10:]:
            lines.append(f"  {entry.speaker}: {entry.text}")
    else:
        lines.append("  (nothing said yet)")
    lines.append("")

    lines.append(f"Hint level so far: {state.hint_level}/3")
    if trigger == "hint_requested":
        # accept_proposal (controller.py) only increments hint_level once a
        # give_hint action is actually accepted, so the level about to be
        # given is one past what's stored so far — capped at MAX_HINT_LEVEL
        # since hint_requested bypasses the cooldown gate (§L rule 2), not
        # the level cap; a request beyond the cap still reaches the LLM but
        # accept_proposal silently rejects the resulting proposal.
        requested_level = min(state.hint_level + 1, MAX_HINT_LEVEL)
        lines.append(f"Hint level requested: {requested_level}")
        lines.append(HINT_LEVEL_GUIDANCE[requested_level])
    lines.append("")

    lines.append("Already asked / said by you (do not repeat):")
    if state.recent_interviewer_actions:
        for action in state.recent_interviewer_actions[-10:]:
            lines.append(f"  - {action}")
    else:
        lines.append("  (none yet)")
    lines.append("")

    lines.append("Current rubric scores so far (0-3 each):")
    for category, score in state.rubric.items():
        lines.append(f"  {category}: {score}")

    return "\n".join(lines)
