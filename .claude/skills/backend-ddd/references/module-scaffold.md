# Module Scaffold

How to build a module by hand: every file, in the order to write it. There is no generator.

## Table of Contents

- [Placeholders](#placeholders)
- [File Tree](#file-tree)
- [Module File](#module-file)
- [Controller](#controller)
- [Controller Response Shape](#controller-response-shape)
- [Entity](#entity)
- [Repository Port + DI Token](#repository-port--di-token)
- [Repository Adapter](#repository-adapter)
- [Persistence Mapper](#persistence-mapper)
- [Use Case](#use-case)
- [DTO](#dto)

## Placeholders

| Placeholder | Meaning | Example |
|---|---|---|
| `{module}` | Module name (kebab-case, plural) | `orders`, `instruments` |
| `{Module}` | Module class prefix (PascalCase, plural) | `Orders`, `Instruments` |
| `{entity}` | Entity name (kebab-case, singular) | `order`, `instrument` |
| `{Entity}` | Entity class name (PascalCase, singular) | `Order`, `Instrument` |
| `{entityCamel}` | Entity name (camelCase), also the Prisma delegate | `order`, `instrument` |
| `{ENTITY_CONST}` | Port token constant (SCREAMING_SNAKE) | `ORDER_REPOSITORY` |

## File Tree

Create only the folders a module uses (`instruments` needs `ports/`, `use-cases/`, `persistence/` and `http/`, nothing else).

```
src/{module}/
├── domain/
│   ├── entities/
│   │   └── {entity}.entity.ts
│   ├── services/
│   │   └── {verb}-{noun}.service.ts
│   ├── ports/
│   │   └── {entity}.repository.ts
│   └── exceptions/
│       └── {entity}-not-found.exception.ts
├── application/
│   └── use-cases/
│       └── {verb}-{entity}.use-case.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── prisma-{entity}.repository.ts
│   │   └── {entity}-persistence.mapper.ts
│   └── http/
│       ├── {module}.controller.ts
│       ├── {entity}.presenter.ts   # only when the wire shape differs from toPrimitives()
│       └── {verb}-{entity}.dto.ts
└── {module}.module.ts
```

## Module File

```typescript
// src/{module}/{module}.module.ts
@Module({
  controllers: [{Module}Controller],
  providers: [
    {Verb}{Entity}UseCase,
    {Verb}{Noun}Service,
    { provide: {ENTITY_CONST}, useClass: Prisma{Entity}Repository },
  ],
  exports: [{ENTITY_CONST}, {Verb}{Noun}Service],
})
export class {Module}Module {}
```

**Rules:**
- Export the Symbol token (and a shared domain service) so other modules can use them.
- A domain service is a plain provider; it needs no `@Injectable()`.
- No module provides its own database client. The unit of work and the transaction host come from a dedicated shared module; a feature module imports it unless that module is `@Global`. See [conventions.md](conventions.md#module-placement).

## Controller

```typescript
// src/{module}/infrastructure/http/{module}.controller.ts
@Controller('{module}')
export class {Module}Controller {
  constructor(private readonly {verb}{Entity}: {Verb}{Entity}UseCase) {}

  @Post()
  public async create(@Body() dto: {Verb}{Entity}Dto) {
    const {entityCamel} = await this.{verb}{Entity}.run({ ...dto });

    return {entityCamel}.toPrimitives();
  }
}
```

Controllers inject use cases directly, no facade in between. A controller validates the DTO, calls one use case, then a presenter when the wire shape differs from `toPrimitives()`: no repository, no domain service, no math, no `try/catch`. Handler methods whose parameters are all Nest decorators (`@Body()`, `@Param()`, `@Headers()`) are exempt from the params-object rule.

## Controller Response Shape

Return `entity.toPrimitives()` directly only where the entity has no money fields and is the wire shape; for lists, `entities.map((e) => e.toPrimitives())`. When an endpoint needs a different shape (the portfolio, the order response with money rounded), build it in a presenter in `<module>/infrastructure/http/` that the controller calls after the use case; do not invent a parallel response class per entity.

- **Money leaves as a string, rounded once in the presenter.** Domain services return full-precision `Decimal`; `MONEY_SCALE = 2` (ARS minor unit) lives in the domain. The presenter calls the shared `toDecimalString` (`src/shared/infrastructure/http/to-decimal-string.ts`): `ROUND_HALF_UP` at `MONEY_SCALE`, never `-0.00`. No global interceptor or serializer. Never a `number`.
- `Date` fields go over the wire as the ISO string `JSON.stringify` produces.
- Errors come from domain exceptions through the global filter; the controller never catches.
- Wrap collections in an object (`{ "instruments": [...] }`) so a field can be added later without breaking clients.

## Entity

See [domain-building-blocks.md](domain-building-blocks.md#entity): private constructor with a props object, `create` / `fromPrimitives` / `toPrimitives`, `getX()` accessors, `void` commands, `Primitives` interface with primitives only.

## Repository Port + DI Token

```typescript
// src/{module}/domain/ports/{entity}.repository.ts
export const {ENTITY_CONST} = Symbol('{Entity}Repository');

export interface {Entity}Repository {
  save({entityCamel}: {Entity}): Promise<{Entity}>;
  searchById(id: number): Promise<{Entity} | null>;
  findById(id: number): Promise<{Entity}>;
}
```

No `delete`. Add a `search*` query only when a use case needs it. See [conventions.md](conventions.md#repository-port-shape).

## Repository Adapter

```typescript
// src/{module}/infrastructure/persistence/prisma-{entity}.repository.ts
@Injectable()
export class Prisma{Entity}Repository implements {Entity}Repository {
  constructor(
    @Inject(TransactionHost) private readonly txHost: PrismaTransactionHost,
  ) {}

  public async save({entityCamel}: {Entity}): Promise<{Entity}> {
    const data = {Entity}PersistenceMapper.toPersistence({entityCamel});
    const id = {entityCamel}.getId();

    const record = id === null
      ? await this.txHost.tx.{entityCamel}.create({ data })
      : await this.txHost.tx.{entityCamel}.update({ where: { id }, data });

    return {Entity}PersistenceMapper.toDomain(record);
  }

  public async searchById(id: number): Promise<{Entity} | null> {
    const record = await this.txHost.tx.{entityCamel}.findUnique({ where: { id } });

    return record ? {Entity}PersistenceMapper.toDomain(record) : null;
  }

  public async findById(id: number): Promise<{Entity}> {
    const {entityCamel} = await this.searchById(id);
    if (!{entityCamel}) {
      throw new {Entity}NotFoundException(id);
    }

    return {entityCamel};
  }
}
```

- Inject the transaction host; read and write through `this.txHost.tx`. It joins the ambient transaction when a use case runs it inside `uow.run`, and commits on its own otherwise.
- No `$transaction`, no business filter in a `where` or `include`. See [conventions.md](conventions.md#dumb-repositories).
- Translate a violated unique constraint into the module's domain exception in a `catch`.

## Persistence Mapper

```typescript
// src/{module}/infrastructure/persistence/{entity}-persistence.mapper.ts
export class {Entity}PersistenceMapper {
  public static toDomain(record: {Entity}Record): {Entity} {
    const primitives: {Entity}Primitives = {
      id: record.id,
      price: record.price.toString(),
      // ...every field listed explicitly
    };

    return {Entity}.fromPrimitives(primitives);
  }

  public static toPersistence({entityCamel}: {Entity}): Prisma.{Entity}UncheckedCreateInput {
    const data = {entityCamel}.toPrimitives();

    return {
      price: data.price,
      // ...every field listed explicitly
    };
  }
}
```

Every field is listed explicitly, so a new column or `Primitives` field fails to compile until it is mapped. Flattening and `Decimal` conversion live here, never business rules. Prisma types appear only in `infrastructure/`.

## Use Case

See [use-cases.md](use-cases.md#structure). One public `run(input)`, injected ports by Symbol, `Logger` for the outcome line.

## DTO

```typescript
// src/{module}/infrastructure/http/{verb}-{entity}.dto.ts
export class {Verb}{Entity}Dto {
  @IsInt()
  public instrumentId!: number;

  @IsIn(['BUY', 'SELL'])
  public side!: 'BUY' | 'SELL';
}
```

The global `ValidationPipe` validates DTOs; do not add one per route. The use case takes a primitive input, never the DTO class.
