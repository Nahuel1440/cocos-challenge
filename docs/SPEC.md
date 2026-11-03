# SPEC: Portfolio, search and orders API

This specification describes the delivered API and its design rationale. Superseded decisions point to their replacement. See the [README](../README.md) to run and exercise the API, and the [task record](tasks/TASKS.md) for implementation and verification evidence.

## Problem and delivery scope

A broker user needs to value an account, find instruments, and submit buy/sell orders without spending the same cash or shares twice. Orders are the ledger: cash and holdings are derived from the relevant rows in `orders`, not separate balance tables.

The brief requires portfolio, instrument search, MARKET/LIMIT orders by quantity or ARS amount, a functional order-submission test, and documented assumptions. Cancellation is included in the selected delivery scope. Idempotency is also mandatory for this delivery, while the client header that activates it remains optional. Authentication and market simulation are explicitly unnecessary in the brief.

### Functional requirements

| ID | Delivered capability |
|----|----------------------|
| FR-1 | Portfolio: total account value, available ARS cash and each nonzero holding's quantity, market value, moving average purchase price and total return percentage. |
| FR-2 | Search instruments by ticker or name. |
| FR-3 | Submit BUY/SELL, MARKET/LIMIT orders by exact shares or ARS amount, flooring to whole shares. |
| FR-4 | Cancel an owned NEW order, releasing its reservation; repeating cancellation is safe. |

### Non-functional requirements

These are the implementation's explicit design commitments, not additional requirements attributed to the brief.

| ID | Commitment and boundary |
|----|-------------------------|
| NFR-1 | New orders must not spend more available cash or shares than the ledger permits, including concurrent requests for the same user. Orders that do not fit are persisted as REJECTED. Existing seed anomalies are reported, not repaired by this rule. |
| NFR-2 | Money uses decimal arithmetic; share quantities use integers. Intermediates are not quantized to two currency decimals. |
| NFR-3 | Requests carrying the same user's Idempotency-Key and matching validated input replay the original response without a second order. The feature is mandatory; the header is optional. |
| NFR-4 | Submission facts are not revised through the API. The only lifecycle mutation is NEW to CANCELLED, with cancelledAt recorded; no update/delete endpoint exists. This is an application rule, not a database prohibition against external updates. |
| NFR-5 | Portfolio cash and reservations come from one orders query and therefore one statement snapshot. Quotes are a separate read; there is no atomic snapshot across all portfolio data. |
| NFR-6 | Validate at the HTTP boundary, parameterize queries, and return no stack traces to clients. |
| NFR-7 | Generate a server request ID, correlate errors, and log committed order outcomes without balances. This observability is a design choice. |

## Glossary and calculations

| Term | Meaning here |
|------|--------------|
| Instrument | An asset or a currency. The seed uses ACCIONES and MONEDA; ARS is instrument 66. |
| Order | A persisted submission or seeded cash movement. Business rejections are stored; invalid requests are not. |
| size | Shares in BUY/SELL; whole pesos in seeded CASH_IN/CASH_OUT, whose price is 1. |
| Holding | Sum of FILLED BUY sizes minus FILLED SELL sizes, per instrument. NEW orders do not add owned shares. |
| Total cash | FILLED CASH_IN minus CASH_OUT minus BUY size times price plus SELL size times price. |
| Reservation | A NEW LIMIT BUY reserves size times price in ARS; a NEW SELL reserves size shares. |
| Available cash / shares | Total cash minus BUY reservations; holding minus SELL reservations. |
| Current price | close from the latest marketdata.date for an instrument. |
| Average price | Moving purchase cost: recomputed on a buy, retained on a sale while quantity stays positive, cleared at zero or below. A later buy crossing to positive starts at that buy's price. |
| Market value | Holding times current price; null without a quote. Negative inherited holdings have negative value. |
| Total value | Total cash, including reserved cash, plus market values of priced positions. Unpriced positions are excluded, so the result is partial when quotes are missing. |
| Total return percentage | (current price minus average price) divided by average price, times 100. Average 100 and price 110 gives "10.00", not "0.10". Null without a quote or purchase-cost basis. |
| Daily return | (close minus previousclose) divided by previousclose, times 100. Not returned by this API. |

