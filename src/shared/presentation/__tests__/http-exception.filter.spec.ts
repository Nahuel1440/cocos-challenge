import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainException } from '@/shared/domain/domain.exception';
import { HttpExceptionFilter } from '@/shared/presentation/http-exception.filter';

const render = (error: unknown) => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(error, host);

  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
};

describe('HttpExceptionFilter', () => {
  it('should render a DomainException as { statusCode, code, message }', () => {
    const { status, body } = render(
      new DomainException('UNKNOWN_USER', 'User 999 does not exist'),
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      code: 'UNKNOWN_USER',
      message: 'User 999 does not exist',
    });
  });

  it('should render a body validation error with code VALIDATION_ERROR', () => {
    const { status, body } = render(
      new BadRequestException(['size must be a positive integer']),
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'size must be a positive integer',
    });
  });

  it('should render an unexpected error as a 500 INTERNAL_ERROR with a generic message and no stack trace', () => {
    const { status, body } = render(new Error('connection refused at db:5432'));

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
