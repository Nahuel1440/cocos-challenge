# TASKS: Portfolio, search and orders API

Size S tasks, in order, from [SPEC.md](../SPEC.md). Each task fits in one commit of ≤ 400 lines. The structure follows gamora-sv: `src/<module>/{domain,application,infrastructure}`, with `src/shared` and `test/support`.

> **Tests:** the user writes the case names before starting each task (TDD). `no-test` = pure infrastructure.

## Order and parallelism

1. T1
2. In parallel: {T2 → T3}, T4, T5, T7
3. In parallel: T6 (T3 + T4 + T5), T8 (T3 + T4 + T7), T9 (T3 + T4)
4. T11 (T6)
5. T10

## Tasks

### T1 · App skeleton
- **Goal:** NestJS 11 app that starts, with Pino, Vitest and lint.
- **Where it lives:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/main.ts`, `src/app.module.ts`.
- **Tests:** `no-test`.
- **Depends on:** —

### T2 · Local Postgres + migrations
- **Goal:** Postgres in Docker loaded with `database.sql`; Prisma (`db pull` + `@map`) and one migration with the SPEC changes: ENUMs, `NOT NULL`, `CHECK` from D-21, `rejection_reason` column, indexes from D-13.
- **Where it lives:** `docker-compose.yml`, `database.sql`, `prisma/schema.prisma`, `prisma/migrations/`, `.env.example`.
- **Tests:** `no-test` (verified by applying the migration on the seed).
- **Depends on:** T1. **Parallel with:** T4, T5, T7.

### T3 · Functional test harness
- **Goal:** Testcontainers Postgres per suite; truncate and reload the seed between tests (D-19).
- **Where it lives:** `test/support/postgres-global-setup.ts`, `test/support/truncate-all-tables.ts`, `test/support/reload-seed.ts`.
- **Tests:** `no-test` (a smoke test that starts the app and queries the database).
- **Depends on:** T2.

### T4 · `X-User-Id` guard and error mapping
- **Goal:** a guard that reads `X-User-Id` (missing or invalid → `400`, D-22) and a `DomainException` → HTTP filter with no stack traces (NFR-6).
- **Where it lives:** `src/shared/infrastructure/http/`, `src/shared/domain/{ports,exceptions}/`.
- **Tests:** _(named by the user)_
- **Depends on:** T1. **Parallel with:** T2, T5, T7.

### T5 · Send-order rules (pure domain)
- **Goal:** given the user's ledger and the order, decide `FILLED` / `NEW` / `REJECTED` + reason: available cash and shares with reservations (D-6), `size` from `amount` with floor, the four `rejection_reason` values (D-20), all with decimal (D-1).
- **Where it lives:** `src/orders/domain/`.
- **Tests:** _(named by the user)_
- **Depends on:** T1. **Parallel with:** T2, T4, T7.

### T6 · `POST /orders` endpoint + mandatory functional test
- **Goal:** body validation (D-8, D-23), transaction with `pg_advisory_xact_lock(userId)` (D-9), insert the order, `201` + `Location` (D-17).
- **Where it lives:** `src/orders/{application,infrastructure}/`, `test/orders.e2e-spec.ts`.
- **Tests:** _(named by the user; includes the functional test the brief asks for)_
- **Depends on:** T3, T4, T5. **Parallel with:** T8, T9.

### T7 · Portfolio calculation (pure domain)
- **Goal:** holding, moving average (D-5), market value, total return `"3.33"` (D-23), positions without a price as `null` (D-26), total value (D-7).
- **Where it lives:** `src/portfolio/domain/`.
- **Tests:** _(named by the user)_
- **Depends on:** T1. **Parallel with:** T2, T4, T5.

### T8 · `GET /portfolio` endpoint
- **Goal:** read `FILLED` + `NEW` orders and the latest `marketdata` in a single read transaction (NFR-5) and return the SPEC contract.
- **Where it lives:** `src/portfolio/{application,infrastructure}/`, `test/portfolio.e2e-spec.ts`.
- **Tests:** _(named by the user)_
- **Depends on:** T3, T4, T7. **Parallel with:** T6, T9.

### T9 · `GET /instruments?q=` endpoint
- **Goal:** `ILIKE` on `ticker` and `name` with escaped wildcards, response `{ "instruments": [...] }` (D-24).
- **Where it lives:** `src/instruments/`, `test/instruments.e2e-spec.ts`.
- **Tests:** _(named by the user)_
- **Depends on:** T3, T4. **Parallel with:** T6, T8.

### T11 · Mandatory cancellation: `POST /orders/:id/cancel`
- **Objective:** implement FR-4 using the declared `X-User-Id` identity (D-22) and a transaction with `pg_advisory_xact_lock(userId)` shared with send-order (D-9).
- **Location:** `src/orders/{domain,application,infrastructure}/`, `test/orders.e2e-spec.ts`.
- **Tests:** _(case names are written by the user before implementation, as required above)_
- **Acceptance:** an order owned by the declared user in `NEW` becomes `CANCELLED` and returns `200` with the order; an owned order in any other status returns `409`; a missing order or one owned by another user returns `404`. Cancelling a BUY releases its reserved cash and cancelling a SELL releases its reserved shares through the existing derived-balance model: only the order status changes; no separate balance is updated (D-6, NFR-4).
- **Depends on:** T6.

### T10 · README
- **Goal:** how to run the app and the tests, key decisions, assumptions (D-26, seed with holding −10, questions for Emi), what was left out (O-1..O-10) and the cuts not made.
- **Where it lives:** `README.md`.
- **Tests:** `no-test`.
- **Depends on:** T6, T8, T9, T11.

## Cut list (in order: the top one is cut first)

| # | Task | If it does not fit |
|---|-------|-------------|
| C1 | Idempotency with `idempotency_requests` (D-27) | Design in the README |
| C2 | REST Client collection (`.http`) | `curl` examples in the README |
| C3 | Cursor pagination in search (D-24) | Mentioned in the README |
| C4 | Index measurement (D-14) | Mentioned in the README |

## Open question

- T5 and T7 compute the same holding and the same cash from `orders`. Where does that shared calculation live?