## HTTP contract

### Identity and errors

All routes use the declared `X-User-Id` identity. Missing, malformed or unknown users return `400` with `MISSING_USER_ID`, `INVALID_USER_ID` or `UNKNOWN_USER`. This is not authentication: a client can impersonate another user. Ownership checks only apply to the declared identity.

Errors use `{ statusCode, code, message, requestId }`. A request ID is also returned in `X-Request-Id`. Invalid order fields use `400 VALIDATION_ERROR`; unexpected errors use `500 INTERNAL_ERROR` with a generic message, with details logged server-side. Body parsing happens before the guard: malformed JSON is `400 VALIDATION_ERROR`, and an oversized body is `413 PAYLOAD_TOO_LARGE`, even without the identity header.

### GET /portfolio

Returns `200` with `totalValue`, `availableCash` and `positions`. Each position contains `instrumentId`, `ticker`, `name`, `quantity`, `marketValue`, `averagePrice` and `totalReturnPercentage`. Money and percentage fields are decimal strings; unknown values are null. Zero holdings are omitted. See D-26, D-34 and D-35 for missing quotes, inherited negative positions and the read boundary.

### GET /instruments?query=

Trimmed, case-insensitive ticker/name search using escaped ILIKE patterns, excluding MONEDA. Missing query returns `400 VALIDATION_ERROR`; empty or whitespace-only input returns `200` with `{ "instruments": [] }` without a database call. Results rank exact ticker, ticker prefix, name prefix, then substring; ties sort by ticker and id. There is no pagination.

### POST /orders

Body: `instrumentId`, `side` (BUY/SELL), `type` (MARKET/LIMIT), exactly one of `size` or `amount`, and `price` for LIMIT only. Idempotency-Key is an optional UUID header.

- instrumentId and size must be integers in 1..2147483647; the instrument must exist and not be MONEDA.
- amount and price are decimal strings in 0.01..99999999.99 with at most two decimals. MARKET must omit price; LIMIT must include it.
- By amount, size is floored using the MARKET close or the client's LIMIT price. A derived size above the INT maximum returns `400 VALIDATION_ERROR` without persistence.
- A LIMIT amount that buys no share is invalid (`400`). For MARKET, the corresponding result is a persisted `REJECTED AMOUNT_BELOW_ONE_SHARE`, since the market price is not part of the client's request.

| Result | HTTP / body | Persistence |
|--------|-------------|-------------|
| Accepted MARKET | 201, FILLED | One order at the latest close |
| Accepted LIMIT | 201, NEW | One order, with cash or shares reserved |
| Insufficient cash or shares | 201, REJECTED with INSUFFICIENT_FUNDS or INSUFFICIENT_SHARES | One rejected order |
| No usable MARKET price | 201, REJECTED with NO_MARKET_PRICE | price is null; size is requested size, or null for an amount request |
| MARKET amount buys zero shares | 201, REJECTED with AMOUNT_BELOW_ONE_SHARE | size is 0 |
| Same user's key and matching input | Original response, Idempotent-Replayed: true | No additional order |
| Same key, different validated input | 422 IDEMPOTENCY_KEY_CONFLICT | No additional order |
| Invalid request | 400 VALIDATION_ERROR | No order or consumed key |

Creation responses include `Location: /orders/:id`, although no GET route exists there. This is a documented API limitation, not a usable retrieval link.

### POST /orders/:id/cancel

| Current state / ownership | Result |
|---------------------------|--------|
| Owned NEW | 200 with CANCELLED and cancelledAt |
| Owned CANCELLED | 200 with the order unchanged, including its original cancellation time |
| Owned FILLED or REJECTED | 409 ORDER_NOT_CANCELLABLE |
| Missing or another user's order | 404 ORDER_NOT_FOUND |

Cancellation releases a reservation through the derived ledger; it does not update a separate balance. Open LIMIT orders never fill or expire automatically because no market simulator or expiry worker is implemented.

