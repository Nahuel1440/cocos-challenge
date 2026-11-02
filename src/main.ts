import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env: DATABASE_URL must already be in the environment
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  NestLogger.flush();
  new NestLogger('Bootstrap').error(error);
  process.exit(1);
});
