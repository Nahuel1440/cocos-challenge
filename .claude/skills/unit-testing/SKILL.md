---
name: unit-testing
description: "Writes Vitest unit specs for the Cocos NestJS API (hexagonal): which layer owns each rule, test-data factories, typed mocked ports, Decimal assertions. MUST be used before implementing or changing a domain rule, entity, value object or use case (T5, T7, and the error mapping of T4), because the spec comes first (strict TDD), even when the user never says 'test'. Also use when the user says 'write a test', 'unit test this', or mocks a port, and when creating or editing `*.spec.ts` or `*.mother.ts` files. Do NOT use for HTTP or database tests (e2e-testing skill) or questions that do not change code."
---

Strict TDD (CLAUDE.md): the user names every test, you write one failing test, then the minimum code. This skill covers how to write them. Specs live in `__tests__/` beside the code and match `src/**/*.spec.ts`.

## What each layer's spec covers

| Layer | Unit spec? | Asserts | Mocks |
|---|---|---|---|
| Domain rules (send-order T5, portfolio T7) | Always | Outcomes, rejection reasons, invariants | Nothing |
| Value object / entity | When there is logic | Validation, state transitions, the domain exceptions it throws | Nothing |
| Use case | When it orchestrates | Which port is called with what, errors it raises itself, output | Ports only |
| Repository, controller, DTO | No | Covered over HTTP by the e2e-testing skill | — |

How many: one happy path, one test per error path or rejection reason, one per real edge case. If you cannot name the risk a test covers, do not write it. Do not test getters, logging or call order.

## Bootstrap

- **Domain code**: build with `new` or a factory. No DI.
- **Use cases**: `new MyService(mockRepo)`. Use `Test.createTestingModule` only when the test needs Nest DI.

Build mocks at module level as `Mocked<Port>` (from `vitest`) with each method a `vi.fn()`. Call `vi.resetAllMocks()` in `beforeEach`, and set return values inside each test. Never `as any`.

## Test data

- Small factory functions in `__tests__/` (a `*.mother.ts` if shared) that build valid defaults. Name them after domain intent (`limitBuy()`).
- Pass explicit values for anything an assertion depends on. A test must not rely on a default the reader cannot see.

## Money in tests

- Build amounts from strings: `new Decimal('100.10')`, never a JS number (D-1, NFR-2).
- Compare with Decimal equality or `.toString()`, never `toBeCloseTo`.
- JSON-shaped values (`"3.33"`) are strings (D-23). Rounding: see SPEC; if the mode is not there, STOP and ask.

## Mocking ports

Mock only ports (names below are illustrative). Entities and value objects are always real. Pin the input the port received, not only the output:

```typescript
// ❌ passes even if the use case loads the wrong user's ledger
ledger.findByUser.mockResolvedValue(emptyLedger());
await service.run(input);

// ✅ also pins the input
expect(ledger.findByUser).toHaveBeenCalledWith(USER_ID);
```

## Naming

`should {outcome} when {condition}`, e.g. `should reject with INSUFFICIENT_FUNDS when cost exceeds available cash`. A failing name must say what broke. Use named constants (`EXPECTED_CASH`) in both arrange and assert.

## Checklist

```
- [ ] The user named the test; it failed first
- [ ] One reason to fail per test
- [ ] Only ports mocked; domain objects real
- [ ] Money built from strings, no JS number
- [ ] No test depends on another's state or on order
```
