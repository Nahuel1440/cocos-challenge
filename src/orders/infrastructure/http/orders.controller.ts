import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CancelOrderUseCase } from '@/orders/application/use-cases/cancel-order.use-case';
import { SendOrderUseCase } from '@/orders/application/use-cases/send-order.use-case';
import { IdempotencyKey } from '@/orders/infrastructure/http/idempotency-key.decorator';
import { IdempotencyKeyPipe } from '@/orders/infrastructure/http/idempotency-key.pipe';
import { OrderIdPipe } from '@/orders/infrastructure/http/order-id.pipe';
import { SendOrderDto } from '@/orders/infrastructure/http/send-order.dto';

interface AuthenticatedRequest {
  userId: number;
}

interface SendOrderResponse {
  setHeader(name: string, value: string): void;
}

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly sendOrder: SendOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
  ) {}

  @Post()
  public async create(
    @Body() dto: SendOrderDto,
    @Req() request: AuthenticatedRequest,
    @IdempotencyKey(IdempotencyKeyPipe) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: SendOrderResponse,
  ) {
    const result = await this.sendOrder.run({
      userId: request.userId,
      instrumentId: dto.instrumentId,
      side: dto.side,
      type: dto.type,
      size: dto.size ?? null,
      amount: dto.amount ?? null,
      price: dto.price ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });

    if (result.replayed) {
      response.setHeader('Idempotent-Replayed', 'true');
    }

    return result.body;
  }

  @Post(':id/cancel')
  @HttpCode(200)
  public async cancel(
    @Param('id', OrderIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const order = await this.cancelOrder.run({
      userId: request.userId,
      orderId: Number(id),
    });

    return order.toPrimitives();
  }
}
