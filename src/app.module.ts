import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';

const env = process.env.NODE_ENV;

@Module({
  imports: [
    PrismaModule,
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
