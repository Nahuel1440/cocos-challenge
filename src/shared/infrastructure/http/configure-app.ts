import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

export function configureApp(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
}
