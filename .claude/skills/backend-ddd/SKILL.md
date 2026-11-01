---
name: backend-ddd
description: "Fixes where code goes in the Cocos hexagonal NestJS API: module layout, domain services as classes, entities, ports with Symbol tokens, dumb Prisma repositories, use cases and controllers. MUST be used before creating or moving a file under `src/`, or when adding a module, entity, domain service, port, repository, use case, controller or DTO, or when the user says 'new module', 'add use case', 'where does this go'. Do NOT use for writing tests (unit-testing, e2e-testing skills)."
---

Each module has three layers: `domain` (rules), `application` (use cases), `infrastructure` (Prisma and HTTP). If this skill and `docs/SPEC.md` disagree, SPEC wins: STOP and tell the user. Cocos has no soft delete, no criteria builder and no domain events: do not add them.

## Layout

```
src/<module>/
├── domain/
│   ├── entities/        # Order: identity + state transitions
│   ├── value-objects/   # only when a value has its own invariant (none today)
│   ├── services/        # SummarizeLedgerService, DecideOrderService: the business rules
│   ├── ports/           # OrderRepository interface + ORDER_REPOSITORY symbol
│   └── exceptions/      # OrderNotFoundException
├── application/
│   └── use-cases/       # SendOrderUseCase, CancelOrderUseCase
├── infrastructure/
│   ├── persistence/     # PrismaOrderRepository
│   └── http/            # OrdersController, SendOrderDto
└── <module>.module.ts
```

Modules: `orders`, `portfolio`, `instruments`, plus `src/shared` with the same layout. Create only the folders a module uses: `instruments` needs `ports/`, `use-cases/`, `persistence/` and `http/`, nothing else.

- `src/shared/domain/ports/`: `UserRepository` + `USER_REPOSITORY`, `UnitOfWork` + `UNIT_OF_WORK` (transaction and per-user lock).
- `src/shared/infrastructure/http/`: the `X-User-Id` guard, the exception filter, the request id.

