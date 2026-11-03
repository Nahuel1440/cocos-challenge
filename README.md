# Cocos API

A REST API for a small broker: view a portfolio, search instruments, submit BUY/SELL orders (MARKET or LIMIT), and cancel open LIMIT orders. Built with Node.js 22, NestJS 11, Prisma 7 and Postgres 17.

Orders are the ledger. Cash and holdings are computed from `orders` on each request, rather than stored as separate balances.

## Quick start

Prerequisites: Node 22 (`.nvmrc`), npm, Docker, and free local ports 5434 (Postgres) and 3000 (API).

```bash
git clone https://github.com/Nahuel1440/cocos-challenge.git
cd cocos-challenge
cp .env.example .env
npm ci
npm run db:up            # Postgres 17, initialized with database.sql
npm run db:baseline      # first time, and after db:reset
npm run db:migrate
npm run start:dev        # http://localhost:3000
```

In another terminal:

```bash
curl -s -i http://localhost:3000/portfolio -H 'X-User-Id: 1'
```

On a fresh seed, expect `200`, `totalValue: "889756.00"` and `availableCash: "627500.00"`. This excerpt shows one complete position; the full response also includes BMA and METR:

```json
{
  "totalValue": "889756.00",
  "availableCash": "627500.00",
  "positions": [
    {
      "instrumentId": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "quantity": 40,
      "marketValue": "37034.00",
      "averagePrice": "930.00",
      "totalReturnPercentage": "-0.45"
    }
  ]
}
```

