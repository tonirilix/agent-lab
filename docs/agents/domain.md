# Domain Docs

Before exploring the codebase, engineering skills should read:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If these files do not exist, proceed silently. Domain-modeling skills create them lazily when terminology or architectural decisions are resolved.

## Layout

This is a single-context repository:

/
├── CONTEXT.md
├── docs/adr/
└── src/

Use terminology defined in `CONTEXT.md`. If work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
