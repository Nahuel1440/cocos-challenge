-- CreateTable
CREATE TABLE "idempotency_requests" (
    "id" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "order_id" INTEGER NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,

    CONSTRAINT "idempotency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_requests_userid_operation_idempotency_key_key" ON "idempotency_requests"("userid", "operation", "idempotency_key");

-- AddForeignKey
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_userid_fkey" FOREIGN KEY ("userid") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

