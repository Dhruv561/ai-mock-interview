# shared

Hand-mirrored client/server event contracts.

`events.ts` (Zod schemas + inferred TS types) is the extension-side copy of the
event catalogue defined in `backend/app/interview/schemas.py` (Pydantic
models — the source of truth). There is no codegen between them; see
`architecture.md` §1 for why that tradeoff was made deliberately for an
MVP with a small, stable event catalogue.

## How drift is caught

`shared/fixtures/*.json` holds example payloads for every event type. Both
sides validate every fixture in their own test suite:

- backend: `uv run pytest` loads each fixture and validates it against the
  matching Pydantic model
- extension: `npm run test` loads each fixture and validates it against the
  matching Zod schema

If one side's schema drifts from the other, the fixture that exercises the
changed field fails on whichever side wasn't updated — that's the signal to
fix the mirror, not to add tooling.

## When to touch this

Any time an event type in `backend/app/interview/schemas.py` changes shape,
update `events.ts` in the same commit, and add/update the matching fixture.
