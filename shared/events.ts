// Zod mirror of backend/app/interview/schemas.py (source of truth). See
// README.md for the sync policy. Only session.start/pause/resume/end,
// code.update, hint.requested, screen.recording.*, dev.simulate_transcript
// (client events), plus session.started, transcript.partial,
// transcript.final and error (server events) are actually sent/consumed
// today, by networking/websocket.ts + backend/app/websocket/interview.py
// (Feature 06) and the STT pipeline (backend/app/providers/stt/*,
// Feature 05). The remaining server event types (interviewer.*,
// rubric.updated, hint.response, review.ready) are typed contracts ahead
// of the features that will emit them (07/08/11/13/14) — nothing sends
// them yet.
//
// Deliberate PRD deviation: PRD.md §9 lists transcript.partial/final under
// client events and omits them from the server list. That doesn't match
// this project's own committed architecture (architecture.md §E/§H) — the
// client streams raw mic audio, and the backend's STT provider is what
// produces partial/final transcript segments, so both are server -> client
// here. See backend/app/interview/schemas.py's module docstring and
// architecture.md §G for the full note.
import { z } from "zod";

export const difficultySchema = z.enum(["Easy", "Medium", "Hard"]);

export const interviewStageSchema = z.enum([
  "intro",
  "clarification",
  "approach",
  "coding",
  "complexity",
  "testing",
  "optimisation",
  "review",
]);

export const rubricCategorySchema = z.enum([
  "clarifying",
  "approach",
  "code_quality",
  "complexity",
  "communication",
  "testing",
]);

// Mirrors extension/src/content/leetcode.ts's ProblemInfo exactly, including
// the nullable fields — extraction is best-effort against LeetCode's live
// markup and can legitimately fail to find a number or difficulty while
// still returning a usable title/description.
export const problemInfoSchema = z.object({
  slug: z.string(),
  number: z.string().nullable(),
  title: z.string(),
  difficulty: difficultySchema.nullable(),
  description: z.string(),
});

export const timelineEventSchema = z.object({
  label: z.string(),
  elapsed_seconds: z.number(),
});

export const evidenceKindSchema = z.enum([
  "transcript",
  "code_analysis",
  "hint",
  "rubric",
  "stage",
]);

// One traceable fact from the interview record (Feature 14 /
// architecture.md §P) — the only material the evaluator prompt is allowed
// to draw on, and what a reviewPointSchema.evidence_ids entry points at.
export const evidenceItemSchema = z.object({
  id: z.string(),
  kind: evidenceKindSchema,
  text: z.string(),
});

// One strength/area-to-improve bullet. evidence_ids must be non-empty and
// (checked by finalReviewSchema below, not locally — it needs the sibling
// evidence list) every id must exist in the enclosing FinalReview.evidence.
export const reviewPointSchema = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

export const finalReviewSchema = z
  .object({
    overall_score: z.number(),
    rubric: z.record(rubricCategorySchema, z.number()),
    strengths: z.array(reviewPointSchema),
    areas_to_improve: z.array(reviewPointSchema),
    timeline: z.array(timelineEventSchema),
    evidence: z.array(evidenceItemSchema),
  })
  // Mirrors backend/app/interview/schemas.py's FinalReview._evidence_ids_must_resolve
  // — every cited evidence_ids entry must resolve to a real evidence.id.
  .refine(
    (review) => {
      const knownIds = new Set(review.evidence.map((item) => item.id));
      return [...review.strengths, ...review.areas_to_improve].every((point) =>
        point.evidence_ids.every((id) => knownIds.has(id)),
      );
    },
    { message: "ReviewPoint cites an evidence id not present in FinalReview.evidence" },
  );

// --- Client -> server events ---

export const sessionStartEventSchema = z.object({
  type: z.literal("session.start"),
  problem: problemInfoSchema,
  language: z.string(),
});

export const sessionPauseEventSchema = z.object({
  type: z.literal("session.pause"),
});

export const sessionResumeEventSchema = z.object({
  type: z.literal("session.resume"),
  session_id: z.string(),
  last_seq: z.number().int(),
});

export const sessionEndEventSchema = z.object({
  type: z.literal("session.end"),
});

export const codeUpdateEventSchema = z.object({
  type: z.literal("code.update"),
  language: z.string(),
  code: z.string(),
  timestamp: z.number(),
});

export const screenRecordingStartedEventSchema = z.object({
  type: z.literal("screen.recording.started"),
});

export const screenRecordingStoppedEventSchema = z.object({
  type: z.literal("screen.recording.stopped"),
});

export const hintRequestedEventSchema = z.object({
  type: z.literal("hint.requested"),
});

export const devSimulateTranscriptEventSchema = z.object({
  type: z.literal("dev.simulate_transcript"),
  text: z.string(),
});

export const clientEventSchema = z.discriminatedUnion("type", [
  sessionStartEventSchema,
  sessionPauseEventSchema,
  sessionResumeEventSchema,
  sessionEndEventSchema,
  codeUpdateEventSchema,
  screenRecordingStartedEventSchema,
  screenRecordingStoppedEventSchema,
  hintRequestedEventSchema,
  devSimulateTranscriptEventSchema,
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

// --- Server -> client events ---

export const baseServerEventSchema = z.object({
  seq: z.number().int().nonnegative(),
});

export const sessionStartedEventSchema = baseServerEventSchema.extend({
  type: z.literal("session.started"),
  session_id: z.string(),
});

export const interviewerStateEventSchema = baseServerEventSchema.extend({
  type: z.literal("interviewer.state"),
  stage: interviewStageSchema,
});

export const interviewerTranscriptEventSchema = baseServerEventSchema.extend({
  type: z.literal("interviewer.transcript"),
  text: z.string(),
});

export const interviewerAudioStartEventSchema = baseServerEventSchema.extend({
  type: z.literal("interviewer.audio.start"),
  format: z.string(),
});

export const interviewerAudioEndEventSchema = baseServerEventSchema.extend({
  type: z.literal("interviewer.audio.end"),
});

export const transcriptPartialEventSchema = baseServerEventSchema.extend({
  type: z.literal("transcript.partial"),
  text: z.string(),
});

export const transcriptFinalEventSchema = baseServerEventSchema.extend({
  type: z.literal("transcript.final"),
  text: z.string(),
  timestamp: z.number(),
});

export const rubricUpdatedEventSchema = baseServerEventSchema.extend({
  type: z.literal("rubric.updated"),
  rubric: z.record(rubricCategorySchema, z.number()),
  evidence: z.string(),
});

export const hintResponseEventSchema = baseServerEventSchema.extend({
  type: z.literal("hint.response"),
  level: z.number().int(),
  text: z.string(),
});

export const reviewReadyEventSchema = baseServerEventSchema.extend({
  type: z.literal("review.ready"),
  review: finalReviewSchema,
});

export const errorEventSchema = baseServerEventSchema.extend({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
});

export const serverEventSchema = z.discriminatedUnion("type", [
  sessionStartedEventSchema,
  interviewerStateEventSchema,
  interviewerTranscriptEventSchema,
  interviewerAudioStartEventSchema,
  interviewerAudioEndEventSchema,
  transcriptPartialEventSchema,
  transcriptFinalEventSchema,
  rubricUpdatedEventSchema,
  hintResponseEventSchema,
  reviewReadyEventSchema,
  errorEventSchema,
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
