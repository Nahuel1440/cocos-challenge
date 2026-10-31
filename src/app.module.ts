import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

const env = process.env.NODE_ENV;

@Module({
  imports: [
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
