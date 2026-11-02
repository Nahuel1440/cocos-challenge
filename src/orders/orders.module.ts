import { Module } from '@nestjs/common';
import { ORDER_REPOSITORY } from '@/orders/domain/ports/order.repository';
import { PrismaOrderRepository } from '@/orders/infrastructure/persistence/prisma-order.repository';

@Module({
  providers: [{ provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }],
  exports: [ORDER_REPOSITORY],
})
export class OrdersModule {}
