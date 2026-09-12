// Validates shared/fixtures/*.json against the Zod schemas. The backend
// side validates the same fixtures against the Pydantic mirror
// (backend/tests/test_event_fixtures.py) — see shared/README.md.
import { describe, expect, it } from "vitest";
import codeUpdateFixture from "../../../shared/fixtures/code_update.json";
import errorFixture from "../../../shared/fixtures/error.json";
import sessionStartFixture from "../../../shared/fixtures/session_start.json";
import sessionStartedFixture from "../../../shared/fixtures/session_started.json";
import { clientEventSchema, serverEventSchema } from "@ai-mock-interview/shared";

describe("shared event fixtures", () => {
  it("session_start.json matches the client event schema", () => {
    expect(() => clientEventSchema.parse(sessionStartFixture)).not.toThrow();
  });

  it("code_update.json matches the client event schema", () => {
    expect(() => clientEventSchema.parse(codeUpdateFixture)).not.toThrow();
  });

  it("session_started.json matches the server event schema", () => {
    expect(() => serverEventSchema.parse(sessionStartedFixture)).not.toThrow();
  });

  it("error.json matches the server event schema", () => {
    expect(() => serverEventSchema.parse(errorFixture)).not.toThrow();
  });
});