## Submission and transaction flow

1. The HTTP boundary validates identity, fields and optional key; the use case verifies the instrument is tradable.
2. `UnitOfWork.run(work)` starts a READ COMMITTED transaction. The callback explicitly calls `orders.lockLedger(userId)` before reading the ledger or idempotency record: `pg_advisory_xact_lock(1, userId)`.
3. For an existing key, compare the hash of the validated input and replay the saved response, or raise the 422 conflict. This happens before recomputing balance or price.
4. Otherwise read FILLED and NEW entries, obtain the price, replay the ledger chronologically, derive size, and apply order rules. Missing price takes precedence over size/funds checks; size 0 on MARKET precedes insufficient-funds checks.
5. The app takes datetime after the lock and constructs a FILLED, NEW or REJECTED order. Save it and, if keyed, the request hash, order ID and response in the same transaction. Failure rolls both back.
6. After successful commit, log the new outcome. A replay does not log a second placement.

Cancellation uses the same UoW callback and lock before loading the owned order. `UnitOfWork` supplies transaction context; it does not acquire ledger locks automatically. Advisory locks protect cooperating write paths only, not arbitrary external database writes.

## Decisions

| ID | Decision | Rationale | Alternative / tradeoff |
|----|----------|-----------|------------------------|
| D-1 | Decimal arithmetic for money, integer shares. | Preserve the decimal values already represented by NUMERIC without binary-float conversion. | Integer cents would need boundary conversions and still a division/rounding policy. Decimal arithmetic has finite precision, not infinite exactness. |
| D-2 | Explicit integrity, validation, consistency and correlation commitments NFR-1 through NFR-7. | These address concurrent spending, monetary representation and diagnosability in this implementation. | Rate limiting, metrics and distributed tracing are not implemented in this scope. |
| D-3 | Idempotency proposal, superseded by D-27. | The final feature is required with an optional header. | D-27 defines the current request-replay contract. |
| D-4 | Total return against the current holding's moving average purchase cost. | Measures the current quoted price relative to acquisition cost; the brief's previousclose describes a different, daily measure. | This is an interpretation, not a realized P&L calculation or daily return. |
| D-5 | Moving average on buys; retain on sells while quantity is positive; reset at zero or below. | BUY 10 at 100, SELL 10, BUY 10 at 200 must leave average 200, not an average of unrelated closed holdings. | Averaging all historical buys fails this sell-out/rebuy case. |
| D-6 | NEW LIMIT orders reserve cash or shares; cancellation releases them. | Prevent two open orders from committing the same available resources. | No reservations would allow overcommitment even before any execution. |
| D-7 | Total value uses total cash, not available cash. | Reserved cash remains part of the account; subtracting it would undervalue the account. | Available cash is a separate spendability measure. |
| D-8 | Invalid request: 400 without an order; admissible submission rejected by account/market conditions: stored REJECTED. | Separate request-domain errors from order outcomes the user can inspect in the response. | Malformed requests are not order resources and do not enter the ledger. |
| D-9 | READ COMMITTED plus per-user two-integer advisory lock in send and cancel. | There is no stored balance row. Locking only existing orders misses future inserts. A waiting writer must read balances committed before it acquires the lock. | Locking the user row or SERIALIZABLE with retries are possible alternatives. The chosen lock requires every cooperating writer to use it; it also creates a same-user queue. |
| D-10 | NestJS, Prisma with adapter-pg, transactional context, decimal.js, class-validator, Vitest and Pino; domain/application/infrastructure separation. | Keep monetary rules independently testable and adapters explicit; ambient transaction context avoids passing Prisma clients through domain ports. | Additional abstraction and ambient transaction-context overhead compared with direct controllers and queries. |
| D-11 | ENUMs for order side/status/type, instrument type and rejection reasons. | Invalid state spellings fail at persistence, and Prisma generates corresponding types. | CHECK lists can enforce the database domain but do not provide the same generated enum model. |
| D-12 | NOT NULL for required identity, order and quote fields, retaining deliberate unknowns. | An order without an owner or timestamp cannot support the ledger calculation. | Rejected price/size and historical cancelledAt retain explicit nullable exceptions; unused marketdata high/low/open also remain nullable. |
| D-13 | Index orders(userid); unique marketdata(instrumentid, date). | Match user-ledger filtering and enforce one daily bar, so latest-date lookup is unambiguous. | No status-first or chronological composite index without a demonstrated access benefit; wildcard search remains unindexed at seed scale. |
| D-14 | A historical synthetic-data experiment used EXPLAIN ANALYZE and request timing. | Seed-only planning does not characterize long account histories; the recorded experiment identified history-dependent application cost. | It is exploratory evidence, not a checked-in reproducible benchmark or a production capacity claim; see Measurement boundary. |
| D-15 | Local development/test database and versioned migrations. | Local data is resettable; no remote migration or ownership permission is presumed. | A different database requires explicit authorization and data-compatibility checks; no automatic deployment step. |
| D-16 | Key/hash columns on orders, superseded by D-27. | Request replay and mutable order lifecycle state have different responsibilities. | A separate request table stores the original response. |
| D-17 | 201 for persisted FILLED, NEW and REJECTED submissions. | In all three cases an order resource was created. Status and rejectionReason describe the business result. | 200 or error statuses were considered; the choice does not make rejected submissions successful trades. |
| D-18 | Already CANCELLED returns 200 unchanged; FILLED/REJECTED cancellation returns 409. | A timed-out cancellation can be retried to reach the already-achieved target state. | Returning 409 for an already cancelled order makes an effective retry look like an unsuccessful cancellation. |
| D-19 | Functional HTTP tests against Testcontainers Postgres, with seeded reset between cases. | Exercise validation, adapters, SQL and transaction behavior together on isolated data. | Pure mocks cannot prove these boundaries. Container setup adds Docker and runtime cost. |
| D-20 | Persist and return one of four named rejection reasons. | Distinguish insufficient funds, insufficient shares, missing price and a MARKET amount below a share. | Status alone cannot explain the business result. |
| D-21 | Rejected price may be null; rejected size may be 0 or null when an amount cannot be converted without price. | Preserve unknown facts rather than inventing zero. Separate IS NOT NULL checks prevent SQL's nullable CHECK evaluation from admitting null sizes for ledger rows. | Rejected rows do not enter ledger calculations. These checks do not by themselves enforce every application input invariant. |
| D-22 | Central guard resolves X-User-Id and checks user existence, with stable 400 codes. | Consistent challenge-only identity across endpoints; avoids a foreign-key failure or an empty portfolio for a nonexistent declared user. | This is a chosen input contract, not authentication or impersonation protection. A real auth contract must be designed separately. |
| D-23 | Decimal strings for monetary JSON fields and displayed return percentages. | JSON numeric parsing must not introduce binary-float conversion before validation/calculation. | Share counts and identifiers remain integers, not strings for visual consistency. |
| D-24 | Search returns an instruments wrapper, with no pagination. | A small supplied universe does not require a cursor in this delivery; the wrapper leaves room for additive metadata. | Large result sets still need a pagination policy; one is not implemented or promised. |
| D-25 | Return total return percentage, not daily return. | Keep the portfolio's purchase-cost comparison distinct from close versus previousclose. | previousclose remains supplied data but does not enter this calculation. |
| D-26 | Missing quote yields null market value/return and excludes that position from totalValue. | Unknown is not zero; other known values remain available, while the aggregate is partial. | External data changes can create missing quotes even if API-created MARKET holdings originally had prices. No completeness flag is implemented. |
| D-27 | Required idempotency feature with optional UUID header; separate idempotency_requests table and migration in T12. | Save the validated-input hash and original response atomically with the order; replay survives later cancellation. Scope is user, operation and key; changed input returns 422. | Storing only the current order cannot replay the initial response. Keys are optional; requests without them are not deduplicated. |
| D-28 | rejection_reason exists if and only if status is REJECTED. | A database CHECK rejects both rejection-without-reason and reason-on-an-accepted-order. | Application validation alone would leave externally written rows unconstrained. |
| D-29 | One statusCode/code/message/requestId error shape, generic unexpected 500s. | Clients get stable machine codes and a support correlation value without internal stack disclosure. | A standard problem-details representation was considered; this API uses a smaller local contract. |
| D-30 | Reject input beyond two decimals; preserve decimal intermediates; round output half up to two decimals. | Rounding input can make the checked cost disagree with the stored reservation. Averages and return are not first rounded to currency scale. | Division still uses decimal.js finite precision. Output is display-oriented and is not a full-precision financial data feed. |
| D-31 | Bound amount/price to NUMERIC(10,2) and share counts to INT; reject a zero-share LIMIT amount with 400. | Reject unrepresentable client input before storage; with a client-specified LIMIT price, changing market state cannot make that amount buy a share. | A MARKET amount uses a price outside the request, so a below-share result is stored REJECTED. |
| D-32 | One pure SummarizeLedgerService.run(entries) computes the ledger for send-order and portfolio. | Reuse cash, reservations and moving-average rules so displayed spendability and order checks do not drift. The service knows no current quote. | SQL replay or another module would add a different testing/ownership boundary; the existing orders domain owns this calculation. |
| D-33 | Replay by datetime ASC, id ASC; take new datetime from the app after acquiring the user lock. | Moving averages depend on chronology. App time after waiting avoids using the transaction's earlier start time as submission time. | id breaks equal-time ties under ordinary sequence allocation; imported data, clock changes or changed sequence settings can violate broader chronological assumptions. |
| D-34 | Preserve the seed's negative BMA holding; average and return are null. | FILLED BUY 20 minus SELL 30 equals -10. A NEW BUY of 60 is not ownership. The recorded sale added cash, so ignoring the negative position distorts valuation. | Preserving the existing data avoids silently changing reported history. New orders reject sales above available shares; short selling is not implemented. |
| D-35 | One FILLED/NEW orders query for portfolio, then a separate quote read; no transaction or lock. | Cash and reservations share a statement snapshot without blocking writers for a view. | This does not guarantee quotes and orders represent one instant. A repeatable-read transaction could provide a stronger cross-read boundary, but is not implemented. |
| D-36 | query parameter: missing is 400, empty/whitespace is 200 with an empty list and no query. | Detect misspelled/missing parameters without treating a cleared search box as a database request. | Returning every instrument on an empty search or treating missing and empty alike would be different API choices. |
| D-37 | Exclude MONEDA in search and reject it in order submission. | Cash is modeled as an instrument for ledger transfers, not as an asset to buy with itself here. | The predicate is an exclusion, not a guarantee that any future instrument type is supported by order rules. |
| D-38 | Rank exact ticker, ticker prefix, name prefix, then substring; stable ticker/id ties. | Prefer identifier matches while still supporting name lookup, using simple SQL rather than an extension. | This is a deterministic relevance policy, not a claim about every broker's search behavior. Fuzzy similarity is excluded. |
| D-39 | Nullable cancelled_at set by the app after the lock; historical cancelled rows retain unknown time. | Preserve the actual cancellation time for newly cancelled orders without fabricating seed history. CHECK allows a timestamp only on CANCELLED rows. | This improves investigation but cannot reconstruct all historical reservations where timestamps or external history are missing; it is not a complete audit/event log. |
| D-40 | Server UUID per request; X-Request-Id and error-body requestId; server-side error stacks and one committed outcome log per new placement/cancel, without balances. | A rejection is 201, so an outcome log explains it; a request ID distinguishes requests even when identity validation fails. Client IDs are not reused. | Chosen observability, not an extra brief requirement. Parser failures get a fallback ID/log path; replay does not create another placement log. |

