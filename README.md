# Cocos API

A REST API for a small broker. A user can see their portfolio, search instruments, send BUY/SELL orders (MARKET or LIMIT) and cancel open LIMIT orders. Node.js 22, NestJS 11, Prisma 7, Postgres 17.

Balances and holdings are never stored. They are computed from the `orders` table on every request.

| Endpoint | What it does |
|----------|--------------|
| `GET /portfolio` | Total account value, available cash, and per position: quantity, market value, average price, total return %. |
| `GET /instruments?query=` | Search by ticker and/or name. |
| `POST /orders` | Send a BUY/SELL, MARKET/LIMIT order, by `size` (shares) or `amount` (ARS). Optional `Idempotency-Key`. |
| `POST /orders/:id/cancel` | Cancel a `NEW` order. |

There is no authentication. The user comes in the `X-User-Id` header (the brief says auth is not needed). Any client can send any id, so this is not security.

Every design decision has an ID (D-1, D-2, ...) in [docs/SPEC.md](docs/SPEC.md), with the reason and the rejected options. This README repeats the ones a reviewer needs. It stands on its own.

## Run it

Prerequisites: Node 22 (`.nvmrc`), npm, Docker.

```bash
cp .env.example .env     # DATABASE_URL points to the local Postgres on port 5434
npm ci
npm run db:up            # Postgres 17 in Docker, loaded with database.sql
npm run db:baseline      # first time only, see below
npm run db:migrate
npm run start:dev        # http://localhost:3000 (set PORT to change it)
```

Why `db:baseline`: `database.sql` already creates the original tables. The first migration (`0_init`) is those same tables, so it is marked as applied and not run. Run `db:baseline` before `db:migrate` on a database that was just created. If the database is already baselined, `db:baseline` fails with `P3008` and does nothing; that is fine.

Prisma 7 does not read `.env` by itself. `prisma.config.ts` and `src/main.ts` load it.

Other database commands: `npm run db:down` stops Postgres. `npm run db:reset` also deletes the data volume. `docker-compose.yml` fixes the project name, so every checkout of this repo on one machine shares the same container and volume.

### Try the endpoints

Every route needs `X-User-Id`. The seed has users 1 to 4. Use `-i` to see headers.

```bash
H='X-User-Id: 1'
B=http://localhost:3000

# Portfolio
curl -s $B/portfolio -H "$H"

# Search (ticker or name, case-insensitive)
curl -s "$B/instruments?query=pam" -H "$H"

# MARKET order by shares
curl -s -i -X POST $B/orders -H "$H" -H 'Content-Type: application/json' \
  -d '{"instrumentId":47,"side":"BUY","type":"MARKET","size":2}'

# MARKET order by amount in ARS (shares are floored)
curl -s -X POST $B/orders -H "$H" -H 'Content-Type: application/json' \
  -d '{"instrumentId":47,"side":"BUY","type":"MARKET","amount":"10000.00"}'

# LIMIT order (price is required) with an Idempotency-Key. Run it twice:
# the second answer is the stored one, with the header Idempotent-Replayed: true.
curl -s -i -X POST $B/orders -H "$H" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1c0d9e-2b7a-4c1e-9a53-0d6a1f2b8c41' \
  -d '{"instrumentId":47,"side":"BUY","type":"LIMIT","size":1,"price":"1.00"}'

# Cancel the order from the answer above (replace <id> with its id). Cancelling twice returns 200 both times.
curl -s -X POST $B/orders/<id>/cancel -H "$H"
```

Rules for the order body: `instrumentId`, `side`, `type`, and exactly one of `size` (integer) or `amount` (decimal string). `price` is a decimal string, required for LIMIT, not allowed for MARKET. Money has at most 2 decimals. Errors have one shape: `{ statusCode, code, message, requestId }`. A `REJECTED` order is not an error: it is a `201` with `status: "REJECTED"` and a `rejectionReason` (see D-17).

### Tests

| Command | What it runs |
|---------|--------------|
| `npm test` | Unit tests. No database, no Docker. |
| `npm run test:e2e` | HTTP tests with supertest against a real Postgres. **Needs Docker**: Testcontainers starts its own throwaway Postgres loaded with the seed. It does not touch the `db:up` database. |
| `npm run lint`, `npm run typecheck`, `npm run build` | Static checks. CI runs all of these plus both test commands. |

