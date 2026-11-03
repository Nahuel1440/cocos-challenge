import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InstrumentsModule } from '@/instruments/instruments.module';
import { OrdersModule } from '@/orders/orders.module';
import { PortfolioModule } from '@/portfolio/portfolio.module';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from '@/shared/infrastructure/transactions/transactions.module';
import { HttpExceptionFilter } from '@/shared/infrastructure/http/http-exception.filter';
import { buildPinoHttpOptions } from '@/shared/infrastructure/http/pino-http-options';
import { UserIdGuard } from '@/shared/infrastructure/http/user-id.guard';
import { UsersModule } from '@/shared/infrastructure/users/users.module';

@Module({
  imports: [
    PrismaModule,
    TransactionsModule,
    UsersModule,
    OrdersModule,
    InstrumentsModule,
    PortfolioModule,
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: buildPinoHttpOptions(process.env.NODE_ENV),
      }),
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: UserIdGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
