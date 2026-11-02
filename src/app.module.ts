import { randomUUID } from 'node:crypto';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InstrumentsModule } from '@/instruments/instruments.module';
import { OrdersModule } from '@/orders/orders.module';
import { PortfolioModule } from '@/portfolio/portfolio.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from '@/shared/infrastructure/transactions/transactions.module';
import { HttpExceptionFilter } from '@/shared/infrastructure/http/http-exception.filter';
import { UserIdGuard } from '@/shared/infrastructure/http/user-id.guard';
import { UsersModule } from '@/shared/infrastructure/users/users.module';

const env = process.env.NODE_ENV;

@Module({
  imports: [
    PrismaModule,
    TransactionsModule,
    UsersModule,
    OrdersModule,
    InstrumentsModule,
    PortfolioModule,
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
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: UserIdGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true }),
    },
  ],
})
export class AppModule {}