## Database changes and boundaries

The baseline migration matches the original tables. `20261101000000_cocos_schema` adds integrity changes; `20261102000000_idempotency_requests` adds request replay storage.

| Change | Purpose / boundary |
|--------|--------------------|
| ENUMs and required fields | Required user/instrument/order fields and quote identity/date/close/previousclose cannot be null. marketdata high/low/open remain nullable. |
| Nullable order price and size | Required for every non-REJECTED row, with positive size for those rows. Rejected unknowns follow D-21. There is no database CHECK requiring a positive price. |
| rejection_reason CHECK | Exactly REJECTED rows carry a reason. Seed order 6 is backfilled to INSUFFICIENT_SHARES from its attempted sale of 100 when the holding was 40. |
| cancelled_at CHECK | A non-null timestamp implies CANCELLED; the converse is deliberately not required for historical seed rows. |
| orders(userid) index | Supports reading the relevant history for one user. |
| Unique marketdata(instrumentid, date) | Enforces one daily bar; the supplied date has no intraday time. |
| idempotency_requests | Stores user/operation/key, SHA-256 request hash, order ID, response status and JSON body; unique user/operation/key, with user/order foreign keys. |

The constraints reject particular malformed rows, not every possible overspend or lifecycle change. Cross-order resource checks remain application logic under the cooperating per-user lock. No trigger enforces immutability or prevents every out-of-band write.

