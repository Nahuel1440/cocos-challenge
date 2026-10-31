# SPEC: API de portfolio, búsqueda y órdenes

API REST en Node.js sobre Postgres con tres endpoints: portfolio, búsqueda de instrumentos y envío de órdenes, más la cancelación. Este documento transcribe las decisiones de diseño tomadas antes de escribir código. Cada decisión dice qué se eligió, por qué y qué se descartó.

Cancellation is mandatory in the user-selected delivery scope.

Idempotency is mandatory for this delivery, overriding earlier removable classifications; the optional `Idempotency-Key` is a client-generated UUID per logical order, reused on retries; for matching user, operation, key and validated input, the server atomically stores the request hash, order and original response and replays that response without creating another order.

> El usuario llega en el header `X-User-Id` (D-22). Montos y precios viajan como string decimal (D-23). No quedan notas abiertas.

## Problema

Un usuario de un broker necesita ver cuánto vale su cuenta y cada posición, buscar activos por ticker o nombre, y enviar órdenes de compra y venta. Las órdenes son el ledger: los saldos y las tenencias se calculan siempre a partir de la tabla `orders`.

### Requisitos funcionales

| ID | El usuario puede… |
|----|-------------------|
| FR-1 | Ver su portfolio: valor total de la cuenta, pesos disponibles y, por posición, cantidad, valor de mercado en ARS y rendimiento total %. |
| FR-2 | Buscar instrumentos por ticker y/o nombre. |
| FR-3 | Enviar una orden BUY/SELL, MARKET/LIMIT, por cantidad exacta o por monto en ARS (floor a acciones enteras). |
| FR-4 | Cancelar una orden `NEW`. |

### Requisitos no funcionales

| ID | El sistema debe… |
|----|------------------|
| NFR-1 | Ante órdenes concurrentes del mismo usuario, nunca dejar pesos ni acciones disponibles por debajo de cero. Cada orden se evalúa contra el saldo que dejaron las órdenes ya confirmadas, y la que no entra se guarda `REJECTED`. |
| NFR-2 | No calcular montos con floats de JS. Las cantidades de acciones son enteras. |
| NFR-3 | Ser idempotente en send-order: un reintento no crea una segunda orden. **Recortable** (D-27): última tarea; si no entra, va al README. |
| NFR-4 | Tratar las órdenes como inmutables. El único cambio permitido es `NEW → CANCELLED`. |
| NFR-5 | Leer el portfolio desde una sola foto consistente de la base. |
| NFR-6 | Validar el input en el borde y usar consultas parametrizadas, sin stack traces en las respuestas. |

## Glosario

| Término | Significado acá |
|---------|-----------------|
| Instrumento | Un activo (`ACCIONES`) o la moneda (`MONEDA`). ARS es el instrumento id 66. |
| Orden | Fila de `orders`. Toda orden se guarda, incluso las rechazadas. |
| `size` | Acciones en BUY/SELL. **Pesos** en CASH_IN/CASH_OUT (con `price = 1`). |
| Tenencia | Σ size de BUY `FILLED` − Σ size de SELL `FILLED`, por instrumento. |
| Pesos totales | Σ CASH_IN − Σ CASH_OUT − Σ size×price de BUY + Σ size×price de SELL, todo `FILLED`. |
| Reserva | Lo que aparta una LIMIT `NEW`: size×price en pesos (BUY) o size acciones (SELL). |
| Pesos disponibles | Pesos totales − reservas de BUY `NEW`. |
| Acciones disponibles | Tenencia − reservas de SELL `NEW`. |
| Precio actual | `close` de la fila de `marketdata` con la fecha más reciente del instrumento. |
| Precio promedio | Costo promedio **móvil** de la tenencia actual (ver D-5). |
| Valor de mercado | Tenencia × precio actual. |
| Rendimiento total % | (precio actual − precio promedio) / precio promedio. |
| Rendimiento diario % | (close − previousclose) / previousclose. No es el rendimiento total. |

## Ciclo de vida de la orden

