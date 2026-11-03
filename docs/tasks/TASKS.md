# TASKS: Portfolio, search and orders API

Implementation slices for the [specification](../SPEC.md), following the task-plan IDs, including T12, T13 and T14. The development plan used test-first acceptance criteria (TDD). The evidence below is source/test inspection, not a fresh runtime test report.

**Status boundary:** T1–T9 and T11–T14 are implemented by current source/test inspection. This means the implementation and relevant assertions were located, not executed in this documentation pass. T10 is delivery documentation. No application tests, build, migration command or benchmark was run for this prose-only reconciliation; documentation checks do not substitute for them.

## Dependency structure

The dependency groups explain the design, not a claim that each group actually ran concurrently or landed in exactly one commit:

1. T1 establishes the app and runners.
2. T2 then T3 establish database/test setup; T14 builds transaction behavior on it. T4 is the shared HTTP boundary. T13 supplies ledger rules before T5 and T7.
3. T6 combines T4, T5 and T14. T8 combines T4 and T7 with database adapters. T9 uses T3 and T4.
4. T11 adds cancellation on the T6/T14 boundary. T12 adds request replay after the order/cancel behavior exists.
5. T10 documents the integrated result.

The layout is domain, application and infrastructure, with HTTP adapters inside infrastructure.

## Implementation slices and acceptance evidence

### T1 · App skeleton
- **Acceptance:** NestJS app wiring, Pino, validation, test runners, lint/type/build commands.
- **Source:** `package.json`, `tsconfig.json`, `vitest.config.mts`, `vitest.config.e2e.mts`, `src/main.ts`, `src/app.module.ts`.
- **Evidence:** `test/app-wiring.e2e-spec.ts`. These tests exercise runtime wiring; static verification commands are listed in the README.
- **Dependency:** none.

### T2 · Local Postgres and migrations
- **Acceptance:** initialize the supplied seed; baseline its original tables; apply ENUMs, required fields, nullable rejection facts, rejection/cancellation CHECKs and user/daily-bar indexes. Idempotency storage is a separate migration in T12.
- **Source:** `docker-compose.yml`, `database.sql`, `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`.
- **Evidence:** `test/support/postgres-global-setup.ts` executes post-baseline SQL migrations against the seed; `test/harness.e2e-spec.ts` checks the migrated rejection reason survives reload. This does not prove the Prisma CLI baseline/deploy sequence was rerun here.
- **Retained pre-check criterion:** before applying constraints to any different database, check distinct enum values, NULLs in fields becoming required, and duplicate instrument/date bars. Compatibility and authorization of a remote database are not presumed or verified by local seed tests.
- **Dependency:** T1.

### T3 · Functional test harness
- **Acceptance:** one throwaway Postgres per test run, migrated seed snapshot, clean data between cases and application boot against that database.
- **Source:** `test/support/postgres-global-setup.ts`, `test/support/create-test-app.ts`, `test/support/truncate-all-tables.ts`, `test/support/reload-seed.ts`.
- **Evidence:** `test/harness.e2e-spec.ts` retains `should keep order 6 REJECTED with INSUFFICIENT_SHARES when the seed is reloaded after a truncate`. The e2e configuration also includes integration specs and disables parallel files sharing that database.
- **Dependency:** T2.

### T4 · Identity, validation, errors and request correlation
- **Acceptance:** every route resolves declared X-User-Id and rejects missing/malformed/unknown users; errors have statusCode/code/message/requestId, unexpected stacks stay server-side, and responses expose X-Request-Id. This is not authentication.
- **Source:** `src/shared/infrastructure/http/`, `src/shared/domain/`, `src/app.module.ts`.
- **Evidence:** `test/app-wiring.e2e-spec.ts`, `test/request-id.e2e-spec.ts`, `src/shared/infrastructure/http/__tests__/http-exception.filter.spec.ts`.
- **Retained named criteria:** `should return the request id in the X-Request-Id header and the error body when a request fails`; `should log the error with its stack and hide it from the response when an unexpected error occurs`.
- **Boundary:** parser errors precede the user guard and preserve their status, including oversized-body 413; an incoming request ID is not trusted as the server correlation ID.
- **Dependency:** T1.

### T13 · Shared ledger summary
- **Acceptance:** `SummarizeLedgerService.run(entries)` takes FILLED/NEW entries and computes total/available cash, holdings, available shares and moving average, replayed by datetime then id. NEW reserves; FILLED settles. Average is null at zero or negative quantity; a later buy crossing positive starts at that buy's price. No market quote or I/O enters the service.
- **Source:** `src/orders/domain/services/summarize-ledger.service.ts`.
- **Evidence:** `src/orders/domain/services/__tests__/summarize-ledger.service.spec.ts`, including `should keep a negative quantity and a null average when a SELL goes below 0` and `should not round the average price`.
- **Dependency:** T1. T5 and T7 consume this shared calculation rather than maintaining two copies.

