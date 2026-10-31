# SPEC: Portfolio, search and orders API

REST API in Node.js on Postgres with three endpoints: portfolio, instrument search and order submission, plus cancellation. This document records the design decisions made before writing code. Each decision says what was chosen, why, and what was rejected.

Cancellation is mandatory in the user-selected delivery scope.

Idempotency is mandatory for this delivery, overriding earlier removable classifications; the optional `Idempotency-Key` is a client-generated UUID per logical order, reused on retries; for matching user, operation, key and validated input, the server atomically stores the request hash, order and original response and replays that response without creating another order.

> The user comes in the `X-User-Id` header (D-22). Amounts and prices travel as decimal strings (D-23). No open notes remain.

## Problem

A broker user needs to see how much their account is worth and each position, search assets by ticker or name, and submit buy and sell orders. Orders are the ledger: balances and holdings are always computed from the `orders` table.

### Functional requirements

| ID | The user can… |
|----|-------------------|
| FR-1 | See their portfolio: total account value, available cash and, per position, quantity, market value in ARS and total return %. |
| FR-2 | Search instruments by ticker and/or name. |
| FR-3 | Submit a BUY/SELL, MARKET/LIMIT order, by exact quantity or by ARS amount (floor to whole shares). |
| FR-4 | Cancel a `NEW` order. |

### Non-functional requirements

| ID | The system must… |
|----|------------------|
| NFR-1 | With concurrent orders from the same user, never leave available cash or shares below zero. Each order is evaluated against the balance left by the already confirmed orders, and the one that does not fit is saved `REJECTED`. |
| NFR-2 | Not compute amounts with JS floats. Share quantities are integers. |
| NFR-3 | Be idempotent in send-order: a retry does not create a second order. **Cuttable** (D-27): last task; if it does not fit, it goes to the README. |
| NFR-4 | Treat orders as immutable. The only allowed change is `NEW → CANCELLED`. |
| NFR-5 | Read the portfolio from a single consistent snapshot of the database. |
| NFR-6 | Validate input at the edge and use parameterized queries, with no stack traces in responses. |

## Glossary

| Term | Meaning here |
|------|-----------------|
| Instrument | An asset (`ACCIONES`) or the currency (`MONEDA`). ARS is instrument id 66. |
| Order | A row of `orders`. Every order is saved, even rejected ones. |
| `size` | Shares in BUY/SELL. **Pesos** in CASH_IN/CASH_OUT (with `price = 1`). |
| Holding | Σ size of `FILLED` BUY − Σ size of `FILLED` SELL, per instrument. |
| Total cash | Σ CASH_IN − Σ CASH_OUT − Σ size×price of BUY + Σ size×price of SELL, all `FILLED`. |
| Reservation | What a `NEW` LIMIT sets aside: size×price in pesos (BUY) or size shares (SELL). |
| Available cash | Total cash − reservations of `NEW` BUY. |
| Available shares | Holding − reservations of `NEW` SELL. |
| Current price | `close` of the `marketdata` row with the most recent date for the instrument. |
| Average price | **Moving** average cost of the current holding (see D-5). |
| Market value | Holding × current price. |
| Total return % | (current price − average price) / average price. |
| Daily return % | (close − previousclose) / previousclose. It is not the total return. |

## Order lifecycle

```
send-order ─ validate ─┬─ invalid ──────────────→ 400, not stored
                       └─ valid ─ enough? ─┬─ no ─→ REJECTED (final)
                                           └─ yes ─┬─ MARKET ─→ FILLED (final, at current price)
                                                   └─ LIMIT  ─→ NEW ─ cancel ─→ CANCELLED (final)
```

`NEW → FILLED` is not implemented: the market is not simulated (O-2).

## Endpoints

### `GET /portfolio`

All user routes read `X-User-Id`. If it is missing or not a valid integer → `400` (D-22).

Response `200`:

| Field | Source |
|-------|--------|
| `totalValue` | Total cash + Σ market value of positions with a price (D-7, D-26) |
| `availableCash` | Available cash (D-6) |
| `positions[]` | Per instrument with holding ≠ 0: `instrumentId`, `ticker`, `name`, `quantity`, `marketValue`, `averagePrice`, `totalReturnPercentage`. Without a price: `marketValue` and `totalReturnPercentage` are `null` (D-26) |

### `GET /instruments?q=`