| Layer | May import | Never imports |
|---|---|---|
| `domain/` | `decimal.js`, domain code (its own, `@/shared/domain`, other modules' `domain/`) | `@nestjs/*`, `@prisma/client`, application, infrastructure |
| `application/` | domain (ports included, e.g. `UnitOfWork`), `@nestjs/common` (`Injectable`, `Inject`, `Logger`) | infrastructure, Prisma, DTOs |
| `infrastructure/` | anything | — |

Import with `@/` (lint blocks `..`). Across modules, import only `@/<other>/domain/...`; `portfolio` imports from `orders`, never the reverse: `orders` owns the ledger.

## Rule 1: Business rules live in domain services

A rule over several orders or several inputs is a domain service: a class in `domain/services/` named `{Verb}{Noun}Service` with exactly ONE public method, `run(params)`. No exported free functions in `domain/`. A domain service is stateless, has an empty constructor, does no I/O and has no decorators. It takes what it needs as arguments; the use case chains services. Cocos has three: `SummarizeLedgerService` (cash, holdings, average price), `DecideOrderService` (`FILLED`, `NEW` or `REJECTED`), `BuildPortfolioService` (positions and returns). File names follow the class: `summarize-ledger.service.ts`.

```typescript
// src/orders/domain/services/summarize-ledger.service.ts
export class SummarizeLedgerService {
  public run(entries: LedgerEntry[]): LedgerSummary {
    const state = this.emptyState();
    for (const entry of this.replayOrder(entries)) this.apply(state, entry); // oldest first
    return this.toSummary(state);
  }

  private replayOrder(entries: LedgerEntry[]): LedgerEntry[] { /* datetime ASC, id ASC */ }
}
```

A domain service never injects a port and never does I/O: the use case loads the data and passes it in. Helpers are `private` methods; `run` is the only public one. Data shapes the service takes or returns (`LedgerEntry`, `LedgerSummary`) are exported interfaces in the same file. Nest registers it as a plain provider (`providers: [SummarizeLedgerService]`); it needs no `@Injectable()` because its constructor is empty.

## Rule 2: Entities own their state changes

A rule about one order is a method on the `Order` entity. Entities are exempt from the one-public-method rule: they may have several.

```typescript
// src/orders/domain/entities/order.entity.ts
public cancel(now: Date): void {
  if (this.props.status === 'CANCELLED') return; // already cancelled: a retry changes nothing
  if (this.props.status !== 'NEW') throw new OrderNotCancellableException(this.props.id);
  this.props.status = 'CANCELLED';
  this.props.cancelledAt = now; // app clock, after the lock
}
```

## Rule 3: A rejection is a value, an error is an exception

`REJECTED` is a stored order and a `201`: `DecideOrderService.run` returns it, never throws it. Throw only when the request fails. Domain exceptions extend `DomainException` from `@/shared/domain` with a stable `code`; the global exception filter renders the error body. Never extend Nest's `HttpException` in `domain/`.

```typescript
// src/orders/domain/exceptions/order-not-found.exception.ts
export class OrderNotFoundException extends DomainException {
  constructor(id: number) {
    super('ORDER_NOT_FOUND', `Order ${id} not found`, 404);
  }
}
```

## Rule 4: Ports are interfaces plus a Symbol token

```typescript
// src/orders/domain/ports/order.repository.ts
export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface FindByUserParams {
  userId: number;
  statuses: OrderStatus[];
}

export interface OrderRepository {
  findByUser(params: FindByUserParams): Promise<LedgerEntry[]>;
  findById(id: number): Promise<Order | null>;
  save(order: Order): Promise<Order>;
}
```

Inject with `@Inject(ORDER_REPOSITORY)`. An interface is erased at runtime, so injecting by its type alone fails. The module exports the symbol when another module needs the port.

## Rule 5: Repositories are dumb

A repository maps rows to domain objects and back, and runs the query it is given. It never decides a status, a balance, a rejection or which orders count.

```typescript
await this.orders.findByUser({ userId, statuses: ['FILLED', 'NEW'] }); // ✅ the caller picks
await this.orders.findAvailableCash(userId); // ❌ SUM(size * price) in SQL: a rule in the repository
```

Map in `private toDomain()` / `toRow()` methods; no mapper class. The domain never sees Prisma types: build `new Decimal(row.price.toString())` here; money is decimal.js, never `number`. Repositories join the current transaction (`@nestjs-cls/transactional`); they never open one.

## Rule 6: Use cases orchestrate, controllers call use cases

A use case takes a primitive input (not the DTO), loads through ports, calls domain services and entities, saves through ports, runs inside `UnitOfWork.run` when it needs one transaction (send and cancel take the per-user lock; the portfolio reads one snapshot) and logs one outcome line per order. A controller validates the DTO, calls one use case and shapes the JSON: no repository, no domain service, no `try/catch`. Money leaves as a string rounded once there, `ROUND_HALF_UP` to 2 decimals.

```typescript
// src/orders/application/use-cases/send-order.use-case.ts
@Injectable()
export class SendOrderUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(MARKET_DATA_REPOSITORY) private readonly marketData: MarketDataRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
    private readonly decideOrder: DecideOrderService,
  ) {}

  public run(input: SendOrderInput): Promise<Order> {
    return this.uow.run(input.userId, async () => { // per-user lock
      const entries = await this.orders.findByUser({ userId: input.userId, statuses: ['FILLED', 'NEW'] });
      const price = await this.marketData.findLatestClose(input.instrumentId);
      const summary = this.summarizeLedger.run(entries);
      const now = new Date();
      return this.orders.save(this.decideOrder.run({ input, summary, price, now }));
    });
  }
}
```

Wiring: `providers: [SendOrderUseCase, SummarizeLedgerService, DecideOrderService, { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }]`, `exports: [ORDER_REPOSITORY, SummarizeLedgerService]` so `portfolio` can read the ledger.

## Naming

| Kind | File | Class |
|---|---|---|
| Entity | `order.entity.ts` | `Order` |
| Domain service | `summarize-ledger.service.ts` | `SummarizeLedgerService`, method `run` |
| Port | `order.repository.ts` | `OrderRepository` + `ORDER_REPOSITORY` |
| Exception | `order-not-found.exception.ts` | `OrderNotFoundException` |
| Use case | `send-order.use-case.ts` | `SendOrderUseCase`, method `run` |
| Repository | `prisma-order.repository.ts` | `PrismaOrderRepository` |
| Controller, DTO | `orders.controller.ts`, `send-order.dto.ts` | `OrdersController`, `SendOrderDto` |

## Rule 7: Members and parameters

- Every class member states `public`, `private` or `protected`. Nest DI constructor parameter properties are `private readonly`.
- A domain service or use case has exactly ONE public method, `run`. Entities may have several.
- A method or function with more than one parameter takes one `params` object typed by a named interface (no inline object types). Destructure it on the FIRST line of the body, never in the signature. The id travels inside the object, never next to it. Exempt: NestJS DI constructors and inline arrow callbacks (`.map(({ x }) => ...)`).
- Name a value before passing it: no inline `new Date()` or unexplained literals at the call site.

```typescript
// Bad: destructured in the signature, inline object type, positional id next to the object
public run({ input, summary }: { input: SendOrderInput; summary: LedgerSummary }, price: Decimal): Order { ... }

// Good: named interface, destructured on the first line
public run(params: DecideOrderParams): Order {
  const { input, summary, price, now } = params;

  return this.applyRules({ input, summary, price, now });
}
```

ESLint enforces `public`/`private` on every member, one public method in services and use cases, and a single parameter on their methods. It cannot check "destructure on the first line": the review checks it.

Tests: unit-testing skill (services, entities, use cases with mocked ports), e2e-testing skill (HTTP and database).

## Checklist

```
- [ ] The file sits in the layout above; no empty folders
- [ ] No decorators, Nest or Prisma imports in domain/
- [ ] Business rules are a domain service (`{Verb}{Noun}Service.run`) or an entity method
- [ ] Every member has `public`/`private`; services and use cases have one public method, `run`
- [ ] More than one parameter: one `params` interface, destructured on the first line of the body
- [ ] Domain services inject no port and do no I/O
- [ ] Ports are an interface + Symbol, injected with @Inject(TOKEN)
- [ ] Repositories only map and query
- [ ] Controllers inject use cases only
```