## Seed assumptions

- CASH_IN/CASH_OUT use integer size with price 1, so seeded transfers are whole pesos; no transfer endpoint is implemented.
- Instruments 3, 10 and 66 have no marketdata in the supplied seed. Missing-quote handling remains necessary for external/imported or subsequently changed data.
- User 1's instrument 31 has the inherited negative holding described in D-34; it is not silently corrected or interpreted as a short-selling feature.
- Lowercase SQL columns use Prisma mappings. The brief names marketdata.datetime, but the actual DDL supplies marketdata.date DATE, which is used for latest-price selection.

## Measurement boundary and known limitations

A recorded development-session experiment used synthetic histories, EXPLAIN ANALYZE with/without the user index, request timings, and a CPU profile. It indicated that mapping and decimal replay cost grows with per-user history. The initial generated status mix was incorrect and marketdata was empty; a later profile corrected the status mix. The scripts and raw outputs are not checked into this delivery, and the experiment was not reproduced during this documentation reconciliation. It is exploratory evidence, not a reproducible capacity benchmark. POST throughput, same-user contention and production load were not established by it.

- Ledger replay cost grows with history; no balance snapshot or cache is implemented.
- Portfolio quotes and ledger lack a global snapshot; displayed averages/returns are rounded outputs, not full-precision inputs for another calculation.
- Writers waiting for the same user lock retain database connections. Heavy contention may exhaust pool/transaction waits and return a generic 500; no untested default timeout or throughput is promised here.
- Shutdown hooks do not fully drain in-flight HTTP work before database disconnect.
- Location from order creation has no GET route; order history and search pagination are absent.

