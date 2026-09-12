"""Prompt templates for the interviewer LLM (architecture.md §J).

Versioned so a prompt change is a deliberate, tracked decision rather than
silent drift — bump PROMPT_VERSION whenever SYSTEM_PROMPT_TEMPLATE or
STAGE_GUIDANCE changes in a way that could affect model behaviour.

build_user_prompt's first line is always "Stage: <stage>" and its second
"Trigger: <trigger>" — a documented, stable contract that
providers/llm/mock.py relies on to pick a deterministic canned response
without needing structured state access of its own.
"""

from typing import Literal

from app.interview.schemas import InterviewStage
from app.interview.state import InterviewState

PROMPT_VERSION = "v1"

Trigger = Literal["code_update", "transcript_final", "hint_requested"]

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
- Do not reveal the optimal solution unless the candidate has exhausted hint level 3.
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
    lines.append("")

    lines.append("Already asked / said by you (do not repeat):")
    if state.recent_interviewer_actions:
        for action in state.recent_interviewer_actions[-10:]:
            lines.append(f"  - {action}")
    else:
        lines.append("  (none yet)")

    return "\n".join(lines)
