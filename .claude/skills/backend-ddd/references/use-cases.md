# Use Cases

## Table of Contents

- [Structure](#structure)
- [Naming](#naming)
- [Transactions](#transactions)
- [Error Handling](#error-handling)
- [Mapping DTO to Domain](#mapping-dto-to-domain)
- [Cross-Module Use Cases](#cross-module-use-cases)
- [Testing](#testing)

## Structure

A use case has a single public method, `run()`. It orchestrates domain objects and ports.

```typescript
// src/orders/application/use-cases/cancel-order.use-case.ts
@Injectable()
export class CancelOrderUseCase {
  private readonly logger = new Logger(CancelOrderUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}

  public async run(input: CancelOrderInput): Promise<Order> {
    const { userId, orderId } = input;

    const order = await this.uow.run(async () => {
      await this.orders.lockLedger(userId); // first line: per-user lock, before any read

      const found = await this.orders.findById(orderId);
      if (found.getUserId() !== userId) {
        throw new OrderNotFoundException(orderId); // another user's order looks missing
      }

      const now = new Date(); // app clock, after the lock

      found.cancel(now);

      return this.orders.save(found);
    });

    this.logger.log(`Order ${orderId} cancelled (${order.getStatus()})`);

    return order;
  }
}
```

**Rules:**
- Single method: `run(input)` with one typed input object (not `execute`, not `handle`).
- Destructure the input on the first line of the body when it has more than one field in use.
- Inject ports via `@Inject(TOKEN)` Symbol, never string tokens, never concrete implementations. See [conventions.md](conventions.md#di-token-symbol-not-string).
- No HTTP concerns (no `@Res()`, no status codes, no headers).
- Takes a primitive input object, not the DTO. Returns domain entities, not DTOs; the controller maps with `entity.toPrimitives()`.
- Domain rules live in entities and domain services, never inline in the use case. The use case loads, calls, saves.
- Use `Logger` (backed by Pino), never `console.log`. One outcome line per order.

## Naming

`{Verb}{Noun}UseCase`: the verb describes the action. File `{verb}-{noun}.use-case.ts` in `application/use-cases/`.

| Use case | Class name |
|---|---|
| Send an order | `SendOrderUseCase` |
| Cancel an order | `CancelOrderUseCase` |
| Get the portfolio | `GetPortfolioUseCase` |
| Search instruments | `SearchInstrumentsUseCase` |

Domain services are named the same way with `Service` (`SummarizeLedgerService`) and live in `domain/services/`.

## Transactions

Command use cases own the transaction; repositories never open one. Full rules in [conventions.md](conventions.md#transactions-unit-of-work).

```typescript
return this.uow.run(async () => {
  await this.orders.lockLedger(userId);
  const entries = await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] });
  const price = await this.marketData.searchLatestClose(instrumentId);
  const summary = this.summarizeLedger.run(entries);
  const order = Order.place({
    userId,
    input,
    marketPrice: price,
    availableCash: summary.availableCash,
    availableShares: summary.holdings.get(instrumentId)?.availableQuantity ?? 0,
    now: new Date(),
  });

  return this.orders.save(order);
});
```

- Take the lock for every write path that changes a user's orders: `await this.orders.lockLedger(userId);` is the first line of the work, before any read. A read-only use case runs `uow.run(work, { isolation: 'repeatable-read', readOnly: true })` for one snapshot, with no lock.
- A single-write use case with no lock calls `repo.save` directly.
- Logging and other side effects that must not roll back go after `run` returns.
- A job that processes many users runs one `uow.run` per user, so one failure does not roll back the others.
- Validation reads that do not need the transaction may run before `run`.

## Error Handling

Use cases throw domain exceptions. The global exception filter maps each exception's `ErrorCategory` to the HTTP status (`NotFound` 404, `Conflict` 409, `Unprocessable` 422, `InvalidArgument` 400); the controller never catches.

```typescript
const order = await this.orders.findById(input.orderId); // throws OrderNotFoundException on a miss
```

Use `findById` when absence is an error; use `searchById` plus an explicit branch when absence is a valid case. A rejection is a value, not an exception (see SKILL.md, Rule 3).

## Mapping DTO to Domain

The controller receives the validated DTO and passes primitives to the use case:

```typescript
// src/orders/infrastructure/http/orders.controller.ts
@Post()
public async send(@CurrentUserId() userId: number, @Body() dto: SendOrderDto) {
  const order = await this.sendOrder.run({ userId, ...dto });

  return order.toPrimitives();
}
```

**Flow:** `DTO (validated) -> use case (primitives) -> entity -> repository -> DB`. The use case never sees the DTO class, which keeps `application` independent of `infrastructure`.

## Cross-Module Use Cases

A use case may read from one module and write to another when the operation has a natural home in one module and needs the other as a **precondition check** or **projection**, not as a co-owner of the transaction. Cocos example: `portfolio` reads the ledger that `orders` owns.

- Inject the other module's port; the use case lives in the module that owns the write (or the read, for a projection).
- The importing module lists the other in its `imports`, and the other module exports the port Symbol (and the domain service it shares).
- Import only `@/<other-module>/domain/...`. **Never** import another module's `application/` or `infrastructure/`.
- Dependencies are one-way: `portfolio` imports from `orders`, never the reverse. The one exception to "domain only" is a `*.module.ts` importing the other module's module class.
- Lint cannot see module direction: the review checks it.

| Scenario | Pattern |
|---|---|
| Check that a related aggregate exists before creating yours | Inject the other port, read only |
| Read related data as a projection (the ledger for the portfolio) | Inject the other port or domain service, read only |
| Update two aggregates of different modules atomically | Almost always wrong; split it, or the two belong in one module |

**One aggregate written per use case.** A use case that writes two aggregates in one transaction couples two modules and makes the owning module ambiguous. If you truly need atomicity, the two probably belong in the same module.

## Testing

Strict TDD; see the unit-testing skill for the full method. The points specific to use cases:

- Instantiate the use case manually with mocked ports and **real** domain services: `new SendOrderUseCase(mockUow, mockOrders, mockMarketData, new SummarizeLedgerService())` (`Order.place` is on the entity, so it needs no instance).
- Mock the port interface, not the concrete repository. The mock must match the real port shape (every method of the interface).
- The unit-of-work mock runs `work` and returns its result: `run: vi.fn((work) => work())`. Assert that send and cancel call `lockLedger(userId)` before the first read.
- Assert the outcome: the saved order, the thrown exception, the status. Domain rules are tested in the entity and service specs, not here.
- Test happy path plus each domain exception. Do not assert call order or internal methods.
