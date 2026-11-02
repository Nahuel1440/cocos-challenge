---
name: e2e-testing
description: "Writes Vitest + supertest tests for the Cocos API over HTTP against a real Postgres (Testcontainers) with the seed. MUST be used when writing or editing `test/**/*.e2e-spec.ts`, or when the user says 'e2e test' or 'test this endpoint'. Do NOT use for pure domain logic (unit-testing skill)."
---

Tests go over HTTP (`supertest`) on a Testcontainers Postgres. Run with `npm run test:e2e` (Docker required). Database or unit-of-work tests with no HTTP go in `test/**/*.int-spec.ts` on the same Postgres. Harness in `test/support/`: `postgres-global-setup.ts` starts the container and applies migrations; call `truncateAllTables()` and `reloadSeed()` in `beforeEach`.

Boot the real `AppModule` with the same global pipes and filters as `main.ts`; without them validation and error mapping vanish and 400s become 500s. If no app-boot helper or `supertest` exists yet, STOP and tell the user.

- The seed is the world that already existed (users, instruments, market data); do not recreate it. Anything with business rules goes through the real endpoint (`POST /orders` with a LIMIT, then cancel), never an inserted row. Use real seed user ids.
- Cover 1-2 critical flows per endpoint, the `X-User-Id` check (missing, invalid, unknown → `400`, assert the body `code`), and one validation `400`. Push branch coverage to unit tests.
- Send-order returns `201` for `FILLED`, `NEW` and `REJECTED`; cancel returns `200`, `409`, `404`.
- Concurrency: fire requests with `Promise.all` and assert cash or shares never go below zero. Seed user 1 holds −10 of instrument 31.
- Idempotency: same `Idempotency-Key` and body → original response plus `Idempotent-Replayed: true`; same key, different body → `422`.
- Money in responses is a decimal string; assert strings, never numbers.

```typescript
it('should return 201 FILLED when a MARKET BUY has enough cash', async () => {
  const res = await request(app.getHttpServer())
    .post('/orders').set('X-User-Id', '1')
    .send({ instrumentId: 31, side: 'BUY', type: 'MARKET', size: 1 })
    .expect(201);

  expect(res.body.status).toBe('FILLED');
});
```
