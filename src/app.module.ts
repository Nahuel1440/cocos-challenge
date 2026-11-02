import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { OrdersModule } from '@/orders/orders.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from '@/shared/infrastructure/transactions/transactions.module';

const env = process.env.NODE_ENV;

@Module({
  imports: [
    PrismaModule,
    TransactionsModule,
    OrdersModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: env === 'test' ? 'silent' : 'info',
        transport:
          env === 'production' || env === 'test'
            ? undefined
            : { target: 'pino-pretty' },
      },
    }),
  ],
})
export class AppModule {}