## Out of scope and delivery cuts

| ID | Excluded capability | Reason / distinction |
|----|---------------------|----------------------|
| O-1 | Authentication | Explicitly unnecessary in the brief; declared X-User-Id is not production security. |
| O-2 | Market simulation, automatic LIMIT fills and expiry | No market simulation required; open orders reserve until cancellation. |
| O-3 | Partial fills | Only all-or-nothing fills are modeled. |
| O-4 | Fees and taxes | No fee model is supplied; none is invented. |
| O-5 | Settlement delay and market hours | MARKET fills immediately in this exercise. |
| O-6 | Other currencies | The brief requires ARS prices. |
| O-7 | Realized P&L and FIFO lots | Outside the selected total-return view. |
| O-8 | Transfer endpoints | CASH_IN/CASH_OUT are supplied ledger movements, not API operations. |
| O-9 | Fuzzy search | Substring/prefix ranking covers this delivery; no similarity extension or threshold is claimed. |
| O-10 | Rate limiting, metrics and distributed tracing | Useful for availability and production diagnosis, but outside this delivery scope. |

Idempotency and cancellation are delivered, not active cuts. The optional request collection is supplied as Postman rather than a REST Client file. Cursor pagination is not built. Measurement has the exploratory boundary above; it must not be described as either never attempted or production-proven.