```
send-order ─ validar ─┬─ inválido ─────────────→ 400, no se guarda
                      └─ válido ─ ¿alcanza? ─┬─ no ─→ REJECTED (final)
                                             └─ sí ─┬─ MARKET ─→ FILLED (final, al precio actual)
                                                    └─ LIMIT  ─→ NEW ─ cancelar ─→ CANCELLED (final)
```

`NEW → FILLED` no se implementa: no se simula el mercado (O-2).

## Endpoints

### `GET /portfolio`

Todas las rutas de usuario leen `X-User-Id`. Si falta o no es un entero válido → `400` (D-22).

Respuesta `200`:

| Campo | Fuente |
|-------|--------|
| `totalValue` | Pesos totales + Σ valor de mercado de las posiciones con precio (D-7, D-26) |
| `availableCash` | Pesos disponibles (D-6) |
| `positions[]` | Por instrumento con tenencia ≠ 0: `instrumentId`, `ticker`, `name`, `quantity`, `marketValue`, `averagePrice`, `totalReturnPercentage`. Sin precio: `marketValue` y `totalReturnPercentage` en `null` (D-26) |

### `GET /instruments?q=`

`ILIKE '%q%'` sobre `ticker` y `name`, con los comodines del input escapados. Respuesta `200` con `{ "instruments": [...] }`. Sin paginación por ahora; el objeto envolvente permite sumar `nextCursor` sin romper el contrato (D-24).

### `POST /orders`

Headers `X-User-Id` e `Idempotency-Key: <uuid>` (opcional, D-27). Body: `instrumentId`, `side` (BUY/SELL), `type` (MARKET/LIMIT), `size` (entero) **o** `amount` (string decimal), exactamente uno; `price` (string decimal, solo LIMIT, obligatorio).

| Resultado | HTTP | Se guarda |
|-----------|------|-----------|
| MARKET con saldo | `201` + `Location`, `status: FILLED` | Sí |
| LIMIT con saldo | `201` + `Location`, `status: NEW` | Sí, con reserva |
| Sin saldo / 0 acciones / sin precio | `201` + `Location`, `status: REJECTED`, `rejectionReason` | Sí |
| Reintento, misma clave y mismo body (D-27) | La respuesta original guardada + `Idempotent-Replayed: true` | No (devuelve la original) |
| Misma clave, otro body | `422` | No |
| Request inválido (ver D-8) | `400` | No |

### `POST /orders/:id/cancel`

| Resultado | HTTP |
|-----------|------|
| Orden `NEW` del usuario | `200` con la orden `CANCELLED` |
| Orden en otro estado | `409` |
| Inexistente o de otro usuario | `404` |

## Reglas de send-order

1. Validar (400 si falla): `size > 0` entero, `size` xor `amount`, LIMIT con `price`, instrumento existente, instrumento no `MONEDA`.
2. Abrir transacción y tomar `pg_advisory_xact_lock(userId)` (D-9).
3. Si viene `Idempotency-Key` y ya existe en `idempotency_requests` para el usuario: devolver la respuesta guardada, o `422` si el `request_hash` difiere. Se busca antes de calcular precio o saldo: un reintento de una orden `REJECTED` devuelve el rechazo aunque después haya entrado plata (D-27).
4. Precio: MARKET usa el precio actual; LIMIT usa el del usuario. Sin `marketdata` en MARKET → `REJECTED NO_MARKET_PRICE` con `price` NULL (D-21).
5. Si viene `amount`: `size = floor(amount / precio)`. Si da 0 → `REJECTED AMOUNT_BELOW_ONE_SHARE` con `size` 0 (D-8, D-21).
6. BUY: si size×precio > pesos disponibles → `REJECTED INSUFFICIENT_FUNDS`. SELL: si size > acciones disponibles → `REJECTED INSUFFICIENT_SHARES`.
7. Si no hubo rechazo: MARKET → `FILLED`; LIMIT → `NEW`.
8. Insertar la orden con la clave y el hash, y hacer commit.

## Decisiones

