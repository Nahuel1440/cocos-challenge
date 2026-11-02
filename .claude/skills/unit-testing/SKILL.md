---
name: unit-testing
description: "Writes unit tests for the Cocos NestJS API (Vitest, classicist TDD). Use when creating `*.spec.ts` or `*.mother.ts` files, testing entities, domain services or use cases, or mocking a port. MUST be used before implementing or changing a domain rule: the test comes first. Do NOT use for HTTP or database tests (e2e-testing skill)."
---

## Rules

1. **Test behaviour, not implementation.** Assert the output, the thrown error or the resulting state. No test breaks on a refactor that keeps behaviour.
2. Test first: the user names the test, it fails, then the minimum code. If you cannot name the risk a test covers, do not write it.
3. Test entities, domain services and use cases with real logic. Skip getters, DTOs, controllers and repositories (those are e2e).
4. One happy path, one test per error path, one per meaningful edge case. Never assert call order, call counts or internals.
5. Mock only ports, typed `Mocked<T>` (never `as any`). Domain objects and domain services are always real. Build use cases by hand: `new SendOrderUseCase(mockUow, mockOrders, mockMarketData, new SummarizeLedgerService())`.
6. Money is built from strings (`new Decimal('100.10')`), compared with Decimal equality or `.toString()`, never `toBeCloseTo`. JSON-shaped values are decimal strings.

## Files

Specs sit in `__tests__/` next to the code (`src/**/*.spec.ts`). Mothers sit in the `__tests__/` of the domain object they build; a port mock sits in the `__tests__/` of the module that owns the port. Import across modules with `@/`.

## Shape

```typescript
const mockUow: Mocked<UnitOfWork> = { run: vi.fn() };
const useCase = new SendOrderUseCase(mockUow, mockOrders, mockMarketData, new SummarizeLedgerService());

beforeEach(() => {
  vi.resetAllMocks();
  mockUow.run.mockImplementation((work) => work());
});

it('should reject with INSUFFICIENT_FUNDS when cost exceeds available cash', async () => {
  const AVAILABLE_CASH = new Decimal('500.00');
  mockOrders.searchByUser.mockResolvedValue(LedgerEntryMother.withCash(AVAILABLE_CASH));

  const result = await useCase.run(OrderInputMother.marketBuyCosting('800.00'));

  expect(result.getStatus()).toBe('REJECTED');
});
```

- Mocks and the use case at module level, `vi.resetAllMocks()` in `beforeEach`, no `afterEach`. One `describe` per method. Mock return values per test.
- Name tests `should {outcome} when {condition}`.
- Use Object Mothers (valid by default, `create(overrides?)` plus semantic factories such as `limitBuy`). Never rely on a Mother default in an assertion: pass explicit values or use a semantic factory, and name the expected values as constants.
- Assert a port call only when it is the outcome (`save` called with the persisted order); never `toHaveBeenCalled()` alone.
