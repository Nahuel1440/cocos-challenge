import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import {
  DomainException,
  ErrorCategory,
  UnknownUserException,
} from '@/shared/domain';
import { HttpExceptionFilter } from '@/shared/infrastructure/http/http-exception.filter';

class StubException extends DomainException {
  public readonly code = 'STUB';

  constructor(public readonly category: ErrorCategory) {
    super('stub message');
  }
}

const render = (error: unknown) => {
  const log = { error: vi.fn(), warn: vi.fn() };
  const setHeader = vi.fn();
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ id: 'req-1', log }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(error, host);

  return {
    status: status.mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0],
    log,
    setHeader,
  };
};

describe('HttpExceptionFilter', () => {
  it.each([
    [ErrorCategory.InvalidArgument, 400],
    [ErrorCategory.NotFound, 404],
    [ErrorCategory.Conflict, 409],
    [ErrorCategory.Unprocessable, 422],
  ])(
    'should map each ErrorCategory to its HTTP status (%s -> %i)',
    (category, expected) => {
      const { status, body } = render(new StubException(category));

      expect(status).toBe(expected);
      expect(body).toEqual({
        statusCode: expected,
        code: 'STUB',
        message: 'stub message',
        requestId: 'req-1',
      });
    },
  );

  it('should render a DomainException as { statusCode, code, message }', () => {
    const { status, body } = render(new UnknownUserException('999'));

    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      code: 'UNKNOWN_USER',
      message: 'User 999 does not exist',
      requestId: 'req-1',
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
      requestId: 'req-1',
    });
  });

  it('should render an unexpected error as a 500 INTERNAL_ERROR with a generic message and no stack trace', () => {
    const { status, body } = render(new Error('connection refused at db:5432'));

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
  });

  it('should render an HttpException with its own status and the error body', () => {
    const { status, body } = render(new NotFoundException('Cannot GET /nope'));

    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /nope',
      requestId: 'req-1',
    });
  });

  it('should log the error with its stack and hide it from the response when an unexpected error occurs', () => {
    const error = new Error('connection refused at db:5432');

    const { body, log } = render(error);

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      expect.any(String),
    );
    expect(JSON.stringify(body)).not.toContain(error.stack);
  });

  it('should render a plain error with a 4xx status as a 500 and log its stack', () => {
    const error = Object.assign(new Error('relation "users" does not exist'), {
      status: 404,
      statusCode: 404,
    });

    const { status, body, log } = render(error);

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      expect.any(String),
    );
  });

  it('should render a 5xx HttpException as a generic 500 and log its stack', () => {
    const error = new InternalServerErrorException('db down at db:5432');

    const { status, body, log } = render(error);

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      expect.any(String),
    );
  });

  it('should answer 503 with Retry-After when the exception is a DomainException of category Unavailable', () => {
    const { status, body, setHeader } = render(
      new StubException(ErrorCategory.Unavailable),
    );

    expect(status).toBe(503);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(body).toEqual({
      statusCode: 503,
      code: 'STUB',
      message: 'stub message',
      requestId: 'req-1',
    });
  });

  it('should answer 503 SERVICE_BUSY when the error is a Prisma P2028', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Transaction API error: Unable to start a transaction in the given time.',
      { code: 'P2028', clientVersion: 'test' },
    );

    const { status, body, setHeader, log } = render(error);

    expect(status).toBe(503);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(body).toEqual({
      statusCode: 503,
      code: 'SERVICE_BUSY',
      message: 'The service is busy. Retry shortly',
      requestId: 'req-1',
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('should answer 503 SERVICE_BUSY when the pg pool times out connecting', () => {
    const error = new Error('timeout exceeded when trying to connect');

    const { status, body, setHeader } = render(error);

    expect(status).toBe(503);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(body.code).toBe('SERVICE_BUSY');
  });
});
