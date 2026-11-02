import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

interface HeaderRequest {
  headers: Record<string, string | undefined>;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<HeaderRequest>().headers[
      'idempotency-key'
    ],
);