## Architecture

The code is hexagonal: each module (`orders`, `portfolio`, `instruments`) has `domain`, `application` and `infrastructure` folders. Use cases depend on ports (interfaces); Prisma adapters implement them.

This is more structure than three endpoints need. A controller and a few queries would be shorter. It was chosen on purpose, for one reason: to keep the money rules apart from NestJS and the database. Three pieces hold those rules and are plain TypeScript with no I/O:

- `SummarizeLedgerService` (`src/orders/domain/services/`): cash, reservations, holdings and the moving average price from a list of orders.
- `Order` (`src/orders/domain/entities/`): decides `FILLED`, `NEW` or `REJECTED` and why.
- `BuildPortfolioService` (`src/portfolio/domain/services/`): market value and total return.

They have unit tests that run without a database. The HTTP and Postgres behaviour is covered by the e2e tests. Instrument search is kept thin on purpose: one query, no domain model.

## Key decisions

| Topic | Decision |
|-------|----------|
| Money | `decimal.js` end to end, never `Number`. Amounts and prices are decimal strings in JSON. Shares are integers. Input has at most 2 decimals and is rejected, not rounded. Output is rounded once, half up, to 2 decimals (D-1, D-23, D-30). |
| Ledger | Cash and shares are derived from `FILLED` orders. A `NEW` LIMIT reserves cash (BUY) or shares (SELL) until it is cancelled (D-6). `totalValue` includes reserved cash (D-7). |
| Average price | Moving average: a buy recomputes it, a sell keeps it, holding 0 resets it. Orders are replayed by `datetime ASC, id ASC` (D-5, D-33). Total return is against this average, not the previous close (D-4). |
| Concurrency | Send-order and cancel start with `pg_advisory_xact_lock(1, userId)` in a `READ COMMITTED` transaction. There is no row to lock, because balances come from all orders (D-9). |
| Portfolio read | One `REPEATABLE READ READ ONLY` transaction, so cash and reservations come from one snapshot (D-35). |
| Idempotency | Optional `Idempotency-Key` (a UUID). A table `idempotency_requests` stores the request hash and the first response, in the same transaction as the order. Same key and body: the stored response again. Same key, other body: `422 IDEMPOTENCY_KEY_CONFLICT`. A retry returns the original answer even if the order changed since (D-27). |
| Bad request vs rejected order | A request that can never succeed is a `400` and is not stored. A valid request that cannot run now (no funds, no shares, no price, amount below one share on MARKET) is stored as `REJECTED` (D-8, D-20, D-31). |
| Cancel | `NEW` becomes `CANCELLED`. Cancelling a `CANCELLED` order returns `200` unchanged. A `FILLED` or `REJECTED` order gives `409`. Missing or another user's order gives `404` (D-18). |
| Search | `ILIKE` on ticker and name, wildcards escaped, `MONEDA` excluded, ranked: exact ticker, ticker prefix, name prefix, other. Missing `query` is `400`; an empty one is `200` with an empty list (D-36, D-37, D-38). No pagination (D-24). |
| Logs and errors | One request id per request, in logs, the `X-Request-Id` header and the error body. A `500` is logged with its stack and returns none. Each order outcome logs one line, with no balances (D-29, D-40). |

### Assumptions

- **No market price (D-26).** A position whose instrument has no `marketdata` shows `marketValue` and `totalReturnPercentage` as `null` and adds nothing to `totalValue`. `null` means "unknown"; `0` would say "worth nothing". The API cannot create such a holding, so this only protects against data from elsewhere. In the seed, instruments 3, 10 and 66 have no `marketdata`.
- **`NEW` LIMIT orders never fill.** The brief says the market need not be simulated (O-2). A `NEW` order stays `NEW` until the user cancels it.
- **MARKET orders fill at the latest `close`** of the instrument, as the brief says.
- **Identity is the `X-User-Id` header.** A missing, malformed or unknown user is a `400` with `MISSING_USER_ID`, `INVALID_USER_ID` or `UNKNOWN_USER` (D-22). With real auth this would become `401`.

### Seed pitfalls

