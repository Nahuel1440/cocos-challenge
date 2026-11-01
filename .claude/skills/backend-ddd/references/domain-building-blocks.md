# Domain Building Blocks

## Table of Contents

- [Entity](#entity)
- [Update Methods: intent-revealing per operation](#update-methods-intent-revealing-per-operation)
- [Domain Service](#domain-service)
- [Value Object](#value-object)
- [Repository Port](#repository-port)
- [Domain Exception](#domain-exception)

## Entity

Entities have identity and lifecycle. Use a private constructor + factory methods + **explicit private fields**.

```typescript
// src/orders/domain/entities/order.entity.ts
import Decimal from 'decimal.js';

// Primitives = serialization shape. Only string | number | boolean | Date | null
// (and arrays/objects of those). Never value objects, never Decimal, never entities.
export interface OrderPrimitives {
  id: number | null; // null until the database assigns it on save
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: string; // decimal string; Decimal inside the entity
  status: OrderStatus;
  cancelledAt: Date | null;
}

interface OrderProps {
  id: number | null;
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: Decimal;
  status: OrderStatus;
  cancelledAt: Date | null;
}

export interface CreateOrderParams {
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: string;
  status: OrderStatus;
}

export class Order {
  // Identity is immutable. The rest is mutated by domain commands (cancel).
  private readonly id: number | null;
  private readonly userId: number;
  private readonly instrumentId: number;
  private readonly side: 'BUY' | 'SELL';
  private readonly size: number;
  private readonly price: Decimal;
  private status: OrderStatus;
  private cancelledAt: Date | null;

  private constructor(props: OrderProps) {
    const { id, userId, instrumentId, side, size, price, status, cancelledAt } = props;

    this.id = id;
    this.userId = userId;
    this.instrumentId = instrumentId;
    this.side = side;
    this.size = size;
    this.price = price;
    this.status = status;
    this.cancelledAt = cancelledAt;
  }

  // For NEW orders: wraps primitives, has no id yet.
  public static create(params: CreateOrderParams): Order {
    const { userId, instrumentId, side, size, price, status } = params;

    return new Order({ id: null, userId, instrumentId, side, size, price: new Decimal(price), status, cancelledAt: null });
  }

  // For reconstructing from persistence.
  public static fromPrimitives(primitives: OrderPrimitives): Order {
    const { price } = primitives;

    return new Order({ ...primitives, price: new Decimal(price) });
  }

  // Intent-revealing command: mutates `this`, returns void (CQRS-style).
  public cancel(now: Date): void {
    if (this.status === 'CANCELLED') return; // already cancelled: a retry changes nothing
    if (this.status !== 'NEW') throw new OrderNotCancellableException(this.id);

    this.status = 'CANCELLED';
    this.cancelledAt = now; // app clock, after the lock
  }

  // For the response and persistence: unwraps Decimal to a string.
  public toPrimitives(): OrderPrimitives {
    return {
      id: this.id,
      userId: this.userId,
      instrumentId: this.instrumentId,
      side: this.side,
      size: this.size,
      price: this.price.toFixed(),
      status: this.status,
      cancelledAt: this.cancelledAt,
    };
  }

  public getId(): number | null {
    return this.id;
  }

  public getUserId(): number {
    return this.userId;
  }

  public getStatus(): OrderStatus {
    return this.status;
  }

  public isCancelled(): boolean {
    return this.status === 'CANCELLED';
  }
}
```

**Rules:**
- No NestJS or Prisma imports: pure TypeScript (`decimal.js` is allowed).
- **Private constructor with a props object.** Forces factory-method use and avoids positional args.
- **Explicit `private` fields, one per attribute.** No `props` bag. `readonly` on identity and on fields no command changes.
- **Accessors are `getX()` methods, not TS `get` getters.** Predicates stay as `isX()` / `hasX()` / `canX()`.
- **Value objects and `Decimal` live inside the entity; primitives live at the boundary.** The `{Entity}Primitives` interface and `toPrimitives()` use the unwrapped form (`price: string`); `fromPrimitives()` re-wraps. Money is never a `number`.
- `create()` for new instances; `fromPrimitives()` for reconstruction from the database; `toPrimitives()` for serialization. Export `{Entity}Primitives`: the repository mapper consumes it.
- **No generic `update(patch)`.** Use intent-revealing commands, one per domain operation. Commands return `void` and mutate `this`. Use cases call them as statements: `order.cancel(now); await repo.save(order);`.
- A rule about one order is a method on the entity. Entities are exempt from the one-public-method rule.
- Domain validation lives in factory methods, commands, or VO constructors.
- Add a private `touch()` that bumps `updatedAt` at the end of every command only if the table has that column; today `orders` does not.
- An order is never deleted: cancellation is a state transition (`cancel`), and `REJECTED` is a stored value (see the rejection rule in SKILL.md).

### `{Entity}Primitives` rule

The `*Primitives` interface defines the **serialization shape** that crosses the persistence and HTTP boundary. It contains only `string`, `number`, `boolean`, `Date`, `null`, and arrays or nested objects of those. It never contains value objects, `Decimal`, or other entities (use a foreign key: `userId: number`, not `user: User`). Enum-like fields use the string union (`side: 'BUY' | 'SELL'`).

## Update Methods: intent-revealing per operation

Entities do not expose `update(patch)`. Each domain operation is its own method, named after the action, mutating `this` and returning `void`. This makes intent explicit, lets each command validate its own invariants, and avoids decoding a patch object.

Each command:
- **Names a real domain action** (`cancel`, `fill`, `reject`). Avoid `setX` unless the field has no meaning beyond "writable".
- **Validates its own invariants** inline (status transitions, allowed values).
- **Mutates `this` directly**: no new instance, no spread.
- **Returns `void`**: commands do not return data; queries (`getX`, `isX`, `toPrimitives`) do.
- Accepts value objects when a field is VO-backed.

```typescript
// use case: commands as statements, one save at the end
const order = await this.orders.findById(input.orderId);

order.cancel(now);

return this.orders.save(order);
```

Setting a nullable field to `null` is a distinct operation from setting a value: give each its own command (`setAlias`, `removeAlias`), and let the use case pick which one to call from the input shape. **Trade-off:** more methods per file. Worth it for entities with real rules (state machines); a data holder with a `setX` for every field is a DTO in disguise.

## Domain Service

A rule over several orders or several inputs is a domain service: a class in `domain/services/` named `{Verb}{Noun}Service`, with a single public method `run(params)`. Stateless, empty constructor, no I/O, no decorators, no injected port. The use case loads the data and passes it in; the use case chains services. Data shapes the service takes or returns are exported interfaces in the same file. Details and the code example are in SKILL.md (Rule 1).

## Value Object

Immutable, compared by value, self-validating, no identity. Create one **only when a value has its own invariant** (a price that must be positive, a ticker format). Cocos has none today; money is `Decimal`. When the first one appears, add the abstract base classes to `src/shared/domain/value-objects/` and extend them.

```typescript
// src/shared/domain/value-objects/value-object.ts
export type Primitives = string | number | boolean | Date;

export abstract class ValueObject<T extends Primitives> {
  public readonly value: T;

  constructor(value: T) {
    this.ensureValueIsDefined(value);
    this.value = value;
  }

  public equals(other: ValueObject<T>): boolean {
    return other.constructor.name === this.constructor.name && other.value === this.value;
  }

  private ensureValueIsDefined(value: T): void {
    if (value === null || value === undefined) {
      throw new InvalidArgumentError('value', value);
    }
  }
}
```

A value object with several fields has one private constructor taking a named props interface, a `create()` that validates, `fromPrimitives()`, `equals()` and `toPrimitives()`. Never a positional parameter-properties constructor.

| `ValueObject<T>` | Union type (`'BUY' \| 'SELL'`) | Primitive |
|---|---|---|
| Has validation or formatting | Fixed set of values, no behaviour | No rules, no meaning |
| Reused across entities | Used as a field and in `*Primitives` | Used in one place only |

Cocos prefers a string union over an `EnumValueObject` for fixed sets (`OrderStatus`, `side`, `type`): the union is the same type in the entity and in `*Primitives`, with no wrapper.

## Repository Port

An interface of named queries plus `save`, in `domain/ports/`, that **exports a `Symbol` token** alongside it. The Symbol is the NestJS DI token.

```typescript
// src/orders/domain/ports/order.repository.ts
export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface OrderRepository {
  save(order: Order): Promise<Order>;
  searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]>;
  searchById(id: number): Promise<Order | null>;
  findById(id: number): Promise<Order>;
}
```

**Rules:** always a `Symbol`; every method starts with `save` / `search` / `find` (`find*` never returns `null`); no `delete`; domain types only; `save` handles create and update. The adapter lives in `infrastructure/persistence/`. See [conventions.md](conventions.md#repository-port-shape).

## Domain Exception

Custom exceptions for domain rule violations. They extend `DomainException` from `@/shared/domain` with a stable `code`, a message and the HTTP status; the global exception filter renders the error body.

```typescript
// src/orders/domain/exceptions/order-not-found.exception.ts
export class OrderNotFoundException extends DomainException {
  constructor(id: number) {
    super('ORDER_NOT_FOUND', `Order ${id} not found`, 404);
  }
}
```

`InvalidArgumentError` (shared, `extends DomainException`, code `INVALID_ARGUMENT`, status 400) is what guards and value objects throw for a malformed argument.

**Naming:** `{Entity}{Reason}Exception`: `OrderNotFoundException`, `OrderNotCancellableException`. Every code is unique. Never extend Nest's `HttpException` in `domain/`. A `REJECTED` order is a value the domain returns, not an exception.
