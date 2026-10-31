# TASKS: API de portfolio, búsqueda y órdenes

Tareas de tamaño S, en orden, a partir de [SPEC.md](../SPEC.md). Cada tarea entra en un commit de ≤ 400 líneas. La estructura sigue a gamora-sv: `src/<módulo>/{domain,application,infrastructure,presentation}`, con `src/shared` y `test/support`.

> **Tests:** los nombres de los casos los escribe el usuario antes de arrancar cada tarea (TDD). `no-test` = infraestructura pura.

## Orden y paralelismo

1. T1
2. En paralelo: {T2 → T3}, T4, T5, T7
3. En paralelo: T6 (T3 + T4 + T5), T8 (T3 + T4 + T7), T9 (T3 + T4)
4. T11 (T6)
5. T10

## Tareas

### T1 · Skeleton de la app
- **Objetivo:** app NestJS 11 que arranca, con Pino, Vitest y lint.
- **Dónde vive:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/main.ts`, `src/app.module.ts`.
- **Tests:** `no-test`.
- **Depende de:** —

### T2 · Postgres local + migraciones
- **Objetivo:** Postgres en Docker cargado con `database.sql`; Prisma (`db pull` + `@map`) y una migración con los cambios de la SPEC: ENUMs, `NOT NULL`, `CHECK` de D-21, columna `rejection_reason`, índices de D-13.
- **Dónde vive:** `docker-compose.yml`, `database.sql`, `prisma/schema.prisma`, `prisma/migrations/`, `.env.example`.
- **Tests:** `no-test` (se verifica aplicando la migración sobre el seed).
- **Depende de:** T1. **Paralelo con:** T4, T5, T7.

### T3 · Harness de tests funcionales
- **Objetivo:** Postgres de Testcontainers por suite; truncar y recargar el seed entre tests (D-19).
- **Dónde vive:** `test/support/postgres-global-setup.ts`, `test/support/truncate-all-tables.ts`, `test/support/reload-seed.ts`.
- **Tests:** `no-test` (un smoke test que levanta la app y consulta la base).
- **Depende de:** T2.

### T4 · Guard de `X-User-Id` y mapeo de errores
- **Objetivo:** un guard que lee `X-User-Id` (falta o inválido → `400`, D-22) y un filtro `DomainException` → HTTP sin stack traces (NFR-6).
- **Dónde vive:** `src/shared/presentation/`, `src/shared/domain/`.
- **Tests:** _(los nombra el usuario)_
- **Depende de:** T1. **Paralelo con:** T2, T5, T7.

### T5 · Reglas de send-order (dominio puro)
- **Objetivo:** dado el ledger del usuario y la orden, decidir `FILLED` / `NEW` / `REJECTED` + motivo: pesos y acciones disponibles con reservas (D-6), `size` desde `amount` con floor, los cuatro `rejection_reason` (D-20), todo con decimal (D-1).
- **Dónde vive:** `src/orders/domain/`.
- **Tests:** _(los nombra el usuario)_
- **Depende de:** T1. **Paralelo con:** T2, T4, T7.

### T6 · Endpoint `POST /orders` + test funcional obligatorio
- **Objetivo:** validación del body (D-8, D-23), transacción con `pg_advisory_xact_lock(userId)` (D-9), insertar la orden, `201` + `Location` (D-17).
- **Dónde vive:** `src/orders/{application,infrastructure,presentation}/`, `test/orders.e2e-spec.ts`.
- **Tests:** _(los nombra el usuario; incluye el test funcional que pide la consigna)_
- **Depende de:** T3, T4, T5. **Paralelo con:** T8, T9.

### T7 · Cálculo del portfolio (dominio puro)
- **Objetivo:** tenencia, promedio móvil (D-5), valor de mercado, rendimiento total `"3.33"` (D-23), posiciones sin precio en `null` (D-26), valor total (D-7).
- **Dónde vive:** `src/portfolio/domain/`.
- **Tests:** _(los nombra el usuario)_
- **Depende de:** T1. **Paralelo con:** T2, T4, T5.

### T8 · Endpoint `GET /portfolio`
- **Objetivo:** leer órdenes `FILLED` + `NEW` y el último `marketdata` en una sola transacción de lectura (NFR-5) y devolver el contrato de la SPEC.
- **Dónde vive:** `src/portfolio/{application,infrastructure,presentation}/`, `test/portfolio.e2e-spec.ts`.
- **Tests:** _(los nombra el usuario)_
- **Depende de:** T3, T4, T7. **Paralelo con:** T6, T9.

### T9 · Endpoint `GET /instruments?q=`
- **Objetivo:** `ILIKE` sobre `ticker` y `name` con comodines escapados, respuesta `{ "instruments": [...] }` (D-24).
- **Dónde vive:** `src/instruments/`, `test/instruments.e2e-spec.ts`.
- **Tests:** _(los nombra el usuario)_
- **Depende de:** T3, T4. **Paralelo con:** T6, T8.

### T11 · Mandatory cancellation: `POST /orders/:id/cancel`
- **Objective:** implement FR-4 using the declared `X-User-Id` identity (D-22) and a transaction with `pg_advisory_xact_lock(userId)` shared with send-order (D-9).
- **Location:** `src/orders/{domain,application,infrastructure,presentation}/`, `test/orders.e2e-spec.ts`.
- **Tests:** _(case names are written by the user before implementation, as required above)_
- **Acceptance:** an order owned by the declared user in `NEW` becomes `CANCELLED` and returns `200` with the order; an owned order in any other status returns `409`; a missing order or one owned by another user returns `404`. Cancelling a BUY releases its reserved cash and cancelling a SELL releases its reserved shares through the existing derived-balance model: only the order status changes; no separate balance is updated (D-6, NFR-4).
- **Depends on:** T6.

### T10 · README
- **Objetivo:** cómo correr la app y los tests, decisiones clave, supuestos (D-26, seed con tenencia −10, preguntas a Emi), lo que quedó afuera (O-1..O-10) y los recortes no hechos.
- **Dónde vive:** `README.md`.
- **Tests:** `no-test`.
- **Depende de:** T6, T8, T9, T11.

## Lista de recortes (en orden: se recorta primero el de arriba)

| # | Tarea | Si no entra |
|---|-------|-------------|
| C1 | Idempotencia con `idempotency_requests` (D-27) | Diseño en el README |
| C2 | Colección REST Client (`.http`) | Ejemplos `curl` en el README |
| C3 | Paginación por cursor en búsqueda (D-24) | Mencionada en el README |
| C4 | Medición de índices (D-14) | Mencionada en el README |

## Pregunta abierta

- T5 y T7 calculan la misma tenencia y los mismos pesos a partir de `orders`. ¿Dónde vive ese cálculo compartido?
