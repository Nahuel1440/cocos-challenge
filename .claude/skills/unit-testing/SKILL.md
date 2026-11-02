---
name: unit-testing
description: "Writes unit tests following classicist TDD for the Cocos hexagonal NestJS API (Vitest). Triggers when creating tests, testing domain rules, entities, value objects or use cases, mocking a port, or creating `*.spec.ts` and `*.mother.ts` files. MUST be used before implementing or changing a domain rule, because the test comes first (strict TDD). Do NOT use for HTTP or database tests (e2e-testing skill)."
---

## When to Use

- Writing unit tests for domain or application layer code
- Deciding whether something needs a unit test or an e2e test
- Creating Object Mothers for test data
- Reviewing existing tests for quality

**Not for:** HTTP or database tests (e2e-testing skill), performance testing.

## Decision Tree: Should I Write This Unit Test?

```
Is it pure logic (no I/O, no DB, no HTTP)?
├─ YES → Is the logic trivial (simple getter, pass-through, single assignment)?
│        ├─ YES → ❌ SKIP — no value
│        └─ NO  → ✅ WRITE unit test
└─ NO  → Does it cross a system boundary (DB, API, filesystem)?
         ├─ YES → ❌ SKIP — use an e2e test instead
         └─ NO  → Can I mock the boundary via a port/interface?
                  ├─ YES → ✅ WRITE unit test with mocked port
                  └─ NO  → ❌ Refactor to inject dependency, then test
```

**Unit vs e2e boundary:** If you need Prisma, a real DB, Docker, or an HTTP server, it is an e2e test, not a unit test.

### What to Test per Layer

| Layer | Test? | What to assert | Mock? |
|---|---|---|---|
| **Value Object** | ✅ Always | Creation, validation, equality, edge cases | Nothing — pure logic |
| **Entity** | ✅ Always | State transitions, invariants, domain rules | Nothing — pure logic |
| **Domain Service** (order validation, ledger calculation) | ✅ Always | Business rules involving multiple entities | Nothing — pure logic |
| **Use Case** | ✅ When orchestration has logic | Output, errors it raises itself, the state it leaves behind | Ports (repositories) |
| **Repository impl** | ❌ Skip | — | e2e test with real DB |
| **Controller** | ❌ Skip | — | e2e test |
| **DTOs / primitive types** | ❌ Skip | Data shapes | — |

### How Many Tests Are Enough?

Happy path + each error path + each domain edge case. **If you can't name the risk a test covers, don't write it.**

```
✅ 1 happy path (correct output)
✅ 1 test per error path (not found, invalid input, rejection reason)
✅ 1 test per meaningful edge case (zero cash, boundary values)
❌ Don't test: logging calls, internal method delegation order, constructor assignments
```

## Critical Rules

1. **Test behavior, not implementation** — Assert what happened (output, thrown error, resulting state), not how it happened
2. **Classicist mocking** — Only mock ports/interfaces (repositories). Domain objects are always real
3. **Manual instantiation** — Create use cases with `new SendOrderUseCase(mockUow, mockOrders, mockMarketData, new SummarizeLedgerService())` (domain services are real); use `Test.createTestingModule` only when the test needs Nest DI
4. **One reason to fail** — Each test should fail for exactly one reason
5. **No test should break on refactor** — If internals change but behavior stays the same, tests must pass

## File Structure

Tests are co-located with the code they test, in `__tests__/`, as `*.spec.ts` (vitest includes `src/**/*.spec.ts`). Mothers live next to the domain object they represent:

```
src/{module}/
├── domain/
│   ├── entities/
│   │   ├── order.entity.ts
│   │   └── __tests__/
│   │       ├── order.entity.spec.ts
│   │       └── order.mother.ts
│   └── services/
│       ├── summarize-ledger.service.ts
│       └── __tests__/
│           └── summarize-ledger.service.spec.ts
├── application/
│   └── use-cases/
│       ├── send-order.use-case.ts
│       └── __tests__/
│           └── send-order.use-case.spec.ts
```

Mothers and mocks are **importable across modules** via `@/` imports.

**Mock placement rule:** Mocks of a port live in the `__tests__/` directory of the **module that owns the port**, not in the consuming test's directory. This makes mocks reusable.

## Test File Structure (AAA)

```typescript
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest'

const mockOrders: Mocked<OrderRepository> = {
  searchByUser: vi.fn(),
  searchById: vi.fn(),
  findById: vi.fn(),
  save: vi.fn(),
}

const mockUow: Mocked<UnitOfWork> = { run: vi.fn() }
const mockMarketData: Mocked<MarketDataRepository> = { searchLatestClose: vi.fn() }
const useCase = new SendOrderUseCase(mockUow, mockOrders, mockMarketData, new SummarizeLedgerService())

beforeEach(() => {
  vi.resetAllMocks()
  mockUow.run.mockImplementation((work) => work())
  mockOrders.save.mockImplementation(async (order) => order)
})

describe('run', () => {
  it('should reject with INSUFFICIENT_FUNDS when cost exceeds available cash', async () => {
    // Arrange
    const AVAILABLE_CASH = new Decimal('500.00')
    const input = OrderInputMother.marketBuyCosting('800.00')
    mockOrders.searchByUser.mockResolvedValue(LedgerEntryMother.withCash(AVAILABLE_CASH))

    // Act
    const result = await useCase.run(input)

    // Assert
    expect(result.getStatus()).toBe('REJECTED')
    expect(result.toPrimitives().rejectionReason).toBe('INSUFFICIENT_FUNDS')
  })
})
```