The negative BMA holding comes from the supplied seed, not from counting an open order as filled; see [Assumptions and seed data](#assumptions-and-seed-data).

Database notes:

- `database.sql` already creates the original tables. `db:baseline` marks the matching first migration as applied; run it before `db:migrate` on a newly created database. Repeating it on an already baselined database returns `P3008` without changing data.
- `npm run db:down` stops Postgres. `npm run db:reset` also deletes the data volume. Compose fixes the project name, so checkouts on the same machine share the container and volume.
- To change the Postgres port, replace `5434` in `127.0.0.1:5434:5432` in `docker-compose.yml` and update `DATABASE_URL` in `.env`. Set `PORT` to change the API port.
- Prisma configuration and the app load `.env`. Use a local database for this setup; an exported `DATABASE_URL` can override it.

## API

Every route requires `X-User-Id`; the seed contains users 1–4. Authentication is excluded by the challenge. This header only declares an identity: clients can impersonate another user, so it is not a security boundary. Missing, malformed or unknown users return `400`. Header IDs and cancel-path IDs must have no leading zeros (`0001` returns `400`).

| Endpoint | Behavior |
|----------|----------|
| `GET /portfolio` | Total value, available cash, and positions with quantity, market value, average price and total return. |
| `GET /instruments?query=pam` | Case-insensitive ticker/name search, excluding currencies. Missing `query` is `400`; empty text returns an empty list. Input is limited to 100 characters before trimming, with no NUL character. |
| `POST /orders` | Submit a BUY/SELL, MARKET/LIMIT order by shares or ARS amount. |
| `POST /orders/:id/cancel` | Cancel a `NEW` order. Repeating a successful cancel returns `200` unchanged; other final states return `409`. Missing or another user's order returns `404`. |

Import the [Postman collection](cocos-api.postman_collection.json) and run its requests in order. The LIMIT request saves its order ID for cancellation. Equivalent curl examples:

```bash
H='X-User-Id: 1'
B=http://localhost:3000

curl -s "$B/instruments?query=pam" -H "$H"

# MARKET by shares: 201 with FILLED on the fresh seed.
curl -s -i -X POST "$B/orders" -H "$H" -H 'Content-Type: application/json' \
  -d '{"instrumentId":47,"side":"BUY","type":"MARKET","size":2}'

# LIMIT with an optional retry key: run twice to see Idempotent-Replayed: true.
curl -s -i -X POST "$B/orders" -H "$H" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1c0d9e-2b7a-4c1e-9a53-0d6a1f2b8c41' \
  -d '{"instrumentId":47,"side":"BUY","type":"LIMIT","size":1,"price":"1.00"}'

# Replace <id> with the LIMIT order ID returned above.
curl -s -i -X POST "$B/orders/<id>/cancel" -H "$H"
```

### Order contract

- Nonempty `POST /orders` bodies require `Content-Type: application/json`; unsupported media types return `415`. Empty bodies fail field validation with `400`.
- Ordinary unknown order fields and instrument-search parameters return `400`; framework-filtered prototype names are an exception detailed in the specification. Other routes ignore unknown query parameters.
- Send `instrumentId`, `side` (`BUY`/`SELL`), `type` (`MARKET`/`LIMIT`), and exactly one of `size` or `amount`. The instrument must exist and must not be a currency.
- `size` is an integer from 1 to 2147483647. Alternatively, `amount` is an ARS decimal string, such as `"10000.00"`; shares are floored to a whole number.
- `price` is required for LIMIT and forbidden for MARKET. `amount` and `price` accept `"0.01"` through `"99999999.99"`, with at most two decimals. A LIMIT amount below one share is `400`.
- Monetary values travel as decimal strings. Calculations use `decimal.js`; excess input decimals are rejected, not rounded. Output is rounded half up to two decimals.
- `Idempotency-Key` is an optional UUID per logical order. For the same user, key and validated body, retries return the original stored response without another order, even after cancellation. A different body with the same key returns `422 IDEMPOTENCY_KEY_CONFLICT`.

Successful MARKET orders return `201` with `FILLED`; accepted LIMIT orders return `201` with `NEW`. A valid order that cannot execute is also saved and returns `201`, with `REJECTED` and a reason. Reasons are `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `AMOUNT_BELOW_ONE_SHARE` (MARKET) or `NO_MARKET_PRICE`.

For example, selling 100 shares of instrument 47 on the fresh seed is rejected because user 1 owns 40. Request body: `{"instrumentId":47,"side":"SELL","type":"MARKET","size":100}`. Response `201` (ID and timestamp are illustrative):

```json
{
  "id": 12,
  "userId": 1,
  "instrumentId": 47,
  "side": "SELL",
  "type": "MARKET",
  "size": 100,
  "price": "925.85",
  "status": "REJECTED",
  "rejectionReason": "INSUFFICIENT_SHARES",
  "datetime": "2026-11-03T10:25:33.110Z",
  "cancelledAt": null
}
```

Field-validation failures return `400` without storing an order. A request that waits more than 2 seconds for the per-user lock returns `503 LEDGER_BUSY`, and one that runs out of waiting time for a database connection returns `503 SERVICE_BUSY`. Both carry `Retry-After: 1`; nothing was saved, and a retry (with the same `Idempotency-Key`, if you sent one) creates the order once. The error filter logs a `503` as a warning. Errors share `{ statusCode, code, message, requestId }`; the request ID is also returned in `X-Request-Id`. Global body parsing can return `400`, `413` or `415` before identity validation; the specification explains parser/media-type precedence. Request logs redact Authorization, Cookie and Set-Cookie headers; responses have no X-Powered-By header. For example, `POST /orders/99999/cancel` on the fresh seed returns `404` (request ID is illustrative):

```json
{
  "statusCode": 404,
  "code": "ORDER_NOT_FOUND",
  "message": "Order 99999 does not exist",
  "requestId": "e662cc4e-ff1e-4200-99b6-643df5e1b2ba"
}
```

## Tests

| Command | What it checks |
|---------|----------------|
| `npm test` | Unit tests; no database or Docker. |
| `npm run test:e2e` | HTTP and integration tests against a throwaway Postgres managed by Testcontainers. Requires Docker; does not touch the Compose database. |
| `npx vitest run --config vitest.config.e2e.mts test/orders.e2e-spec.ts` | Focused functional tests for order submission. Requires Docker. |
| `npm run lint`, `npm run typecheck`, `npm run build` | Lint, types and compilation. CI also runs both test suites. |

## Architecture

Modules (`orders`, `portfolio`, `instruments`) separate application use cases, domain rules and infrastructure adapters. Use cases depend on ports; Prisma implements persistence. Hexagonal architecture adds structure compared with controllers and direct queries, but keeps the money rules independent of NestJS and the database.

The pure domain pieces are `SummarizeLedgerService` (cash, reservations, holdings and moving average), `Order` (placement and cancellation rules), and `BuildPortfolioService` (valuation and return). Their unit tests need no database. Instrument search stays thin, without a domain entity.

Order submission and cancellation use a transaction with a per-user advisory lock before reading the ledger. This serializes balance-changing operations for that user. The wait is bounded: `lock_timeout` is 2 seconds (set with `set_config(..., true)`, so it ends with the transaction). The order and any idempotent response are saved atomically.

## Assumptions and seed data

- **Valuation:** MARKET uses the latest `close`. Total return is measured against the moving average purchase price, not the previous close; daily return is not returned.
- **Reservations:** a `NEW` LIMIT reserves cash (BUY) or shares (SELL) until cancelled. Reserved cash still belongs in `totalValue`. There is no market simulator, so open LIMIT orders do not fill or expire automatically.
- **Missing quote:** a held instrument without market data has `marketValue` and `totalReturnPercentage` set to `null`. It contributes nothing to `totalValue`, so that total excludes unpriced positions rather than valuing them at zero.
- **Negative BMA holding:** the supplied seed has a FILLED BUY of 20 and SELL of 30 for user 1, instrument 31: `quantity: -10`. Its NEW BUY of 60 is only a reservation, not owned shares. The API preserves the inherited negative position and market value, with average price and return `null`. New SELL orders exceeding available shares are rejected; short selling is not supported.

## Known limitations

- Each ledger read replays the user's FILLED and NEW orders, so cost grows with account history. Search has no pagination.
- Portfolio cash and reservations come from one orders query; quotes are read separately. There is no atomic snapshot across ledger and prices.
- Heavy same-user concurrency queues behind the advisory lock while holding database connections. All waits are set in the code: pool of 10 connections, 2 seconds for a connection (`connectionTimeoutMillis` and Prisma `maxWait`), 2 seconds for the per-user lock, 5 seconds per transaction. Measured by hand on one machine, with 20,000 orders for one user (about 145 ms per order); the load script is not in the repo, so treat the numbers as indicative:
  - A burst of 150 parallel orders from that user: before, 42 `201` and 108 `500`, in 7.0 s; now, 34 `201` and 116 `503`, in 5.9 s. A second user's `GET /portfolio` during the burst: before, `200` after 5.6 s; now, `503` after 2.2 s. Other users fail sooner instead of waiting; they are not served better.
  - The user's lock held for 9 seconds, 15 orders from that user: before, 15 `500`, and a second user's `GET /portfolio` got `500` after 5.0 s; now, 11 `LEDGER_BUSY` and 4 `SERVICE_BUSY`, and the second user got `200` after 1.1 s.
  - There is no per-user cap on concurrent requests, so a burst from one user still fills the pool. A lock held outside the API (for example by a migration) on a later statement of a request still gives `500`: only the per-user lock is mapped to `LEDGER_BUSY`.
  - No production throughput guarantee is claimed.
- There is no order-retrieval or order-history endpoint.

## Further documentation

See the [design specification](docs/SPEC.md) for the API contract and design decisions, and [AI usage](AI_USAGE.md) for how I approached the challenge and worked with AI.