### T5 · Order rules
- **Acceptance:** `Order.place` decides FILLED/NEW/REJECTED from validated input and available resources, supports quantity/amount, floors whole shares, limits derived size, and preserves unknown price/size on rejection. All four rejection reasons remain part of the contract.
- **Source:** `src/orders/domain/entities/order.entity.ts`.
- **Evidence:** `src/orders/domain/entities/__tests__/order.entity.spec.ts`, including missing-price amount/null-size, below-share MARKET amounts, insufficient cash/shares and negative available-share cases. HTTP request-domain constraints are covered by T6.
- **Dependency:** T13.

### T14 · Transactions and per-user locking
- **Acceptance:** `UnitOfWork.run(work)` supplies READ COMMITTED transaction context; repositories join it. The send/cancel callbacks explicitly call `orders.lockLedger(userId)` first. The UoW does not receive a user ID or acquire the lock automatically; portfolio reads do not use this UoW.
- **Source:** `src/shared/application/unit-of-work.port.ts`, `src/shared/infrastructure/transactions/`, `src/orders/infrastructure/persistence/prisma-order.repository.ts`.
- **Evidence:** `test/shared/unit-of-work.int-spec.ts`, included by `vitest.config.e2e.mts`, includes these integration criteria:
  - `should make the second transaction wait when both lock the same user`
  - `should not block when two transactions lock different users`
  - `should see the row committed by the first transaction when the second was waiting for the lock`
- **Boundary:** same-user writers serialize; independent users need not wait on the same advisory key. This does not assert that any raw external writer is forced to acquire it.
- **Dependency:** T3.

### T6 · POST /orders and mandatory functional test
- **Acceptance:** validate the order body and tradable instrument, execute placement under T14, save the result, and return 201 with Location for FILLED, NEW and REJECTED. Include amount/price limits, exactly one size/amount, LIMIT price, no MARKET price and integer-ID bounds. New orders must not overspend/oversell available resources, including under concurrency.
- **Source:** `src/orders/application/use-cases/send-order.use-case.ts`, `src/orders/infrastructure/http/`, `src/orders/infrastructure/persistence/`.
- **Evidence:** `test/orders.e2e-spec.ts` includes `should return 201 FILLED with a Location when a MARKET BUY has enough cash` and the retained criterion `should fill one order and reject the other with INSUFFICIENT_FUNDS when two concurrent buys only fit one at a time`. Both orders return 201; no assertion selects which request wins. The file also contains a larger competing-buy case, not a production load benchmark.
- **Boundary:** Location names an order URL with no GET endpoint. This remains a limitation, not a completed retrieval feature.
- **Dependencies:** T4, T5, T14.

### T7 · Portfolio calculation
- **Acceptance:** build market values, total value and total return percentage from ledger plus quotes. Average 100, price 110 yields 10 percent. Missing quotes produce null value/return and a partial total; negative inherited holdings retain negative value and null cost-based return. Return uses the unrounded average; presentation rounds output.
- **Source:** `src/portfolio/domain/services/build-portfolio.service.ts`, `src/portfolio/infrastructure/http/portfolio.presenter.ts`, `src/shared/infrastructure/http/to-decimal-string.ts`.
- **Evidence:** `src/portfolio/domain/services/__tests__/build-portfolio.service.spec.ts`, `src/portfolio/infrastructure/http/__tests__/portfolio.presenter.spec.ts`.
- **Dependency:** T13.

### T8 · GET /portfolio
- **Acceptance:** load FILLED and NEW orders once for consistent cash/reservations, then read instrument names/quotes and return the portfolio contract. No global transaction or lock exists across these reads.
- **Source:** `src/portfolio/application/use-cases/get-portfolio.use-case.ts`, `src/portfolio/infrastructure/persistence/`, `src/portfolio/infrastructure/http/`.
- **Evidence:** `test/portfolio.e2e-spec.ts`, `src/portfolio/application/use-cases/__tests__/get-portfolio.use-case.spec.ts`. The HTTP file checks the seed portfolio and a position whose real query has no quote; the use-case test checks a single orders read. No test is claimed to prove an atomic ledger/quote snapshot.
- **Dependencies:** T4, T7, T3 for database/harness.

