---
name: backend-ddd
description: "Fixes where code goes in the Cocos hexagonal NestJS API: module layout, domain services as classes, entities, ports with Symbol tokens, dumb Prisma repositories, use cases and controllers. MUST be used before creating or moving a file under `src/`, or when adding a module, entity, domain service, port, repository, use case, controller or DTO, or when the user says 'new module', 'add use case', 'where does this go'. Do NOT use for writing tests (unit-testing, e2e-testing skills)."
---

Each module has three layers: `domain` (rules), `application` (use cases), `infrastructure` (Prisma and HTTP). If this skill and `docs/SPEC.md` disagree, SPEC wins: STOP and tell the user.

## Layout

```
src/<module>/
├── domain/
│   ├── entities/        # Order: identity + state transitions
│   ├── value-objects/   # only when a value has its own invariant (none today)
│   ├── services/        # LedgerService, OrderDecisionService: the business rules
│   ├── ports/           # OrderRepository interface + ORDER_REPOSITORY symbol
│   └── exceptions/      # OrderNotFoundException
├── application/
│   └── use-cases/       # SendOrderUseCase, CancelOrderUseCase
├── infrastructure/
│   ├── persistence/     # PrismaOrderRepository
│   └── http/            # OrdersController, SendOrderDto
└── <module>.module.ts
```

Modules: `orders`, `portfolio`, `instruments`, plus `src/shared` (`DomainException`, `UnitOfWork`, user guard). Create only the folders a module uses: `instruments` needs `ports/`, `use-cases/`, `persistence/` and `http/`, nothing else.

