import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from '@/shared/infrastructure/http/configure-app';

async function bootstrap() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env: DATABASE_URL must already be in the environment
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  NestLogger.flush();
  new NestLogger('Bootstrap').error(error);
  process.exit(1);
});