`ILIKE '%q%'` on `ticker` and `name`, with the input wildcards escaped. Response `200` with `{ "instruments": [...] }`. No pagination for now; the wrapper object allows adding `nextCursor` without breaking the contract (D-24).

### `POST /orders`

Headers `X-User-Id` and `Idempotency-Key: <uuid>` (optional, D-27). Body: `instrumentId`, `side` (BUY/SELL), `type` (MARKET/LIMIT), `size` (integer) **or** `amount` (decimal string), exactly one; `price` (decimal string, LIMIT only, required).

| Result | HTTP | Stored |
|-----------|------|-----------|
| MARKET with funds | `201` + `Location`, `status: FILLED` | Yes |
| LIMIT with funds | `201` + `Location`, `status: NEW` | Yes, with reservation |
| No funds / 0 shares / no price | `201` + `Location`, `status: REJECTED`, `rejectionReason` | Yes |
| Retry, same key and same body (D-27) | The original stored response + `Idempotent-Replayed: true` | No (returns the original) |
| Same key, different body | `422` | No |
| Invalid request (see D-8) | `400` | No |

### `POST /orders/:id/cancel`

| Result | HTTP |
|-----------|------|
| `NEW` order of the user | `200` with the `CANCELLED` order |
| Order in another status | `409` |
| Nonexistent or of another user | `404` |

## Send-order rules

1. Validate (400 if it fails): integer `size > 0`, `size` xor `amount`, LIMIT with `price`, existing instrument, instrument not `MONEDA`.
2. Open a transaction and take `pg_advisory_xact_lock(userId)` (D-9).
3. If `Idempotency-Key` is present and already exists in `idempotency_requests` for the user: return the stored response, or `422` if the `request_hash` differs. It is looked up before computing price or balance: a retry of a `REJECTED` order returns the rejection even if money came in later (D-27).
4. Price: MARKET uses the current price; LIMIT uses the user's. No `marketdata` in MARKET → `REJECTED NO_MARKET_PRICE` with `price` NULL (D-21).
5. If `amount` is present: `size = floor(amount / price)`. If it gives 0 → `REJECTED AMOUNT_BELOW_ONE_SHARE` with `size` 0 (D-8, D-21).
6. BUY: if size×price > available cash → `REJECTED INSUFFICIENT_FUNDS`. SELL: if size > available shares → `REJECTED INSUFFICIENT_SHARES`.
7. If there was no rejection: MARKET → `FILLED`; LIMIT → `NEW`.
8. Insert the order with the key and the hash, and commit.

## Decisions

