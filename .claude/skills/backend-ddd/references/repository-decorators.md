# Repository Decorators

Optional. Adds behavior (logging, retry) to a repository adapter without changing the use case or the Prisma adapter. The decorator implements the same port interface and wraps the real repository. Apply it after the module works; Cocos has no decorator today.

## When to Use

- Logging around repository operations.
- Retry logic around an adapter that calls an external service.

**Do NOT use when:**
- The behavior belongs in the use case or the domain (business logic, not infrastructure).
- There is only one adapter and no real cross-cutting concern.
- You want to cache query results: the data derives the ledger, and a stale read is a wrong balance. Do not cache.

## How It Works

```
Without decorator:  Use Case -> PrismaOrderRepository -> DB
With decorator:     Use Case -> LoggingOrderRepository -> PrismaOrderRepository -> DB
```

The use case always injects the port by its Symbol and does not know what is behind it. The decorator implements every method of the port (`save`, `search*`, `find*`) and nothing more.

## Logging Decorator

```typescript
// src/orders/infrastructure/persistence/logging-order.repository.ts
@Injectable()
export class LoggingOrderRepository implements OrderRepository {
  private readonly logger = new Logger(LoggingOrderRepository.name);

  constructor(private readonly source: PrismaOrderRepository) {}

  public async save(order: Order): Promise<Order> {
    const saved = await this.source.save(order);

    this.logger.log(`save order ${saved.getId()}`);

    return saved;
  }

  public searchById(id: number): Promise<Order | null> {
    return this.source.searchById(id);
  }

  public findById(id: number): Promise<Order> {
    return this.source.findById(id);
  }

  public searchByUser(params: SearchOrdersByUserParams): Promise<LedgerEntry[]> {
    return this.source.searchByUser(params);
  }
}
```

## Module Wiring

Register the real adapter as a provider and point the port's `useClass` at the decorator:

```typescript
providers: [
  PrismaOrderRepository,
  { provide: ORDER_REPOSITORY, useClass: LoggingOrderRepository },
],
```

To stack decorators, use `useFactory` with `inject` and keep the intermediate wiring inside the module; use cases still inject only `ORDER_REPOSITORY`.