- Name the variable under test descriptively (`useCase`, `summarizeLedger`, `decideOrder`) — avoid generic `sut`
- Mocks and service instantiated at **module level**, reset with `vi.resetAllMocks()` in `beforeEach`
- One `describe` per method being tested
- **Named constants** for expected values (`AVAILABLE_CASH`) — referenced in both arrange and assert for clarity
- Never use `afterEach` — `vi.resetAllMocks()` in `beforeEach` handles cleanup

## Money in Tests

- Build amounts from strings: `new Decimal('100.10')`, never a JS number.
- Compare with Decimal equality or `.toString()`, never `toBeCloseTo`.
- JSON-shaped values are decimal strings (`"3.33"`), not numbers.

## Object Mother Pattern

Valid-by-default test objects. Callers override only what their test cares about. Prefer **semantic factory methods** that express domain intent.

**Critical: Never assume Mother defaults in tests.** Tests must pass explicit values for anything relevant to the assertion. A reader should understand the test without looking at the Mother.

**Prefer semantic Mother methods over inline overrides.** When a test needs a specific scenario, create a semantic factory method on the Mother rather than passing complex inline overrides:

```typescript
// ❌ BAD — relies on knowing Mother defaults
const entries = LedgerEntryMother.create()
expect(summarizeLedger.run(entries).cash).toEqual(new Decimal('1000.00')) // Where does 1000 come from?

// ⚠️ OK but verbose — explicit overrides, hard to scan
const entries = [LedgerEntryMother.cashIn({ amount: new Decimal('1000.00') })]

// ✅ GOOD — semantic Mother method, test reads like a sentence
const ENTRIES_WITH_1000_CASH = LedgerEntryMother.withCash(new Decimal('1000.00'))

expect(summarizeLedger.run(ENTRIES_WITH_1000_CASH).cash).toEqual(new Decimal('1000.00'))
```

When inline overrides are needed, assign them to **named constants** that describe the scenario, so the test reads top-down without mental math.

```typescript
import { Order } from '@/orders/domain/entities/order.entity'

interface LimitBuyParams {
  price: string
  size: number
}

export class OrderMother {
  public static create(overrides?: Partial<OrderPrimitives>): Order { /* valid defaults, built with Order.fromPrimitives */ }

  public static limitBuy(params: LimitBuyParams): Order {
    const { price, size } = params;
    /* ... */
  }
  public static filledSell(size: number): Order { /* ... */ }
}
```

- One Mother per domain object, co-located in its `__tests__/` directory
- `create(overrides?)` is always the base method
- **Semantic factories** (`limitBuy()`, `filledSell()`) over generic overrides — the name should express domain intent
- Mothers are shared across modules via `@/` imports
- Mothers NEVER depend on other Mothers unless there is a genuine aggregate relationship

## Mocking Ports

Create typed mock objects using `Mocked<T>` from `vitest` — never `as any`. Mock only ports; entities and value objects are always real.

Configure mock return values per-test in the Arrange phase, not in `beforeEach`.

Assert the result, not the interaction. A port call is worth asserting only when it **is** the observable outcome (a write the use case exists to make): then assert the saved value, not the number or order of calls.

```typescript
// ❌ Implementation: breaks if the use case caches or batches reads
expect(mockOrders.searchByUser).toHaveBeenCalledTimes(1)

// ✅ Behavior: the order that was persisted
expect(mockOrders.save).toHaveBeenCalledWith(
  expect.objectContaining({ status: 'FILLED', userId: USER_ID }),
)
```

## Naming Convention

```
should {expected behavior} when {condition/context}
```

| Good | Bad |
|---|---|
| `should reject with INSUFFICIENT_FUNDS when cost exceeds available cash` | `test rejection` |
| `should throw InvalidPrice when price has 3 decimals` | `should validate price` |
| `should not save the order when validation fails` | `should handle errors` |

Start with `should`, describe the **outcome**, include the **condition**. A failing test name should tell you what broke.

## Anti-Patterns

| Anti-Pattern | BAD | GOOD |
|---|---|---|
| **Implementation details** | `expect(mock).toHaveBeenCalledBefore(otherMock)` | `expect(result.cash).toEqual(expected)` |
| **Mock overload** | `{ debit: vi.fn().mockReturnValue(true) }` | `LedgerEntryMother.withCash('1000.00')` |
| **Meaningless assertion** | `expect(mockRepo.save).toHaveBeenCalled()` | `expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'FILLED' }))` |
| **Shared mutable state** | Entries created outside `it()` blocks | Fresh instance per test via Mother |
| **Trivial test** | Testing a simple getter returns what was set | Skip — no logic to verify |
| **Implicit Mother defaults** | `OrderMother.create()` then assert on default values | Use semantic Mother methods or named constants |
| **Verbose inline overrides** | Complex `Mother.create({ ... })` with many params inline | Create a semantic Mother method and assign to a named constant |
| **Money as number** | `new Decimal(100.1)` | `new Decimal('100.10')` |

## Validation Checklist

Run before considering tests done:

```
Test Quality:
- [ ] The user named the test and it failed first
- [ ] Each test has exactly one reason to fail
- [ ] Tests use `should ... when ...` naming
- [ ] No implementation details tested (call order, call counts, internal methods)
- [ ] The test survives a refactor that keeps behavior
- [ ] All error paths covered (invalid input, not found, rejection reasons)
- [ ] Object Mothers used for test data (not inline object literals)
- [ ] Mocks are only on ports/interfaces, never on domain objects
- [ ] Money built from strings, no JS number
- [ ] No shared mutable state between tests
- [ ] Tests pass independently (no order dependency)
- [ ] Can name the specific risk each test covers
```