| ID | Decision | Why | Rejected alternatives |
|----|----------|---------|-----------|
| D-1 | Amounts with decimal (`Prisma.Decimal`, decimal.js), never `Number`. | `pg` returns NUMERIC as a string; floats lose cents. | Integers in cents: the seed already stores `NUMERIC` and `pg` returns it as an exact string; cents forces a conversion at every edge and still needs rounding in divisions (average, return). |
| D-2 | Mandatory NFRs: NFR-1 to NFR-6. | They protect the core rule and are cheap. | Rate limiting, metrics, tracing (README only). |
| D-3 | ~~Idempotency is mandatory, not a stretch.~~ Replaced by D-27. | In fintech a retry cannot duplicate an order. | Leave it for after the core. |
| D-4 | Total return against the average purchase price. | It reflects what you paid; the brief asks to use `FILLED` orders for the return; brokers show it this way. | Daily return; simple average. |
| D-5 | The average is **moving**: a buy recomputes it, a sell does not change it, and with holding 0 it resets. | Industry practice (Robinhood, IBKR). | Average of all historical buys (fails when selling everything and buying again). |
| D-6 | A `NEW` LIMIT reserves balance and releases it when cancelled. | Avoids committing the same balance to several orders. | Do not reserve (Kraken style). |
| D-7 | Total value = total cash + market value. | Reserved money still belongs to the user. | Use available cash. |
| D-8 | If the same request could never succeed → `400`, not stored. If it depends on the account or market state → `REJECTED`, stored. | Separates a malformed request from a valid order that cannot be executed today. | — |
| D-9 | `pg_advisory_xact_lock(userId)` in send-order and in cancel. | Keeps `orders` as the single source of truth, with no cache; costs one line; does not use `users` as a lock. | `FOR UPDATE` on `users`, `SERIALIZABLE` + retry, balance tables (next step at scale). |
| D-10 | Trimmed gamora-sv stack: NestJS 11, Prisma 7 + adapter-pg, `@nestjs-cls/transactional`, 4 hexagonal layers, `DomainException` → HTTP, class-validator, Vitest, Pino. | It already solves decimals, transactions and error mapping. | Soft deletes, Criteria, Doppler, Bruno, Clerk/JWT/throttler. |
| D-11 | `side`, `status`, `type` and `rejection_reason` as Postgres ENUMs. | A typo like `'FILED'` would make an order vanish from the sums. | `CHECK IN (...)`. |
| D-12 | `NOT NULL` on every column that cannot be missing. | The seed omitted them by oversight; an order with NULL `userid` is money without an owner. | Keep the DDL NULLs. |
| D-13 | Only indexes for known access patterns: `orders(userid, …)` and `marketdata(instrumentid, date)`. Search stays without an index. | Postgres does not index foreign keys on its own. `ILIKE '%q%'` does not use B-tree and the instruments table fits in one page. | Index everything; `pg_trgm` now. |
| D-14 | Measure with generated volume (`generate_series`) and `EXPLAIN ANALYZE`, with and without index. Cuttable task. | With the seed data, the planner always reads the whole table, and that misleads. | Measure only with the seed. |
| D-15 | Migrations in the repo. Development and tests against a local Postgres; Neon only if Emi confirms. | The local Postgres is needed for tests anyway, it can be reset, and applying to Neon is one command. | Migrate Neon directly. |
| D-16 | ~~Replaced by D-27.~~ `Idempotency-Key` stored in `orders` with `UNIQUE (userid, idempotency_key)` and `request_hash`. Retry → the original order with `Idempotent-Replayed: true`. | The response is already the order row; it is inserted in the same transaction; it is the trading pattern (FIX ClOrdID). D-9 serializes simultaneous retries. | Separate table Stripe style; error on a duplicate (Alpaca style). |
| D-17 | send-order responds `201` on `FILLED`, `NEW` and `REJECTED`. | Without funds, the API did its job right; every 4xx says "the client made a mistake"; an order is always created. | `422`; `200`. |
| D-18 | Cancelling an order that is not `NEW` → `409`. | The request is valid, but it conflicts with the current state. | `400`. |
| D-19 | Functional test over HTTP (`supertest`) on Testcontainers Postgres, truncating and reloading the seed between tests. | One command, clean database; it is the gamora-sv pattern; it covers "the function" and "the endpoint". | Manual docker compose; rollback per test (the app opens its own transactions). |
| D-20 | `rejection_reason` column, returned in the response. Values: `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `AMOUNT_BELOW_ONE_SHARE`, `NO_MARKET_PRICE`. | A `REJECTED` without a reason is of little use for auditing. Each name states the cause from the client's request, not the internal computation. | Store only the status; `ZERO_SHARES` (names the internal result `size = 0`, not what the client sent). |
| D-21 | In `REJECTED`, `price` can be NULL (no price) and `size` can be 0 (zero shares), with `CHECK (… OR status = 'REJECTED')`. | It is honest: a 0 in `price` would read as "executed at 0". | Invent values. |
| D-22 | The user comes in the `X-User-Id` header, read by a single guard. Missing or invalid → `400`. Routes: `GET /portfolio`, `GET /instruments?q=`, `POST /orders`, `POST /orders/:id/cancel`. | Challenge-only identity simulation: authentication is out of scope (O-1). Centralizing identity resolution is intended to keep routes and handlers independent of the identity source and ease future authentication integration. `X-User-Id` is not a validated token: the client can change it. Resource ownership checks use this declared identity and do not prevent impersonation. This is not production security. | Mixed (path in portfolio, body in orders); `/users/:userId/...` everywhere. `401` (there is no auth). |
| D-23 | Amounts and prices as decimal strings in JSON, in request and response (`price`, `amount` validated by format, otherwise `400`). Share quantities as integers. `totalReturnPercentage` as a string in percent with 2 decimals (`"3.33"`). | `JSON.parse` turns a number into a float before the code sees it, in the client and in Nest's body parser; the string arrives exact. An integer share count loses nothing. | Numbers for money; everything as a string "for consistency"; fraction `"0.0333"`. |
| D-24 | Search without pagination, response wrapped in `{ "instruments": [...] }`. Cursor pagination (`ticker, id`) as an optional task at the end. | The seed has dozens of rows; a real broker has thousands (CEDEARs, bonds, ONs), and the object allows adding `nextCursor` without breaking clients. | Bare array; paginate now; offset. |
| D-25 | The portfolio does not show daily return. | FR-1 asks only for the total return; mixing them confuses. | `dailyReturnPercentage` per position. |
| D-26 | Position without `marketdata`: `marketValue` and `totalReturnPercentage` are `null`; it does not add to `totalValue`. Goes as an assumption in the README. | `null` says "we don't know"; a 0 would say "it is worth nothing" (same as D-21). Summing what has a price keeps what we do know. The API cannot create that holding (O-2), it is only defensive: it avoids a `500` if the database brings data from another source. | `"0.00"`; `totalValue: null` (erases true information); `hasUnpricedPositions` flag (YAGNI, it can be added without breaking the contract). |
| D-27 | Idempotency in a separate table `idempotency_requests` (`userid`, `operation`, `idempotency_key`, `request_hash`, `order_id`, `response_status`, `response_body`, `UNIQUE (userid, operation, idempotency_key)`), in the same transaction as the order. Optional header. Hash over the validated input (not over the computed `size` or the market price). Same key, different body → `422`. It is the last task; if it does not fit, it goes to the README. Replaces D-3 and D-16. | The key belongs to the request, not to the order state: the retry returns the original response even if the order moved to `CANCELLED`. Core first and the mandatory functional test, because of time. D-9 still serializes simultaneous retries. | Columns in `orders` (D-16); `409` (the IETF `Idempotency-Key` draft reserves it for "in progress"); mandatory (D-3). |

## Database changes

| Change | Decision |
|--------|----------|
| ENUM for `side`, `status`, `type`, `rejection_reason` | D-11, D-20 |
| `NOT NULL` + `CHECK (size > 0 OR status = 'REJECTED')` + `CHECK (price IS NOT NULL OR status = 'REJECTED')` | D-12, D-21 |
| `rejection_reason` column in `orders` | D-20 |
| `idempotency_requests` table (cuttable) | D-27 |
| Indexes `orders(userid, …)` and `marketdata(instrumentid, date)` | D-13 |

## Out of scope

| ID | What | Why |
|----|-----|---------|
| O-1 | Authentication; the user comes in the `X-User-Id` header (D-22) | The brief: "User authentication does NOT need to be implemented". |
| O-2 | Executing `NEW` LIMIT when the price arrives | "There is NO need to simulate the market". |
| O-3 | Partial fills | Only `FILLED` exists, all or nothing. |
| O-4 | Fees and taxes | There is no fee data; inventing a rate would be arbitrary. |
| O-5 | T+1 settlement and market hours | MARKET executes on submission. |
| O-6 | Other currencies | "Prices… must be in pesos". |
| O-7 | Realized P&L and FIFO lots | The brief asks only for total return. |
| O-8 | Transfer endpoints | Transfers are the CASH_IN/OUT orders of the seed. |
| O-9 | Fuzzy search (tolerating typos) | Dozens of instruments; the README names the threshold for `pg_trgm`. Pagination is optional (D-24). |
| O-10 | Rate limiting, metrics, tracing | Without auth they protect nothing per user; they go to the README. |

**Cut list, in order:** idempotency (D-27), REST Client collection (`.http`), cursor pagination (D-24), D-14 measurement.

## Seed pitfalls

- `orders.size` is `INT`: CASH_IN/OUT amounts are whole pesos.
- Instruments without `marketdata`: 3 (PGR), 10 (IRCP) and 66 (ARS).
- User 1, instrument 31: BUY 20 + SELL 30, both `FILLED`. Holding −10. It is a seed inconsistency: it is shown as is and documented.
- Lowercase columns (`instrumentid`, `previousclose`): Prisma needs `db pull` + `@map`.

## Questions for Emi

| # | Question | Assumption if no answer |
|---|----------|-------------------------|
| 1 | Is the Neon database only mine? Can I run migrations there? | It is shared: migrations only locally (D-15). |
| 2 | Is "total return" against the average purchase price or against the previous close? | Moving average price (D-4, D-5). |
| 3 | An amount that does not reach one share: `REJECTED` or an error without saving? | `REJECTED` (D-8). |

## Next step

Write `docs/tasks/TASKS.md` (written by the user, coach phase 5): ordered tasks, size S, each with the names of its tests and the list of which can run in parallel.
