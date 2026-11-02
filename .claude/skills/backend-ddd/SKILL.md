---
name: backend-ddd
description: "Fixes where code goes in the Cocos hexagonal NestJS API: module layout, domain services as classes, entities, ports with Symbol tokens, dumb Prisma repositories, use cases and controllers. MUST be used before creating or moving a file under `src/`, or when adding a module, entity, domain service, port, repository, use case, controller or DTO, or when the user says 'new module', 'add use case', 'where does this go'. Do NOT use for writing tests (unit-testing, e2e-testing skills)."
---

Each module has three layers: `domain` (rules), `application` (use cases), `infrastructure` (Prisma and HTTP). If this skill and `docs/SPEC.md` disagree, SPEC wins: STOP and tell the user. Cocos has no soft delete, no criteria builder and no domain events: do not add them. These rules are project-specific and diverge from textbook DDD; read [references/conventions.md](references/conventions.md) before generating code.

## When to Use

- Creating a module, entity, domain service, port, repository, use case, controller or DTO
- Moving or renaming a file under `src/`
- Reviewing where a rule belongs

Do NOT use for tests (unit-testing, e2e-testing skills), for shared infrastructure wiring (`main.ts`, database client setup) or for config files (eslint, tsconfig).

## Decision Tree

| Task | Files | Reference |
|---|---|---|
| New module | the tree below, hand-written | [module-scaffold.md](references/module-scaffold.md) |
| New use case | `application/use-cases/{verb}-{noun}.use-case.ts` | [use-cases.md](references/use-cases.md) |
| New entity or value object | `domain/entities/`, `domain/value-objects/` | [domain-building-blocks.md](references/domain-building-blocks.md) |
| New domain service | `domain/services/{verb}-{noun}.service.ts` | Rule 1 |
| New port | `domain/ports/{name}.repository.ts` (interface + Symbol) | [conventions.md](references/conventions.md#repository-port-shape) |
| New repository adapter | `infrastructure/persistence/prisma-{name}.repository.ts` + mapper | [module-scaffold.md](references/module-scaffold.md), [conventions.md](references/conventions.md#dumb-repositories) |
| New exception | `domain/exceptions/{name}.exception.ts` | [domain-building-blocks.md](references/domain-building-blocks.md#domain-exception) |
| New DTO / controller | `infrastructure/http/` | [module-scaffold.md](references/module-scaffold.md) |
| Repository logging or retry | decorator on the port | [repository-decorators.md](references/repository-decorators.md) |

## Layout

```
src/<module>/
├── domain/
│   ├── entities/        # Order: identity, state transitions, Order.place (send-order rules)
│   ├── value-objects/   # only when a value has its own invariant (none today)
│   ├── services/        # SummarizeLedgerService: rules over many orders
│   ├── ports/           # OrderRepository interface + ORDER_REPOSITORY symbol
│   └── exceptions/      # OrderNotFoundException
├── application/
│   └── use-cases/       # SendOrderUseCase, CancelOrderUseCase
├── infrastructure/
│   ├── persistence/     # PrismaOrderRepository
│   └── http/            # OrdersController, SendOrderDto, OrderPresenter
└── <module>.module.ts
```

Modules: `orders`, `portfolio`, `instruments`, plus `src/shared` with the same layout. Create only the folders a module uses: `instruments` needs `ports/`, `use-cases/`, `persistence/` and `http/`, nothing else.

- `src/shared/domain/ports/`: `UserRepository` + `USER_REPOSITORY`, `UnitOfWork` + `UNIT_OF_WORK` (transaction and per-user lock).
- `src/shared/infrastructure/http/`: the `X-User-Id` guard, the exception filter, the request id, `to-decimal-string.ts`.

| Layer | May import | Never imports |
|---|---|---|
| `domain/` | `decimal.js`, domain code (its own, `@/shared/domain`, other modules' `domain/`) | `@nestjs/*`, `@prisma/client`, application, infrastructure |
| `application/` | domain (ports included, e.g. `UnitOfWork`), `@nestjs/common` (`Injectable`, `Inject`, `Logger`) | infrastructure, Prisma, DTOs |
| `infrastructure/` | anything | — |

Import with `@/` (lint blocks `..`). Across modules, import only `@/<other>/domain/...`; `portfolio` imports from `orders`, never the reverse: `orders` owns the ledger.

## Rule 1: Business rules live in domain services

A rule over several orders or several inputs is a domain service: a class in `domain/services/` named `{Verb}{Noun}Service` with exactly ONE public method, `run(params)`. No exported free functions in `domain/`. A domain service is stateless, has an empty constructor, does no I/O and has no decorators. It takes what it needs as arguments; the use case chains services. Cocos has two: `SummarizeLedgerService` (cash, holdings, average price) and `BuildPortfolioService` (positions and returns). The send-order rules are not a service: they live in `Order.place(params)` on the entity, which takes plain values (`input`, `marketPrice`, `availableCash`, `availableShares`) and returns an `Order` already `FILLED`, `NEW` or `REJECTED`. File names follow the class: `summarize-ledger.service.ts`.

```typescript
// src/orders/domain/services/summarize-ledger.service.ts
export class SummarizeLedgerService {
  public run(entries: LedgerEntry[]): LedgerSummary {
    const state = this.emptyState();
    for (const entry of this.replayOrder(entries)) this.apply({ state, entry }); // oldest first
    return this.toSummary(state);
  }

  private replayOrder(entries: LedgerEntry[]): LedgerEntry[] { /* datetime ASC, id ASC */ }
}
```

A domain service never injects a port and never does I/O: the use case loads the data and passes it in. Helpers are `private` methods; `run` is the only public one. Data shapes the service takes or returns (`LedgerEntry`, `LedgerSummary`) are exported interfaces in the same file. Nest registers it as a plain provider (`providers: [SummarizeLedgerService]`); it needs no `@Injectable()` because its constructor is empty.

## Rule 2: Entities own their state changes

A rule about one order is a command on the `Order` entity: it mutates `this` and returns `void`. Entities have a private constructor with a props object, `create` / `fromPrimitives` / `toPrimitives`, `getX()` accessors and explicit private fields; money is `Decimal` inside and a string in `OrderPrimitives`. Entities are exempt from the one-public-method rule. Full pattern: [domain-building-blocks.md](references/domain-building-blocks.md#entity).

```typescript
// src/orders/domain/entities/order.entity.ts
public cancel(now: Date): void {
  if (this.status === 'CANCELLED') return; // already cancelled: a retry changes nothing
  if (this.status !== 'NEW') throw new OrderNotCancellableException(this.id);

  this.status = 'CANCELLED';
  this.cancelledAt = now; // app clock, after the lock
}
```

## Rule 3: A rejection is a value, an error is an exception

`REJECTED` is a stored order and a `201`: `Order.place` returns it, never throws it. Throw only when the request fails. Domain exceptions extend `DomainException` from `@/shared/domain`, declare a stable `code` and an `ErrorCategory`, and carry no HTTP status; the global exception filter in `src/shared/infrastructure/http` maps the category to the status and renders the error body. Never extend Nest's `HttpException` in `domain/`.

```typescript
// src/orders/domain/exceptions/order-not-found.exception.ts
import { DomainException, ErrorCategory } from '@/shared/domain';

export class OrderNotFoundException extends DomainException {
  public readonly code = 'ORDER_NOT_FOUND';
  public readonly category = ErrorCategory.NotFound;

  constructor(id: number) {
    super(`Order ${id} not found`);
  }
}
```

## Rule 4: Ports are interfaces plus a Symbol token

```typescript
// src/orders/domain/ports/order.repository.ts
export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface SearchOrdersByUserParams {
  userId: number;
  statuses: OrderStatus[];
}

export interface OrderRepository {
  save(order: Order): Promise<Order>;
  searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]>;
  searchById(id: number): Promise<Order | null>;
  findById(id: number): Promise<Order>;
}
```

Inject with `@Inject(ORDER_REPOSITORY)`. An interface is erased at runtime, so injecting by its type alone fails; never use a string token. The module exports the symbol when another module needs the port. Every repository method starts with `save`, `search` or `find` (`UnitOfWork` is not a repository): `search*` may return `null` or an empty list, `find*` returns a result or throws a `*NotFoundException`. No `delete`. See [conventions.md](references/conventions.md#repository-port-shape).

## Rule 5: Repositories are dumb

A repository maps rows to domain objects and back, and runs the query it is given. It never decides a status, a balance, a rejection or which orders count.

```typescript
await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] }); // good: the caller picks
await this.orders.findAvailableCash(userId); // bad: SUM(size * price) in SQL, a rule in the repository
```

Mapping lives in `{Entity}PersistenceMapper` (`infrastructure/persistence/`), every field listed explicitly. The domain never sees Prisma types: build `new Decimal(row.price.toString())` there; money is decimal.js, never `number`. Repositories join the current transaction (`@nestjs-cls/transactional`); they never open one. Classify every line as M (mapping), B (business rule) or Q (business question on the port): only M may live in a repository. See [conventions.md](references/conventions.md#dumb-repositories).

## Rule 6: Use cases orchestrate, controllers call use cases

A use case takes a primitive input (not the DTO), loads through ports, calls domain services and entities, saves through ports, runs inside `UnitOfWork.run({ userId, work })` when it needs one transaction (send and cancel take the per-user lock; the portfolio reads one snapshot with no `userId`) and logs one outcome line per order. A controller validates the DTO, calls one use case, then a presenter when the wire shape differs from `toPrimitives()`: no repository, no domain service, no math, no `try/catch`. Domain services keep full precision and return `Decimal`; they never round or build strings. The currency scale is a domain fact: `MONEY_SCALE = 2` (ARS minor unit) lives in `@/shared/domain`. The presenter in `<module>/infrastructure/http/` shapes the JSON and turns each `Decimal` into a string with the shared `toDecimalString` helper (`src/shared/infrastructure/http/to-decimal-string.ts`): `ROUND_HALF_UP` at `MONEY_SCALE`, never `-0.00`. No global interceptor or serializer rounds.

```typescript
// src/orders/application/use-cases/send-order.use-case.ts
@Injectable()
export class SendOrderUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(MARKET_DATA_REPOSITORY) private readonly marketData: MarketDataRepository,
    private readonly summarizeLedger: SummarizeLedgerService,
  ) {}

  public run(input: SendOrderInput): Promise<Order> {
    const { userId, instrumentId } = input;

    return this.uow.run({
      userId, // per-user lock
      work: async () => {
        const entries = await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] });
        const price = await this.marketData.searchLatestClose(instrumentId);
        const summary = this.summarizeLedger.run(entries);
        const order = Order.place({
          input,
          marketPrice: price,
          availableCash: summary.availableCash,
          availableShares: summary.holdings.get(instrumentId)?.availableQuantity ?? 0,
        });

        return this.orders.save(order);
      },
    });
  }
}
```

Wiring: `providers: [SendOrderUseCase, SummarizeLedgerService, { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }]`, `exports: [ORDER_REPOSITORY, SummarizeLedgerService]` so `portfolio` can read the ledger.

## Rule 7: Members, parameters and style

- Every class member states `public`, `private` or `protected`. Constructors carry no modifier; Nest DI constructor parameter properties are `private readonly`.
- A domain service or use case has exactly ONE non-private method, named `run` (static and `protected` count). Entities may have several.
- A method or function with more than one parameter takes one `params` object typed by a named interface (no inline object types). Destructure it on the FIRST line of the body, never in the signature. The id travels inside the object, never next to it. Exempt: constructors (NestJS DI, and exceptions that pass values straight to `super(...)`), controller handlers whose parameters are all Nest decorators, and inline arrow callbacks (`.map(({ x }) => ...)`).
- Name a value before passing it: no inline `new Date()` or unexplained literals at the call site.
- Name each invariant as a private method or a boolean (Named Guards). Group lines by meaning, with a blank line between steps (Blank Lines by Meaning).

```typescript
// Bad: destructured in the signature, inline object type, positional id next to the object
public static place({ input, marketPrice }: { input: SendOrderInput; marketPrice: Decimal }, availableCash: Decimal): Order { ... }

// Good: named interface, destructured on the first line
public static place(params: PlaceOrderParams): Order {
  const { input, marketPrice, availableCash, availableShares } = params;

  return Order.decide({ input, marketPrice, availableCash, availableShares });
}
```

ESLint enforces `public`/`private` on every member, `run` as the only non-private method in services and use cases, a single parameter on their methods (spec files excluded), no destructuring in a signature and no inline object types, the repository-port method prefixes and `find*` never returning `null`, no string `@Inject` tokens, no `$transaction` in repositories, no exported free functions and no HTTP status in domain exceptions, and the layer import boundaries. It cannot check "destructure on the first line", business questions hidden in a query name (`findAvailableCash`), or imports between modules: the review checks them.

## Module Placement and Concurrency

New infrastructure goes in a module named after its responsibility; a shared concern (transactions, clock) gets its own module. For an invariant, prefer a database constraint (translated into a domain exception in the repository); when it needs read-check-write over a user's orders, take the per-user lock through `UnitOfWork.run({ userId, work })`. See [conventions.md](references/conventions.md#concurrency-constraint-first-per-user-lock-second) and [conventions.md](references/conventions.md#module-placement).

## Naming

| Kind | File | Class |
|---|---|---|
| Entity | `order.entity.ts` | `Order` |
| Domain service | `summarize-ledger.service.ts` | `SummarizeLedgerService`, method `run` |
| Port | `order.repository.ts` | `OrderRepository` + `ORDER_REPOSITORY` |
| Exception | `order-not-found.exception.ts` | `OrderNotFoundException` |
| Use case | `send-order.use-case.ts` | `SendOrderUseCase`, method `run` |
| Persistence mapper | `order-persistence.mapper.ts` | `OrderPersistenceMapper` |
| Repository | `prisma-order.repository.ts` | `PrismaOrderRepository` |
| Presenter | `order.presenter.ts` | `OrderPresenter` |
| Decimal helper | `to-decimal-string.ts` | `toDecimalString` |
| Controller, DTO | `orders.controller.ts`, `send-order.dto.ts` | `OrdersController`, `SendOrderDto` |

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
- [ ] Money is rounded only in the presenter via `toDecimalString`; the domain keeps `Decimal`
- [ ] Port methods start with `save`/`search`/`find`; `find*` never returns `null`
- [ ] Entities mutate through `void` commands, expose `getX()`, keep money as `Decimal` inside and strings in `Primitives`
- [ ] Invariants are named guards; blank lines separate steps
- [ ] Per-user lock taken by every write path of a user's orders
```
