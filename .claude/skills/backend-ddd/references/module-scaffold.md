# Module Scaffold

Templates for building a module by hand (no generator). `{module}` is plural kebab-case (`orders`), `{entity}` singular (`order`), `{Entity}` PascalCase, `{ENTITY_CONST}` is `ORDER_REPOSITORY`. Layout and rules: [SKILL.md](../SKILL.md).

## Module

```typescript
// src/{module}/{module}.module.ts
@Module({
  controllers: [{Module}Controller],
  providers: [{Verb}{Entity}UseCase, { provide: {ENTITY_CONST}, useClass: Prisma{Entity}Repository }],
  exports: [{ENTITY_CONST}],
})
export class {Module}Module {}
```

Export the Symbol (and a shared domain service) so other modules can use it. A domain service is a plain provider, no `@Injectable()`. No module provides its own database client: the unit of work and transaction host come from a dedicated shared module.

## Controller

```typescript
@Controller('{module}')
export class {Module}Controller {
  constructor(private readonly {verb}{Entity}: {Verb}{Entity}UseCase) {}

  @Post()
  public async create(@Body() dto: {Verb}{Entity}Dto) {
    const {entity} = await this.{verb}{Entity}.run({ ...dto });

    return {entity}.toPrimitives();
  }
}
```

Handlers whose parameters are all Nest decorators are exempt from the params-object rule. Return `toPrimitives()` only when the entity has no money fields; otherwise call a presenter in `infrastructure/http/` that shapes the JSON and rounds every `Decimal` with `toDecimalString`. Wrap collections in an object (`{ "instruments": [...] }`). `Date` goes over the wire as an ISO string. The global filter renders errors; the controller never catches.

## Repository adapter

```typescript
// src/{module}/infrastructure/persistence/prisma-{entity}.repository.ts
@Injectable()
export class Prisma{Entity}Repository implements {Entity}Repository {
  constructor(@Inject(TransactionHost) private readonly txHost: PrismaTransactionHost) {}

  public async save({entity}: {Entity}): Promise<{Entity}> {
    const data = {Entity}PersistenceMapper.toPersistence({entity});
    const id = {entity}.getId();

    const record = id === null
      ? await this.txHost.tx.{entity}.create({ data })
      : await this.txHost.tx.{entity}.update({ where: { id }, data });

    return {Entity}PersistenceMapper.toDomain(record);
  }

  public async searchById(id: number): Promise<{Entity} | null> {
    const record = await this.txHost.tx.{entity}.findUnique({ where: { id } });

    return record ? {Entity}PersistenceMapper.toDomain(record) : null;
  }

  public async findById(id: number): Promise<{Entity}> {
    const {entity} = await this.searchById(id);
    if (!{entity}) {
      throw new {Entity}NotFoundException(id);
    }

    return {entity};
  }
}
```

`this.txHost.tx` joins the ambient transaction inside `uow.run` and commits on its own outside one. Translate a violated unique constraint into a domain exception in a `catch`.

## Persistence mapper

```typescript
// src/{module}/infrastructure/persistence/{entity}-persistence.mapper.ts
export class {Entity}PersistenceMapper {
  public static toDomain(record: {Entity}Record): {Entity} {
    return {Entity}.fromPrimitives({ id: record.id, price: record.price.toString() /* every field */ });
  }

  public static toPersistence({entity}: {Entity}): Prisma.{Entity}UncheckedCreateInput {
    const data = {entity}.toPrimitives();

    return { price: data.price /* every field */ };
  }
}
```

List every field (no spread), so a new column fails to compile until it is mapped. No business rules here.

## DTO

```typescript
export class {Verb}{Entity}Dto {
  @IsInt()
  public instrumentId!: number;

  @IsIn(['BUY', 'SELL'])
  public side!: 'BUY' | 'SELL';
}
```

The global `ValidationPipe` validates DTOs; add none per route.