- `orders.size` is `INT`, so CASH_IN/CASH_OUT amounts are whole pesos.
- Columns are lowercase (`instrumentid`, `previousclose`), so Prisma maps them with `@map`.
- The brief says `marketdata.datetime`. `database.sql` creates `marketdata.date` (a `DATE`). The SQL wins; the code uses `date`.
- Seed order 6 is the only `REJECTED` row and had no reason. The migration sets it to `INSUFFICIENT_SHARES`: user 1 held 40 shares of instrument 47 when it asked to sell 100.

### The negative holding in the seed

User 1 has two `FILLED` orders on instrument 31 (BMA): BUY 20 and SELL 30. The holding is -10. It shows up when you replay the seed orders per user and instrument, which is what the ledger does. The seed is hand-written, and a rule the API enforces on new orders (you cannot sell shares you do not hold) was never applied to it. There is also a `NEW` LIMIT BUY 60 on the same instrument. If it were filled, the holding would be 50, which hints that the author meant it that way. But positions count only `FILLED` orders, so it does not count.

The API shows the holding as it is (D-34): `quantity: -10`, a negative `marketValue` (it lowers `totalValue`, because the sale already added its cash), and `averagePrice` and `totalReturnPercentage` as `null`. Hiding or clamping it would invent a fact. It is covered by a unit test and an e2e test.

The API never creates a negative holding. A new SELL needs available shares, or it is stored as `REJECTED INSUFFICIENT_SHARES`. There is no short selling.

### Database changes

All of this is in `prisma/migrations/`. The first migration is the baseline. The second makes the changes below. The third creates `idempotency_requests`.

| Change | Why |
|--------|-----|
| ENUMs for `side`, `status`, `type` (orders and instruments) and `rejection_reason` | A typo like `'FILED'` would make an order vanish from the sums. Prisma also generates TypeScript types from them (D-11). |
| `NOT NULL` on every column that cannot be missing, except `price` and `size` | The seed left them nullable by oversight. An order with no `userid` is money without an owner (D-12). |
| `CHECK`s on `price`, `size` and `size > 0`, which only `REJECTED` rows may break | A rejected order can have no price (no market data) or no known size. The checks stop a `FILLED` row with NULL or 0 from ever existing (D-21). |
| New column `rejection_reason`, and `CHECK ((status = 'REJECTED') = (rejection_reason IS NOT NULL))` | Every rejection says why, and nothing else carries a reason (D-20, D-28). |
| New nullable column `cancelled_at`, and `CHECK (cancelled_at IS NULL OR status = 'CANCELLED')` | Cancel is the only change an order allows, and it left no time. Without it nobody can rebuild past balances. Seed `CANCELLED` rows keep NULL: the time is unknown (D-39). |
| Index `orders(userid)` | Send-order and portfolio read all of one user's orders. `userid` is the selective filter (D-13). |
| Unique index `marketdata(instrumentid, date)` | One bar per instrument per day. With two on the same day, a MARKET order could fill at either `close` (D-13). |
| Table `idempotency_requests`, unique on `(userid, operation, idempotency_key)` | It stores the answer to a keyed request. It has its own migration because it ships with the code that uses it (D-27). |

I did not add other indexes. Search has none: `ILIKE '%q%'` cannot use a B-tree and the table is small.

### Questions for Emi

I did not get answers. These are the assumptions in the code.

| # | Question | Assumption |
|---|----------|------------|
| 1 | Is the Neon database only mine? Can I run migrations there? | It is shared. Migrations ran only on a local Postgres (D-15). |
| 2 | Is "total return" against the average purchase price or the previous close? | Moving average purchase price. The brief's daily return uses `close` and `previousclose`; the portfolio does not show it (D-4, D-25). |
| 3 | An amount below one share: `REJECTED` or an error without saving? | MARKET: `REJECTED AMOUNT_BELOW_ONE_SHARE`. LIMIT: `400`, because the client set the price and it can never succeed (D-8, D-31). |

### Applying migrations to a remote database

This is a manual step. Nothing in the repo points at a remote database, and I did not run one. If you need it:

