# Project-Specific Conventions

Rules below are **not** standard DDD: they are specific to this codebase. Follow them even when they diverge from textbook examples. When existing code contradicts this skill, follow the skill for new code; do not copy the older pattern. If this skill and `docs/SPEC.md` disagree, SPEC wins: STOP and tell the user.

## Table of Contents

- [Repository Port Shape](#repository-port-shape)
- [Repository Method Naming: search vs find](#repository-method-naming-search-vs-find)
- [Concurrency: Constraint First, Per-User Lock Second](#concurrency-constraint-first-per-user-lock-second)
- [DI Token: Symbol, not String](#di-token-symbol-not-string)
- [Dumb Repositories](#dumb-repositories)
- [Transactions: Unit of Work](#transactions-unit-of-work)
- [Module Placement](#module-placement)
- [Members and Accessibility](#members-and-accessibility)
- [Parameter Objects](#parameter-objects)
- [Params Object: Destructure on the First Line](#params-object-destructure-on-the-first-line)
- [Named Guards](#named-guards)
- [Blank Lines by Meaning](#blank-lines-by-meaning)

## Repository Port Shape

A port is an interface of **named, intention-revealing queries** plus `save`. Cocos has no generic query object, so a query is a method that takes a typed params object. The caller picks what to ask for; the port never decides.

```typescript
// src/orders/domain/ports/order.repository.ts
export interface SearchOrdersByUserParams {
  userId: number;
  statuses: OrderStatus[];
}

export interface OrderRepository {
  // Inserts a new order (id is null) or updates an existing one; returns the persisted order with its id.
  save(order: Order): Promise<Order>;
  searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]>;
  searchById(id: number): Promise<Order | null>;
  findById(id: number): Promise<Order>;
}
```

Rules:

- Every method starts with `save`, `search` or `find` (lint enforces it). No `delete`: Cocos orders are cancelled by a state transition, never removed.
- Parameters and return types are domain types, never Prisma types.
- A method with more than one parameter takes one params interface (see [Parameter Objects](#parameter-objects)).
- Add a query method only when a use case needs it. No `count`, `sum*` or other aggregates the use case can compute with a domain service.
- `searchByUser` returns `LedgerEntry` rows, not `Order` aggregates: a read model that the ledger service replays (a documented exception to "a repository returns aggregates"; `LedgerEntry` is declared in the service file).
- A query is named for what it asks (`searchByUser`), not for the rule behind it. `searchAvailableCash` is a defect: a business rule disguised as a query (see [Dumb Repositories](#dumb-repositories)).

## Repository Method Naming: search vs find

- **`search*`** may return `null` or an empty list. The caller decides what absence means.
- **`find*`** always returns a result or throws a domain `*NotFoundException`. It never returns `null`.

```typescript
// Adapter
public async findById(id: number): Promise<Order> {
  const order = await this.searchById(id);
  if (!order) {
    throw new OrderNotFoundException(id);
  }

  return order;
}
```

A list query is always `search*`: an empty list is a valid answer, so it can never "miss". Use `searchById` when the use case treats absence as a branch; use `findById` when absence is a `404`. Lint checks the prefix and that a `find*` return type has no `null`.

## Concurrency: Constraint First, Per-User Lock Second

**1. Prefer a database constraint** whenever the invariant can be written as one: a unique index, a check. Postgres enforces it under any concurrency with no lock and no retry. Prisma cannot declare partial or expression indexes; those live only in the migration SQL. The repository translates the violation into a domain exception (`catch` on the Prisma error code, then `throw new ...Exception`); the use case never sees a Prisma error. Check what Postgres reports for the index in an integration test.

**2. Take a lock** when the invariant needs read-check-write over data other requests can change. Cocos derives cash and holdings from the whole order history of a user, so there is no single row to lock: the lock is the **per-user advisory lock** (`pg_advisory_xact_lock(userId)`), taken by `await this.orders.lockLedger(userId)` (it runs `pg_advisory_xact_lock(namespace, userId)`) and held until the transaction commits.

```typescript
return this.uow.run(async () => {
  await this.orders.lockLedger(userId); // first line, before any read
  const entries = await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] });
  // ...decide and save with the history that no other request can change now
});
```

Rules:

- The lock runs only inside a transaction: `uow.run` opens it, the repository never does. `lockLedger` is the first line of the work, before any read.
- Every write path that changes a user's orders takes it (send and cancel), including jobs. Read-only paths (the portfolio) skip the lock and read one snapshot with `uow.run(work, { isolation: 'repeatable-read', readOnly: true })`.
- Load the aggregate **after** the lock is taken: an order read before the lock can be stale when the lock is granted.
- The unit of work knows nothing about users or locks: it opens the transaction and sets the isolation. The lock is a repository method, `lockLedger(userId)`, because the use case asks the database for it like any other query (a query it asks for, not a decision, so it fits dumb repositories). It is not `searchOneAndLock`: there is no single row to lock, the ledger is the whole order history of the user. The one exception to the `save`/`search`/`find` prefix rule is `lockLedger`.
- `now` is `new Date()` in the use case, after the lock.
- A forgotten lock fails silently (unlike a missing row lock), so every write path has an e2e concurrency spec: parallel requests, exactly one outcome wins.

## DI Token: Symbol, not String

Every port file exports a `Symbol` token alongside the interface. Modules use the Symbol as the `provide` token and export it when another module needs the port. Use cases inject with `@Inject(TOKEN)`.

```typescript
// src/orders/domain/ports/order.repository.ts
export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface OrderRepository { /* ... */ }
```

```typescript
// orders.module.ts
@Module({
  providers: [{ provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }],
  exports: [ORDER_REPOSITORY],
})
export class OrdersModule {}
```

```typescript
// use case
import { ORDER_REPOSITORY, type OrderRepository } from '@/orders/domain/ports/order.repository';

constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}
```

**Why Symbol over string:** unique, no accidental collisions across modules, refactor-safe. An interface is erased at runtime, so injecting by type alone fails. **Never use string tokens for ports** (lint rejects `@Inject('...')`).

## Dumb Repositories

A repository is a collection of aggregates, nothing more. It runs the query it is given and maps between the aggregate and rows. It never decides what the aggregate is.

**Grounding:**
- Evans, *DDD* ch. 6: a repository gives the illusion of an in-memory collection of aggregate roots; domain decisions stay in the model, not in the query.
- Vernon, *IDDD* ch. 12: a collection-oriented repository behaves like a `Set`: you get back what you saved and the persistence mechanism stays invisible.

### Classify every line: M, B or Q

| Code | Meaning | Where it goes |
|---|---|---|
| **M** persistence mapping | flattening value objects, `Decimal` to column and back, hydration, deterministic ordering for reproducible hydration | `infrastructure/persistence/{entity}-persistence.mapper.ts`; the repository runs the queries and translates Prisma errors |
| **B** business rule | which orders count toward cash, a balance, a status decision, a rejection, a default | the entity or a domain service |
| **Q** business question on the port | `findAvailableCash`, a `SUM(size * price)` in SQL | a domain service over rows the caller chose (`searchByUser` with the statuses) |

Only **M** may live in infrastructure. A **B** or **Q** in a repository is a defect, even when it works.

### Worked example: available cash

```typescript
await this.orders.searchByUser({ userId, statuses: ['FILLED', 'NEW'] }); // good: the caller picks which orders count
await this.orders.findAvailableCash(userId); // bad: SUM(size * price) in SQL decides which orders count and how cash is computed
```

The first returns rows; `SummarizeLedgerService` turns them into cash. The second hides a rule (`NEW` reserves cash, `CANCELLED` does not) where no domain test reaches it, and breaks Vernon's `Set` contract: what you read is no longer what you saved.

### Persistence mapper

```typescript
// src/orders/infrastructure/persistence/order-persistence.mapper.ts
export class OrderPersistenceMapper {
  public static toDomain(record: OrderRecord): Order { /* row -> primitives -> Order.fromPrimitives */ }
  public static toPersistence(order: Order): Prisma.OrderUncheckedCreateInput { /* flatten to columns */ }
}
```

List every field explicitly in `toDomain` / `toPersistence` (no spread of the record): adding a field to `OrderPrimitives` or the Prisma model then fails to compile until it is mapped. Money crosses the boundary as a decimal string: `new Decimal(row.price.toString())` here, never a `number`.

## Transactions: Unit of Work

The application service owns the transaction (Vernon *IDDD* ch. 14). The ambient transaction comes from `@nestjs-cls/transactional`, hidden behind the `UNIT_OF_WORK` port (`UnitOfWork` in `src/shared/application/unit-of-work.port.ts`; adapter `src/shared/infrastructure/transactions/cls-unit-of-work.ts`). Signature: `run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T>`, with `options` holding the isolation.

**Repository rules:**
- Reads and writes both use the ambient transaction client from `TransactionHost`. Inside `uow.run` it is the transaction client; outside one it is the plain client and a write commits on its own, which is correct for a single-write use case.
- No `$transaction` in a repository (lint rejects it). Repositories join the current transaction; they never open one.

**Use case rules:**
- `uow.run` is for use cases that need the per-user lock, one snapshot of several reads, or more than one write. A single-write use case with no lock calls `repo.save` directly.
- Read-modify-write loads inside the same `run`.
- Logging and other side effects that must not roll back go after `run` returns.
- Options such as `isolation` only with a written reason. `serializable` needs a retry of the whole `run` on Prisma `P2034`; never retry inside the `run`.
- A nested `run` joins the open transaction; a nested `run` with options rejects.

## Module Placement

New infrastructure goes in a module named after its responsibility. Do not add a provider to an existing module just because it is already global or already imported. If a provider must live in an existing module, that module's responsibility must cover it, and the PR says why. A shared concern used by several modules (transactions, clock) gets its own module; the modules that need it import it (unless the concern module is deliberately `@Global`, which its PR justifies), and dependencies point from the specific concern to the general one.

**Why:**
- Common Closure Principle (Robert C. Martin, *Clean Architecture* ch. 13): gather what changes for the same reason.
- Screaming Architecture (*Clean Architecture* ch. 21): the module list should say what the system does. Cocos modules are `orders`, `portfolio`, `instruments`, plus `shared`; the unit of work and the exception filter live in `shared`, not inside `orders`.

## Members and Accessibility

- Every class member states `public`, `private` or `protected`. Constructors carry no modifier; Nest DI constructor parameter properties are `private readonly`. Lint enforces it.
- A domain service or use case has exactly ONE non-private method, named `run` (static and `protected` count). Helpers are `private`. Entities are exempt: `Order.cancel` and its siblings may be several. Lint enforces it.

## Parameter Objects

In every layer, a method or function with MORE THAN 1 parameter takes a single `params` object declared as a named interface (no inline object types). Never pass an unexplained literal at the call site; name the value first. `now: new Date()` inside a params object is allowed (the app clock names itself); a bare positional `new Date()` is not (Clean Code ch. 3, argument objects).

```typescript
// Bad: two numbers swappable; positional Date
order.fill(price, new Date());
Order.place(userId, input, price, new Date());

// Good: params object; `now` is named by its key
order.fill({ price, now: new Date() });
Order.place({ userId, input, marketPrice, availableCash, availableShares, now: new Date() });
```

A concept with its own invariants (e.g. a price) is a value object with a `create()` that validates, never an interface plus a separate assert function (Evans, DDD ch. 5). Lint rejects a service or use-case method with more than one parameter.

## Params Object: Destructure on the First Line

Scope: every method, factory and constructor that takes structured input. The function receives one `params: SomeInterface` (or `props` / `primitives` where the module already uses that name) and destructures it on the first line of the body. Never destructure in the signature, and never pass a positional id next to the object: the id travels inside the object. Exempt: NestJS DI constructors, controller handlers whose parameters are all Nest decorators, inline arrow callbacks (`.map(({ x }) => ...)`) and domain exceptions that pass values straight to `super(...)`.

```typescript
// Bad: destructuring in the signature, positional id + object
private constructor(id: number, { instrumentId, side, size }: OrderParams) { ... }
return new Order(1, params);

// Good: one props argument, destructured first; the id travels inside it
private constructor(props: OrderProps) {
  const { id, instrumentId, side, size } = props;

  this.id = id;
  ...
}
```

**Why:** the signature stays one readable line, the fields in use are listed once at the top, and adding a field never reshuffles positional arguments. Lint cannot check "first line" or signature destructuring here: the review does.

## Named Guards

Each invariant is its own named private method, or a named boolean, that states the rule in domain words. Never inline a boolean trick that the reader must decode.

```typescript
// Bad: the reader has to decode the rule
if (!(Number.isInteger(size) && size > 0) && !(amount !== undefined && amount.gt(0))) {
  throw new InvalidSizeException(size);
}

// Good: the rule has a name
private static ensureSizeIsPositiveInteger(size: number): void {
  const sizeIsPositiveInteger = Number.isInteger(size) && size > 0;

  if (!sizeIsPositiveInteger) {
    throw new InvalidSizeException(size);
  }
}
```

A braceless early return on empty input (`if (ids.length === 0) return []`) is not an invariant. It needs no name and no braces; do not extract it. `create()` then reads as a list of rules (`ensureSizeIsPositiveInteger`, ...). Not enough money is not a guard: it is a `REJECTED` value (see SKILL.md, Rule 3). **Why:** intention-revealing names (Clean Code ch. 2) and one reason to change per function (ch. 3).

## Blank Lines by Meaning

Group lines like paragraphs. A step is one piece of intent: a lookup together with the check on its result, a mutation together with its save, converting a row, running a query. A blank line separates steps; it never splits a step. Decide by meaning, not by statement type (Clean Code ch. 5). When the body has more than one step, the final `return` is its own step and gets a blank line before it.

```typescript
const order = await this.orders.findById(input.orderId);

order.cancel(now);
await this.orders.save(order);
```

A repository `search` method is three steps (build the query, run it, map the rows), separated by blank lines:

```typescript
// Bad: three steps packed together
public async searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]> {
  const { userId, statuses } = params;
  const rows = await this.txHost.tx.order.findMany({ where: { userId, status: { in: statuses } } });
  return rows.map((row) => OrderPersistenceMapper.toLedgerEntry(row));
}

// Good: a blank line between steps
public async searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]> {
  const { userId, statuses } = params;

  const rows = await this.txHost.tx.order.findMany({ where: { userId, status: { in: statuses } } });

  return rows.map((row) => OrderPersistenceMapper.toLedgerEntry(row));
}
```

Applies to new and edited code.
