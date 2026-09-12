// Zod mirror of backend/app/interview/schemas.py (source of truth).
// See README.md for the sync policy. The full event catalogue
// (architecture.md §G) is filled in during Phase 3 (real-time transport) —
// this file currently only establishes the pattern every event schema
// should follow, so Phase 3 has a template rather than a blank page.
import { z } from "zod";

export const baseServerEventSchema = z.object({
  seq: z.number().int().nonnegative(),
});

export const errorEventSchema = baseServerEventSchema.extend({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
});

export type ErrorEvent = z.infer<typeof errorEventSchema>;
