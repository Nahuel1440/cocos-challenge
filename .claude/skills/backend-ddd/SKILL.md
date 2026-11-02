---
name: backend-ddd
description: "Where code goes in the Cocos hexagonal NestJS API: module layout, domain services, entities, ports, dumb Prisma repositories, use cases, controllers. MUST be used before creating or moving a file under `src/`, or when adding a module, entity, domain service, port, repository, use case, controller or DTO. Do NOT use for tests (unit-testing, e2e-testing skills)."
---

Cocos has no soft delete, criteria builder, domain events or value objects (money is `Decimal`): do not add them. Templates for repository, mapper, module, controller and DTO: [module-scaffold.md](references/module-scaffold.md).

## Layout

```
src/<module>/
├── domain/          # entities/ (Order, Order.place), services/ (SummarizeLedgerService), ports/ (OrderRepository + ORDER_REPOSITORY), exceptions/
├── application/use-cases/   # SendOrderUseCase
├── infrastructure/  # persistence/ (PrismaOrderRepository, mapper), http/ (controller, DTO, presenter)
└── <module>.module.ts
```

Modules: `orders`, `portfolio`, `instruments`, `shared`. Create only the folders a module uses. `portfolio` imports `@/orders/domain/...`, never the reverse. Unit of work: `src/shared/application/unit-of-work.port.ts` (`UnitOfWork`, `UNIT_OF_WORK`), adapter in `src/shared/infrastructure/transactions/`. Shared HTTP pieces (guard, filter, `to-decimal-string.ts`) live in `src/shared/infrastructure/http/`.

Lint enforces layer imports, `@/` imports, `public`/`private` on members, `run` as the only non-private method of services and use cases, one params object in services and use cases, no destructuring in a signature, no inline object types in a signature, port method prefixes (`save`/`search`/`find`, plus `lockLedger`), Symbol tokens. Lint does not check: `@/generated/prisma` imported outside `infrastructure/`, params object on every other method, params destructured on the first line, `find*` never returning `null`, no `$transaction` in repositories (they join the ambient transaction), no exported free functions in `domain/`, no HTTP status in domain exceptions, business questions hidden in a query name, module direction, `lockLedger` as the first line of the work.

## Rules

1. **Domain service**: class `{Verb}{Noun}Service` in `domain/services/`, one public method `run(params)`, stateless, empty constructor, no I/O, no decorators, no ports. The use case loads data and passes it in. Its input/output shapes (`LedgerEntry`, `LedgerSummary`) are exported from the same file. Cocos has `SummarizeLedgerService` and `BuildPortfolioService`.
2. **Send-order rules** live in `Order.place(params)` on the entity. It takes plain values (`userId`, `input`, `marketPrice`, `availableCash`, `availableShares`, `now`) and returns an `Order` already `FILLED`, `NEW` or `REJECTED`.
3. **Entity**: private constructor with a props object, `create` / `fromPrimitives` / `toPrimitives`, `getX()` accessors, private fields, commands that mutate `this` and return `void`. `Decimal` inside, decimal string in `OrderPrimitives`. `cancel(now)`: already `CANCELLED` is a no-op, any other non-`NEW` status throws `OrderNotCancellableException`.
4. **A rejection is a value, an error is an exception.** `REJECTED` is a stored order and a `201`; `Order.place` returns it. Exceptions extend `DomainException`, declare `code` and `ErrorCategory` (`InvalidArgument` 400, `NotFound` 404, `Conflict` 409, `Unprocessable` 422) and never carry a status; the global filter maps them.
5. **Ports**: interface plus `export const ORDER_REPOSITORY = Symbol('OrderRepository')`, injected with `@Inject(ORDER_REPOSITORY)`. Methods start with `save`, `search` or `find`: `search*` may return `null` or an empty list, `find*` returns or throws `*NotFoundException` (a list query is always `search*`). The only other method is `lockLedger(userId)`. No `delete`, no Prisma types. Add a query only when a use case needs it; `searchByUser({ userId, statuses })` returns `LedgerEntry[]`.
6. **Repositories are dumb**: they map rows and run the query they are given; the caller picks which orders count. No `SUM`, status decisions or defaults in SQL (`findAvailableCash` is a defect). Mapping lives in `{Entity}PersistenceMapper` with every field listed; Prisma types never leave `infrastructure/`. Use `this.txHost.tx`, never open a transaction.
7. **Use case**: `run(input)` with a primitive input (never the DTO), returns the domain object. Loads through ports, calls entities and services, saves, and logs one outcome line with `Logger` after `uow.run` returns (no balances). Controllers inject use cases only: validate DTO, one call, presenter. No repository, math or `try/catch` there.
8. **Transactions**: `uow.run(work, options?)`. Every write path over a user's orders (send, cancel) starts the work with `await this.orders.lockLedger(userId)` (per-user `pg_advisory_xact_lock`), loads the order after the lock (an order of another user throws `OrderNotFoundException`), and takes `now = new Date()` after the lock. The portfolio reads one snapshot with `{ isolation: 'repeatable-read', readOnly: true }` and no lock. Prefer a database constraint when the invariant fits one; the repository turns the violation into a domain exception. A forgotten lock fails silently, so each write path has an e2e concurrency spec.
9. **Money**: domain services keep full-precision `Decimal`. Only the presenter rounds, with `toDecimalString` (`ROUND_HALF_UP` at `MONEY_SCALE = 2`, never `-0.00`). `new Decimal(row.price.toString())` in the mapper. No global interceptor rounds.
10. **Style**: more than one parameter means one `params` object typed by a named interface, destructured on the first line of the body; the id travels inside it. Name a value before passing it, no bare literals (`now: new Date()` inside a params object is fine). Name each invariant as a private guard method; separate steps with a blank line.

```typescript
public run(input: SendOrderInput): Promise<Order> {
  const { userId, instrumentId } = input;

  return this.uow.run(async () => {
    await this.orders.lockLedger(userId); // first line, before any read

    const entries = await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] });
    const price = await this.marketData.searchLatestClose(instrumentId);
    const summary = this.summarizeLedger.run(entries);
    const order = Order.place({ userId, input, marketPrice: price, availableCash: summary.availableCash,
      availableShares: summary.holdings.get(instrumentId)?.availableQuantity ?? 0, now: new Date() });

    return this.orders.save(order);
  });
}
```

Wiring: `providers: [SendOrderUseCase, SummarizeLedgerService, { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }]`, `exports: [ORDER_REPOSITORY, SummarizeLedgerService]` so `portfolio` can read the ledger.

## Naming

`order.entity.ts` / `Order`; `summarize-ledger.service.ts` / `SummarizeLedgerService`; `order.repository.ts` / `OrderRepository` + `ORDER_REPOSITORY`; `order-not-found.exception.ts`; `send-order.use-case.ts` / `SendOrderUseCase`; `order-persistence.mapper.ts`; `prisma-order.repository.ts`; `order.presenter.ts`; `orders.controller.ts`; `send-order.dto.ts`.
