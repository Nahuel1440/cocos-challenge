# Cocos API

## Requirements

### Functional

- Users should be able to view their portfolio, including total value, available cash, and positions with quantities, monetary values, and returns.
- Users should be able to search for similar instruments by name and/or ticker.
- Users should be able to submit orders to the market, specifying:
  - A whole number of shares or a total investment amount.
  - The side: BUY or SELL.
  - The type: MARKET or LIMIT.
- Users should be able to cancel only orders in NEW status.

### Business rules

- Instrument prices must be in ARS.
- Orders must use whole-number share quantities.
- If an investment amount is provided, the system must calculate the maximum affordable whole-number quantity of shares.
  - Assumption: if this quantity is zero, the order must be rejected and persisted with status REJECTED.
- MARKET orders are executed immediately using the latest price (close).
- If an order fails business validation, the system must reject it and persist it with status REJECTED.
  - This includes orders rejected because available cash or shares are insufficient.
- Transfers can be modeled as orders with side CASH_IN or CASH_OUT.
- Positions and available cash are calculated from orders, using the size column.
- Only FILLED orders are considered when calculating positions.

### Scope

- It is not necessary to simulate the market.

### Non-functional

- Monetary calculations must use explicitly defined precision and rounding rules.
- Concurrent order processing must preserve correct balances and holdings, preventing overspending and overselling.
- Retrying the same identified order submission must not create duplicate orders or financial effects (idempotency).
- Observability.