1. Type the URL in your shell for that one command: `DATABASE_URL='postgresql://...' npm run db:migrate`.
2. Never write it in `.env`. A remote URL in `.env` would be used by every command, including the dev server.
3. If the database already holds the seed, run `npm run db:baseline` first. Check the data against the migration's `NOT NULL`, ENUM and `CHECK` rules before you migrate: a row that breaks one makes the migration fail.

There is no guard against a remote URL left exported in a terminal.

## Known gaps and scale

| Gap | Why not now |
|-----|-------------|
| Output is rounded to 2 decimals. A client that computes with `averagePrice` loses precision. | The brief asks for a user view. Full-precision fields can be added next to the rounded ones without breaking clients. |
| A `NEW` LIMIT never fills and never expires. | No market simulation (O-2). A later matcher would fill it under the same per-user lock. The reservation already holds the cash. |
| Balances are recomputed from all of a user's orders on each request. | Fast at about 100 orders per user, and the brief asks for it. At larger volumes, keep a balance snapshot updated in the same transaction, with `orders` still the source of truth. |
| No pagination in search. | The seed has dozens of instruments. The `{ "instruments": [] }` wrapper lets `nextCursor` be added later. |
| No index measurement with generated volume (`EXPLAIN ANALYZE`). | Not done (D-14). The index choices are reasoned, not measured. |

## Left out

| ID | What | Why |
|----|------|-----|
| O-1 | Authentication | The brief says it is not needed. |
| O-2 | Filling `NEW` LIMIT orders when the price arrives | The brief: no need to simulate the market. |
| O-3 | Partial fills | Only all-or-nothing `FILLED` exists. |
| O-4 | Fees and taxes | No fee data; a rate would be invented. |
| O-5 | T+1 settlement, market hours | MARKET fills on submission. |
| O-6 | Other currencies | Prices are in pesos. |
| O-7 | Realized P&L, FIFO lots | The brief asks only for total return. |
| O-8 | Transfer endpoints | Transfers are the CASH_IN/CASH_OUT orders of the seed. |
| O-9 | Fuzzy search (typos) | Dozens of instruments. `pg_trgm` is the next step. |
| O-10 | Rate limiting, metrics, tracing | Without auth they protect nothing per user. |

Cuts from the SPEC cut list: the REST Client collection (`.http`) was not made; the curl examples above stand in for it. Cursor pagination was not built. The index measurement was not done. Nothing else was cut. All four endpoints, cancellation and idempotency are built.

## Limits

These are known and not fixed.

- **`INT` ids.** `users`, `instruments` and `orders` use `SERIAL` (4-byte `INT`) because the provided schema does. The limit is about 2.1 billion, and `orders.id` would be the first to reach it. `bigint` is the better choice for a real system. The code checks `2147483647` as the maximum id and share count.
- **Connection pool.** The pool keeps the default of 10 connections and Prisma waits only a short time (its default of 2 seconds, not set in the code) to start a transaction. Each order or cancel holds a connection while it waits for the per-user lock. Many parallel requests from one user can run out of waiting time and fail with `P2028`, which the API returns as a `500`. Prisma's default transaction timeout (5 seconds, also not set in the code) limits how long a request can sit in that queue. These defaults were not tested here. The tests use two parallel orders per case, so they do not hit this.
- **Shutdown is not graceful.** `enableShutdownHooks` is on, but Nest runs `onModuleDestroy` first, and `PrismaService` disconnects there, before the HTTP server stops. In-flight requests can fail on a closed database. It is not a drain.
- **`Location` points nowhere.** `POST /orders` returns `Location: /orders/:id`, but there is no `GET /orders/:id`. The header is correct for REST; the route does not exist.
- **Concurrency tests.** The send-order test and the idempotency test fail when the lock is removed: 5 of 5 runs in each case when the lock was removed by hand while the tests were written; I did not repeat this for the README. The cancel test does not detect a missing lock, because a cancel only frees cash, so a race still gives a valid result. It checks that the final state is consistent, not that the lock exists. The lock on cancel stays by design (D-9).
- **Validation order.** Body parser errors (malformed JSON, body too large) come before the user guard, so they return `400 VALIDATION_ERROR` even without `X-User-Id`. Field validation of a valid JSON body runs after the guard.
- **Remote database.** Migrations were only ever applied to a local Postgres (see above).
- **No `GET` for orders or order history.** The brief does not ask for it.
