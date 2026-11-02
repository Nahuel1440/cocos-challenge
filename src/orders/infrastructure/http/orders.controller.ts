import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { SendOrderUseCase } from '@/orders/application/use-cases/send-order.use-case';
import { SendOrderDto } from '@/orders/infrastructure/http/send-order.dto';

interface AuthenticatedRequest {
  userId: number;
}

interface LocationResponse {
  setHeader(name: string, value: string): void;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly sendOrder: SendOrderUseCase) {}

  @Post()
  public async create(
    @Body() dto: SendOrderDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: LocationResponse,
  ) {
    const order = await this.sendOrder.run({
      userId: request.userId,
      instrumentId: dto.instrumentId,
      side: dto.side,
      type: dto.type,
      size: dto.size ?? null,
      amount: dto.amount ?? null,
      price: dto.price ?? null,
    });
    const primitives = order.toPrimitives();
    response.setHeader('Location', `/orders/${primitives.id}`);

    return primitives;
  }
}
