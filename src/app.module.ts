import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { OrdersModule } from '@/orders/orders.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from '@/shared/infrastructure/transactions/transactions.module';
import { HttpExceptionFilter } from '@/shared/infrastructure/http/http-exception.filter';

const env = process.env.NODE_ENV;

@Module({
  imports: [
    PrismaModule,
    TransactionsModule,
    OrdersModule,
    LoggerModule.forRoot({
      pinoHttp: {
        // D-40: our own id per request; an incoming X-Request-Id is ignored.
        genReqId: (_req, res) => {
          const id = randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        level: env === 'test' ? 'silent' : 'info',
        transport:
          env === 'production' || env === 'test'
            ? undefined
            : { target: 'pino-pretty' },
      },
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