### T9 · GET /instruments?query=
- **Acceptance:** trimmed case-insensitive ticker/name search; escape LIKE wildcards, exclude MONEDA, rank exact ticker/prefix/name prefix/substring, then ticker/id. Missing query is 400; empty input is an empty list without a repository call.
- **Source:** `src/instruments/application/use-cases/search-instruments.use-case.ts`, `src/instruments/infrastructure/persistence/prisma-instrument.repository.ts`.
- **Evidence:** `test/instruments.e2e-spec.ts` plus `src/instruments/application/use-cases/__tests__/search-instruments.use-case.spec.ts`. Retained named criteria:
  - `should reject with 400 VALIDATION_ERROR when the query parameter is missing`
  - `should return an empty list without querying the database when the query is empty or only spaces`
  - `should not return MONEDA instruments when the query matches ARS`
  - `should rank an exact ticker match first, then ticker prefix, then name prefix, then substring when several instruments match`
  - `should match ticker and name ignoring case when the query mixes upper and lower case`
  - `should return an empty list when the query is only a LIKE wildcard such as % or _`
- **Dependencies:** T3, T4.

### T11 · POST /orders/:id/cancel
- **Acceptance:** lock before loading the owned order; NEW becomes CANCELLED with an app-clock cancellation time; repeated CANCELLED returns 200 unchanged; FILLED/REJECTED gives 409; missing/another user's gives 404. Release either cash or share reservations without another balance update. Log after the successful UoW returns.
- **Source:** `src/orders/application/use-cases/cancel-order.use-case.ts`, `src/orders/domain/entities/order.entity.ts`, `src/orders/infrastructure/http/orders.controller.ts`.
- **Evidence:** `test/cancel-order.e2e-spec.ts` covers all these state/ownership cases and both reservation types. Retained concurrent criterion: `should fill the buy or reject it with INSUFFICIENT_FUNDS, consistent with the final cash, when a cancel of a NEW LIMIT buy and a MARKET buy run concurrently`.
- **Proof boundary:** that race checks valid final outcomes; it alone does not demonstrate that removing cancel's lock would make the test fail. The lock's transaction semantics also have T14 integration evidence.
- **Dependency:** T6.

### T12 · Idempotent POST /orders
- **Acceptance:** optional UUID key, lookup after lock and before repricing, same-user/key/input replay with Idempotent-Replayed, changed input 422, and atomic order/response persistence. Replay must return the original result after cancellation or changed funds; invalid requests must not consume the key. Idempotency is included in the delivery; clients may omit the key.
- **Source:** `src/orders/application/use-cases/send-order.use-case.ts`, `src/orders/infrastructure/persistence/prisma-idempotency.repository.ts`, `prisma/migrations/20261102000000_idempotency_requests/migration.sql`.
- **Evidence:** `test/idempotency.e2e-spec.ts`, `test/idempotency-rollback.e2e-spec.ts`. The latter retains `should roll back the order and the idempotent response when saving the response fails`; retry/concurrent-key tests assert a single order and the stored response.
- **Dependencies:** T6 and the integrated T11 lifecycle.

### T10 · Delivery README
- **Acceptance:** runnable local setup, seeded response, API examples/Postman, explicit functional test command, concise architecture tradeoff, observable assumptions, seed anomaly and operational limits. Detailed contract/decisions live in SPEC rather than a duplicate README table.
- **Source:** `README.md`, `cocos-api.postman_collection.json`.
- **Evidence:** documentation-only structural checks: diff whitespace, relative links/anchors, JSON parsing, Bash syntax, referenced IDs/paths/test names and cross-document source readback. Runtime commands remain instructions to run, not green results from this pass.
- **Dependencies:** integrated T6, T8, T9, T11 and T12.

## Original cut candidates and actual disposition

| ID | Original candidate | Current disposition |
|----|--------------------|---------------------|
| C1 | Idempotency | Delivered as mandatory T12; header optional. No longer a cut. |
| C2 | REST Client collection | Replaced by the supplied Postman collection, plus README curl examples. |
| C3 | Cursor pagination | Not built; search is unpaginated. |
| C4 | Index measurement | A development-session experiment is recorded; scripts/raw outputs are not delivered and were not rerun here. See SPEC Measurement boundary for limitations. |

## Verification and remaining boundaries

For current runtime proof, run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck` and `npm run build`; the focused order command is in the README. Test presence above is source evidence, not a historical or fresh passing count.

The shared ledger calculation belongs to T13/D-32. Search pagination, automatic LIMIT execution, a complete historical audit trail, a global portfolio snapshot and production throughput guarantees are not claimed. Historical development measurements do not establish POST or contention capacity.
