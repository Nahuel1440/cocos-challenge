---
name: e2e-testing
description: "Writes Vitest + supertest functional tests for the Cocos API over HTTP against a real Postgres (Testcontainers) with the seed. MUST be used when writing or editing `test/**/*.e2e-spec.ts` files (T6, T8, T9, T11), testing an endpoint or HTTP flow, or when the user says 'e2e test', 'functional test', 'test this endpoint'. Do NOT use for pure domain logic (unit-testing skill)."
---

Decision D-19: tests go over HTTP (`supertest`) on a Testcontainers Postgres, truncating and reloading the seed between tests. Run with `npm run test:e2e` (`vitest.config.e2e.mts`, glob `test/**/*.e2e-spec.ts`). Docker is required.

## Harness (built in T3)

| Piece | Role |
|---|---|
| `test/support/postgres-global-setup.ts` | Starts one Testcontainers Postgres per suite and applies the migrations. |
| `test/support/truncate-all-tables.ts` | Empties every table. Call it in `beforeEach`. |
| `test/support/reload-seed.ts` | Reloads the seed after the truncate. Call it in `beforeEach`. |

Boot the real `AppModule` with the same global pipes and filters as `main.ts`. If a test app skips them, validation and error mapping vanish silently and 400s turn into 500s. TASKS lists no app-boot helper: if none exists yet, STOP and ask the user where it lives. `supertest` is not in `package.json` yet; if it is still missing, STOP and tell the user.

## Pattern

```typescript
describe('POST /orders (e2e)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await reloadSeed();
  });

  it('should return 201 FILLED when a MARKET BUY has enough cash', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('X-User-Id', '1')
      .send({ instrumentId: 31, side: 'BUY', type: 'MARKET', size: 1 })
      .expect(201);

    expect(res.body.status).toBe('FILLED');
  });
});
```

## Fixture policy

- The seed is "the world that already existed" (users, instruments, market data). Do not recreate it by hand.
- Anything with business rules (creating, rejecting, cancelling an order) goes through the real endpoint, so the test also exercises validation and domain logic.
- Seed user ids must be real rows. Never fabricate an id for a flow that writes rows.
- Assert side effects by reading the database when the response body is not the contract under test.

## What to cover

- 1–2 critical flows per endpoint. Push branch coverage down to unit tests.
- The `X-User-Id` check on every route: missing or invalid → `400` (D-22).
- One input-validation `400` per endpoint (D-8, D-23).
- Status codes as SPEC says: send-order `201` for `FILLED`, `NEW` and `REJECTED` (D-17); cancel `200`, `409`, `404` (D-18).
- NFR-1: fire concurrent orders with `Promise.all` and assert cash or shares never go below zero. Mind that the seed has user 1 with holding −10 on instrument 31 (SPEC, seed pitfalls).
- Money in responses is a decimal string (D-23). Assert strings, never numbers.

## Anti-patterns

| Anti-pattern | Instead |
|---|---|
| Hand-rolled app that skips `main.ts` pipes and filters | Boot with the same pipes and filters as main.ts |
| Inserting an order row to test cancelling it | `POST /orders` with a LIMIT, then cancel |
| 15 e2e cases per endpoint | 1–2 flows + header and validation checks |
| State shared between tests | Truncate and reload the seed in `beforeEach` |

## Checklist

```
- [ ] App booted with the same pipes and filters as main.ts
- [ ] truncate + reload seed in beforeEach
- [ ] Business actions go through real endpoints
- [ ] X-User-Id missing/invalid → 400 covered
- [ ] Validation 400 covered
- [ ] Money asserted as decimal strings
```
