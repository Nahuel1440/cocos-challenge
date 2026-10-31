# Cocos challenge API

NestJS 11 + Prisma + Postgres. Portfolio, instrument search, MARKET/LIMIT orders, cancellation.

## Commands

`npm run` + `build`, `lint`, `typecheck`, `test` (unit), `test:e2e`, `start:dev`.
Docker and seed commands arrive with T2 (not here yet).

## Contract

- [docs/SPEC.md](docs/SPEC.md) and [docs/tasks/TASKS.md](docs/tasks/TASKS.md) are the source of truth.
- If a decision is not in SPEC, STOP and ask the user. Do not invent it.
- Docs are in English. Do not edit `docs/` from a code task.

## Rules

- **Money:** never a JS `number` for money or prices. Use Decimal; JSON carries decimal strings (D-1, D-23). Rounding: see SPEC; if the mode is not there, STOP and ask.
- **Ledger:** cash and holdings are derived from `orders`, never stored. Orders are immutable; the only change is `NEW → CANCELLED` (NFR-4).
- **Errors:** domain exceptions map to HTTP as SPEC says (D-8, D-17, D-18, D-22, D-27). No stack traces in responses (NFR-6).
- **Seed trap:** lowercase DB columns (`instrumentid`, `previousclose`). Prisma needs `db pull` + `@map`.

## Code

- Imports use `@/*` (maps to `src/*`). Log with the Nest `Logger`/Pino, never `console.log`.
- Layers: `src/<module>/{domain,application,infrastructure,presentation}` (TASKS).
- Unit specs in `__tests__/` beside the code. E2E specs in `test/*.e2e-spec.ts`.

## Process

- Strict TDD: one failing test first. The user names every test.
- Testing rules: `.claude/skills/unit-testing` and `.claude/skills/e2e-testing`.
- Conventional commits. No `Co-Authored-By` or AI attribution.