| Layer | May import | Never imports |
|---|---|---|
| `domain/` | `decimal.js`, domain code (its own, `@/shared/domain`, other modules' `domain/`) | `@nestjs/*`, `@prisma/client`, application, infrastructure |
| `application/` | domain, `@nestjs/common` (`Injectable`, `Inject`, `Logger`), shared `UnitOfWork` | infrastructure, Prisma, DTOs |
| `infrastructure/` | anything | — |

Import with `@/` (lint blocks `..`). Across modules, import only `@/<other>/domain/...`; `portfolio` imports from `orders`, never the reverse (D-32).

## Rule 1: Business rules live in domain services

A rule over several orders or several inputs is a method of a class in `domain/services/`. No exported free functions in `domain/`. A domain service is stateless, has an empty constructor, does no I/O and has no decorators. It takes what it needs as arguments; the use case chains services. Cocos has three: `LedgerService.summarize` (T13), `OrderDecisionService.decide` (T5), `PortfolioService.build` (T7).

```typescript
// src/orders/domain/services/ledger.service.ts
export class LedgerService {
  summarize(entries: LedgerEntry[]): LedgerSummary {
    const state = this.emptyState();
    for (const entry of this.replayOrder(entries)) this.apply(state, entry); // D-33
    return this.toSummary(state);
  }

  private replayOrder(entries: LedgerEntry[]): LedgerEntry[] { /* datetime ASC, id ASC */ }
}
```

Helpers are `private` methods. Data shapes the service takes or returns (`LedgerEntry`, `LedgerSummary`) are exported interfaces in the same file. Nest registers it as a plain provider (`providers: [LedgerService]`); it needs no `@Injectable()` because its constructor is empty.

## Rule 2: Entities own their state changes

A rule about one order is a method on the `Order` entity.

```typescript
// src/orders/domain/entities/order.entity.ts
cancel(now: Date): void {
  if (this.props.status === 'CANCELLED') return; // D-18: a retry changes nothing
  if (this.props.status !== 'NEW') throw new OrderNotCancellableException(this.props.id);
  this.props.status = 'CANCELLED';
  this.props.cancelledAt = now; // D-39
}
```

## Rule 3: A rejection is a value, an error is an exception

`REJECTED` is a stored order and a `201` (D-17): `OrderDecisionService.decide` returns it, never throws it. Throw only when the request fails. Domain exceptions extend `DomainException` from `@/shared/domain` with a stable `code` (D-29); the T4 filter renders the body. Never extend Nest's `HttpException` in `domain/`.

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

export interface OrderRepository {
  findByUser(params: { userId: number; statuses: OrderStatus[] }): Promise<LedgerEntry[]>;
  findById(id: number): Promise<Order | null>;
  save(order: Order): Promise<Order>;
}
```

Inject with `@Inject(ORDER_REPOSITORY)`. An interface is erased at runtime, so injecting by its type alone fails. The module exports the symbol when another module needs the port.

## Rule 5: Repositories are dumb

A repository maps rows to domain objects and back, and runs the query it is given. It never decides a status, a balance, a rejection or which orders count.

```typescript
await this.orders.findByUser({ userId, statuses: ['FILLED', 'NEW'] }); // ✅ the caller picks (D-32)
await this.orders.findAvailableCash(userId); // ❌ SUM(size * price) in SQL: a rule in the repository
```

Map in `private toDomain()` / `toRow()` methods; no mapper class. The domain never sees Prisma types: build `new Decimal(row.price.toString())` here (D-1). Repositories join the T14 transaction (`@nestjs-cls/transactional`); they never open one.

## Rule 6: Use cases orchestrate, controllers call use cases

A use case takes a primitive input (not the DTO), loads through ports, calls domain services and entities, saves through ports, runs inside `UnitOfWork.run` when SPEC asks (D-9, D-35) and logs the outcome line (D-40). A controller validates the DTO, calls one use case and shapes the JSON: no repository, no domain service, no `try/catch`. Money leaves as a string rounded once there, `ROUND_HALF_UP` to 2 decimals (D-23, D-30).

```typescript
// src/orders/application/use-cases/send-order.use-case.ts
@Injectable()
export class SendOrderUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(MARKET_DATA_REPOSITORY) private readonly marketData: MarketDataRepository,
    private readonly ledger: LedgerService,
    private readonly decision: OrderDecisionService,
  ) {}

  run(input: SendOrderInput): Promise<Order> {
    return this.uow.run(input.userId, async () => { // T14 API
      const entries = await this.orders.findByUser({ userId: input.userId, statuses: ['FILLED', 'NEW'] });
      const price = await this.marketData.findLatestClose(input.instrumentId);
      const summary = this.ledger.summarize(entries);
      return this.orders.save(this.decision.decide({ input, summary, price, now: new Date() }));
    });
  }
}
```

Wiring: `providers: [SendOrderUseCase, LedgerService, OrderDecisionService, { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }]`, `exports: [ORDER_REPOSITORY, LedgerService]` so `portfolio` can read the ledger.

## Naming

| Kind | File | Class |
|---|---|---|
| Entity | `order.entity.ts` | `Order` |
| Domain service | `ledger.service.ts` | `LedgerService` |
| Port | `order.repository.ts` | `OrderRepository` + `ORDER_REPOSITORY` |
| Exception | `order-not-found.exception.ts` | `OrderNotFoundException` |
| Use case | `send-order.use-case.ts` | `SendOrderUseCase`, method `run` |
| Repository | `prisma-order.repository.ts` | `PrismaOrderRepository` |
| Controller, DTO | `orders.controller.ts`, `send-order.dto.ts` | `OrdersController`, `SendOrderDto` |

Tests: unit-testing skill (services, entities, use cases with mocked ports), e2e-testing skill (HTTP and database).

## Anti-patterns

| Anti-pattern | Instead |
|---|---|
| `export function summarizeLedger()` in `domain/` | `LedgerService.summarize()` |
| `@Injectable()`, Nest or Prisma imports in `domain/` | Plain class; Prisma only in `persistence/` |
| A port injected by its interface type | `@Inject(ORDER_REPOSITORY)` |
| A repository that sums cash or picks statuses | A domain service; the caller passes the statuses |
| A controller that calls a repository or a domain service | Controller → use case |
| Throwing on `REJECTED` | Return the `REJECTED` order (`201`, D-17) |
| Rounding in the domain or the use case | Round once in `http/` (D-30) |
| Soft delete, criteria, domain events, a generic base repository | Not used in Cocos |

## Checklist

```
- [ ] The file sits in the layout above; no empty folders
- [ ] No decorators, Nest or Prisma imports in domain/
- [ ] Business rules are methods of a domain service or an entity
- [ ] Ports are an interface + Symbol, injected with @Inject(TOKEN)
- [ ] Repositories only map and query
- [ ] Controllers inject use cases only
```
