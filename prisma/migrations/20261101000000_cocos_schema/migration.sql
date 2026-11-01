-- D-11, D-20: ENUMs. `type` needs two: orders and instruments hold different values.
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'FILLED', 'REJECTED', 'CANCELLED');
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');
CREATE TYPE "InstrumentType" AS ENUM ('ACCIONES', 'MONEDA');
CREATE TYPE "RejectionReason" AS ENUM ('INSUFFICIENT_FUNDS', 'INSUFFICIENT_SHARES', 'AMOUNT_BELOW_ONE_SHARE', 'NO_MARKET_PRICE');

-- D-11, D-12: ENUM types + NOT NULL. `price` and `size` stay nullable (D-21).
-- marketdata high/low/open stay nullable: 2 seed rows have NULL and the app reads only close/previousclose.
ALTER TABLE "instruments"
  ALTER COLUMN "ticker" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "type" TYPE "InstrumentType" USING "type"::"InstrumentType",
  ALTER COLUMN "type" SET NOT NULL;

ALTER TABLE "users"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "accountnumber" SET NOT NULL;

ALTER TABLE "marketdata"
  ALTER COLUMN "instrumentid" SET NOT NULL,
  ALTER COLUMN "close" SET NOT NULL,
  ALTER COLUMN "previousclose" SET NOT NULL,
  ALTER COLUMN "date" SET NOT NULL;

ALTER TABLE "orders"
  ALTER COLUMN "instrumentid" SET NOT NULL,
  ALTER COLUMN "userid" SET NOT NULL,
  ALTER COLUMN "datetime" SET NOT NULL,
  ALTER COLUMN "type" TYPE "OrderType" USING "type"::"OrderType",
  ALTER COLUMN "type" SET NOT NULL,
  ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide",
  ALTER COLUMN "side" SET NOT NULL,
  ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus",
  ALTER COLUMN "status" SET NOT NULL;

-- D-20, D-39: new columns. Seed CANCELLED rows keep cancelled_at NULL (cancel time unknown).
ALTER TABLE "orders"
  ADD COLUMN "rejection_reason" "RejectionReason",
  ADD COLUMN "cancelled_at" TIMESTAMP(6);

-- Seed order 6 is the only REJECTED row and has no reason (D-28 would fail on it).
-- User 1 held 40 shares of instrument 47 at 16:11 (BUY 50, order 2, minus SELL 10, order 4)
-- and the order asked to sell 100, so the reason is INSUFFICIENT_SHARES.
UPDATE "orders" SET "rejection_reason" = 'INSUFFICIENT_SHARES' WHERE "id" = 6 AND "status" = 'REJECTED';

-- D-21, D-28, D-39: CHECKs.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_price_required" CHECK ("price" IS NOT NULL OR "status" = 'REJECTED'),
  ADD CONSTRAINT "orders_size_required" CHECK ("size" IS NOT NULL OR "status" = 'REJECTED'),
  ADD CONSTRAINT "orders_size_positive" CHECK ("size" > 0 OR "status" = 'REJECTED'),
  ADD CONSTRAINT "orders_rejection_reason_iff_rejected" CHECK (("status" = 'REJECTED') = ("rejection_reason" IS NOT NULL)),
  ADD CONSTRAINT "orders_cancelled_at_only_cancelled" CHECK ("cancelled_at" IS NULL OR "status" = 'CANCELLED');

-- D-13: indexes.
CREATE INDEX "orders_userid_idx" ON "orders"("userid");
CREATE UNIQUE INDEX "marketdata_instrumentid_date_key" ON "marketdata"("instrumentid", "date");