| ID | Decisión | Por qué | Descartado |
|----|----------|---------|------------|
| D-1 | Montos con decimal (`Prisma.Decimal`, decimal.js), nunca `Number`. | `pg` devuelve NUMERIC como string; los floats pierden centavos. | Enteros en centavos: el seed ya guarda `NUMERIC` y `pg` lo devuelve como string exacto; centavos obliga a convertir en cada borde y aun así redondear en las divisiones (promedio, rendimiento). |
| D-2 | NFR obligatorios: NFR-1 a NFR-6. | Protegen la regla central y son baratos. | Rate limiting, métricas, tracing (solo README). |
| D-3 | ~~La idempotencia es obligatoria, no stretch.~~ Reemplazada por D-27. | En fintech un reintento no puede duplicar una orden. | Dejarla para después del core. |
| D-4 | Rendimiento total contra el precio promedio de compra. | Refleja lo que pagaste; la consigna pide usar órdenes `FILLED` para el rendimiento; así lo muestran los brokers. | Rendimiento diario; promedio simple. |
| D-5 | El promedio es **móvil**: una compra lo recalcula, una venta no lo cambia, y con tenencia 0 se reinicia. | Práctica de la industria (Robinhood, IBKR). | Promedio de todas las compras históricas (falla al vender todo y recomprar). |
| D-6 | Una LIMIT `NEW` reserva saldo y lo libera al cancelarse. | Evita comprometer el mismo saldo en varias órdenes. | No reservar (estilo Kraken). |
| D-7 | Valor total = pesos totales + valor de mercado. | La plata reservada sigue siendo del usuario. | Usar los pesos disponibles. |
| D-8 | Si el mismo request nunca podría salir bien → `400`, no se guarda. Si depende del estado de la cuenta o del mercado → `REJECTED`, se guarda. | Separa un request mal formado de una orden válida que hoy no se puede ejecutar. | — |
| D-9 | `pg_advisory_xact_lock(userId)` en send-order y en cancel. | Mantiene `orders` como única fuente de verdad, sin cache; cuesta una línea; no usa `users` como candado. | `FOR UPDATE` en `users`, `SERIALIZABLE` + reintento, tablas de saldos (siguiente paso a escala). |
| D-10 | Stack de gamora-sv recortado: NestJS 11, Prisma 7 + adapter-pg, `@nestjs-cls/transactional`, 4 capas hexagonales, `DomainException` → HTTP, class-validator, Vitest, Pino. | Ya resuelve decimales, transacciones y mapeo de errores. | Soft deletes, Criteria, Doppler, Bruno, Clerk/JWT/throttler. |
| D-11 | `side`, `status`, `type` y `rejection_reason` como ENUM de Postgres. | Un typo como `'FILED'` haría desaparecer una orden de las sumas. | `CHECK IN (...)`. |
| D-12 | `NOT NULL` en toda columna que no puede faltar. | El seed los omitió por descuido; una orden con `userid` NULL es plata sin dueño. | Mantener los NULL del DDL. |
| D-13 | Solo índices de patrones de acceso conocidos: `orders(userid, …)` y `marketdata(instrumentid, date)`. La búsqueda queda sin índice. | Postgres no indexa solas las foreign keys. `ILIKE '%q%'` no usa B-tree y la tabla de instrumentos ocupa una página. | Indexar todo; `pg_trgm` ahora. |
| D-14 | Medir con volumen generado (`generate_series`) y `EXPLAIN ANALYZE`, con y sin índice. Tarea recortable. | Con los datos del seed, el planner siempre lee la tabla entera, y eso engaña. | Medir solo con el seed. |
| D-15 | Migraciones en el repo. Desarrollo y tests contra un Postgres local; Neon solo si Emi confirma. | El Postgres local hace falta igual para los tests, se puede resetear, y aplicar en Neon es un comando. | Migrar Neon directo. |
| D-16 | ~~Reemplazada por D-27.~~ `Idempotency-Key` guardada en `orders` con `UNIQUE (userid, idempotency_key)` y `request_hash`. Reintento → la orden original con `Idempotent-Replayed: true`. | La respuesta ya es la fila de la orden; se inserta en la misma transacción; es el patrón de trading (FIX ClOrdID). D-9 serializa los reintentos simultáneos. | Tabla aparte estilo Stripe; error ante un duplicado (estilo Alpaca). |
| D-17 | send-order responde `201` en `FILLED`, `NEW` y `REJECTED`. | Sin saldo, la API hizo bien su trabajo; todo 4xx dice "el cliente se equivocó"; siempre se crea una orden. | `422`; `200`. |
| D-18 | Cancelar una orden que no está `NEW` → `409`. | El request es válido, pero choca con el estado actual. | `400`. |
| D-19 | Test funcional por HTTP (`supertest`) sobre Postgres de Testcontainers, truncando y recargando el seed entre tests. | Un comando, base limpia; es el patrón de gamora-sv; cubre "la función" y "el endpoint". | docker compose manual; rollback por test (la app abre sus propias transacciones). |
| D-20 | Columna `rejection_reason`, devuelta en la respuesta. Valores: `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `AMOUNT_BELOW_ONE_SHARE`, `NO_MARKET_PRICE`. | Un `REJECTED` sin motivo sirve poco para auditar. Cada nombre dice la causa desde el request del cliente, no el cálculo interno. | Guardar solo el status; `ZERO_SHARES` (nombra el resultado interno `size = 0`, no lo que mandó el cliente). |
| D-21 | En `REJECTED`, `price` puede ser NULL (sin precio) y `size` puede ser 0 (cero acciones), con `CHECK (… OR status = 'REJECTED')`. | Es honesto: un 0 en `price` se leería como "se ejecutó a 0". | Inventar valores. |
| D-22 | El usuario llega en el header `X-User-Id`, leído por un solo guard. Falta o inválido → `400`. Rutas: `GET /portfolio`, `GET /instruments?q=`, `POST /orders`, `POST /orders/:id/cancel`. | Challenge-only identity simulation: authentication is out of scope (O-1). Centralizing identity resolution is intended to keep routes and handlers independent of the identity source and ease future authentication integration. `X-User-Id` is not a validated token: the client can change it. Resource ownership checks use this declared identity and do not prevent impersonation. This is not production security. | Mixto (path en portfolio, body en orders); `/users/:userId/...` en todo. `401` (no hay auth). |
| D-23 | Montos y precios como string decimal en JSON, en request y response (`price`, `amount` validados por formato, si no `400`). Cantidades de acciones como entero. `totalReturnPercentage` como string en por ciento con 2 decimales (`"3.33"`). | `JSON.parse` convierte un número a float antes de que el código lo vea, en el cliente y en el body parser de Nest; el string llega exacto. Un entero de acciones no pierde nada. | Números para la plata; todo string "por consistencia"; fracción `"0.0333"`. |
| D-24 | Búsqueda sin paginación, respuesta envuelta en `{ "instruments": [...] }`. Paginación por cursor (`ticker, id`) como tarea opcional al final. | El seed tiene decenas de filas; un broker real tiene miles (CEDEARs, bonos, ONs), y el objeto permite sumar `nextCursor` sin romper clientes. | Array pelado; paginar ya; offset. |
| D-25 | El portfolio no muestra rendimiento diario. | FR-1 pide solo el rendimiento total; mezclarlos confunde. | `dailyReturnPercentage` por posición. |
| D-26 | Posición sin `marketdata`: `marketValue` y `totalReturnPercentage` en `null`; no suma a `totalValue`. Va como supuesto en el README. | `null` dice "no sabemos"; un 0 diría "no vale nada" (igual que D-21). Sumar lo que tiene precio conserva lo que sí sabemos. La API no puede crear esa tenencia (O-2), es solo defensivo: evita un `500` si la base trae datos de otro origen. | `"0.00"`; `totalValue: null` (borra información verdadera); flag `hasUnpricedPositions` (YAGNI, se suma sin romper el contrato). |
| D-27 | Idempotencia en tabla aparte `idempotency_requests` (`userid`, `operation`, `idempotency_key`, `request_hash`, `order_id`, `response_status`, `response_body`, `UNIQUE (userid, operation, idempotency_key)`), en la misma transacción que la orden. Header opcional. Hash sobre el input validado (no sobre el `size` calculado ni el precio de mercado). Misma clave, otro body → `422`. Es la última tarea; si no entra, va al README. Reemplaza D-3 y D-16. | La clave pertenece al request, no al estado de la orden: el reintento devuelve la respuesta original aunque la orden haya pasado a `CANCELLED`. Primero el core y el test funcional obligatorio, por el tiempo. D-9 sigue serializando reintentos simultáneos. | Columnas en `orders` (D-16); `409` (el draft IETF de `Idempotency-Key` lo reserva para "en proceso"); obligatoria (D-3). |

## Cambios en la base

| Cambio | Decisión |
|--------|----------|
| ENUM para `side`, `status`, `type`, `rejection_reason` | D-11, D-20 |
| `NOT NULL` + `CHECK (size > 0 OR status = 'REJECTED')` + `CHECK (price IS NOT NULL OR status = 'REJECTED')` | D-12, D-21 |
| Columna `rejection_reason` en `orders` | D-20 |
| Tabla `idempotency_requests` (recortable) | D-27 |
| Índices `orders(userid, …)` y `marketdata(instrumentid, date)` | D-13 |

## Fuera de alcance

| ID | Qué | Por qué |
|----|-----|---------|
| O-1 | Autenticación; el usuario viene en el header `X-User-Id` (D-22) | La consigna: "NO es necesario implementar autenticación". |
| O-2 | Ejecutar LIMIT `NEW` cuando el precio llega | "NO hace falta simular el mercado". |
| O-3 | Ejecuciones parciales | Solo existe `FILLED`, todo o nada. |
| O-4 | Comisiones e impuestos | No hay datos de comisiones; inventar una tasa sería arbitrario. |
| O-5 | Liquidación T+1 y horario de mercado | MARKET se ejecuta al enviarse. |
| O-6 | Otras monedas | "Los precios… tienen que estar en pesos". |
| O-7 | P&L realizado y lotes FIFO | La consigna pide solo rendimiento total. |
| O-8 | Endpoints de transferencias | Las transferencias son las órdenes CASH_IN/OUT del seed. |
| O-9 | Búsqueda fuzzy (tolerar typos) | Decenas de instrumentos; el README nombra el umbral para `pg_trgm`. La paginación es opcional (D-24). |
| O-10 | Rate limiting, métricas, tracing | Sin auth no protegen nada por usuario; van al README. |

**Lista de recortes, en orden:** idempotencia (D-27), colección REST Client (`.http`), paginación por cursor (D-24), medición D-14.

## Trampas del seed

- `orders.size` es `INT`: los montos de CASH_IN/OUT son pesos enteros.
- Instrumentos sin `marketdata`: 3 (PGR), 10 (IRCP) y 66 (ARS).
- Usuario 1, instrumento 31: BUY 20 + SELL 30, ambas `FILLED`. Tenencia −10. Es una inconsistencia del seed: se muestra tal cual y se documenta.
- Columnas en minúscula (`instrumentid`, `previousclose`): Prisma necesita `db pull` + `@map`.

## Preguntas a Emi

| # | Pregunta | Supuesto si no responde |
|---|----------|-------------------------|
| 1 | ¿La base de Neon es solo mía? ¿Puedo correr migraciones ahí? | Es compartida: migraciones solo en local (D-15). |
| 2 | ¿"Rendimiento total" es contra el precio promedio de compra o contra el cierre anterior? | Precio promedio móvil (D-4, D-5). |
| 3 | Un monto que no alcanza para una acción: ¿`REJECTED` o error sin guardar? | `REJECTED` (D-8). |

## Siguiente paso

Escribir `docs/tasks/TASKS.md` (lo escribe el usuario, fase 5 del coach): tareas ordenadas, de tamaño S, cada una con los nombres de sus tests y la lista de cuáles pueden ir en paralelo.
