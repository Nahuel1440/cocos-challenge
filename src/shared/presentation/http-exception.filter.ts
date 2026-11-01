import { randomUUID } from 'node:crypto';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainException } from '@/shared/domain/domain.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const request = http.getRequest();
    // Body-parser errors fail before pino-http runs: no id and no request.log.
    const requestId: string = request.id ?? randomUUID();
    if (!request.id) response.setHeader('X-Request-Id', requestId);
    if (exception instanceof BadRequestException) {
      const { message } = exception.getResponse() as {
        message: string | string[];
      };
      response.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: [message].flat().join('; '),
        requestId,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json({
        statusCode,
        code: HttpStatus[statusCode] ?? 'HTTP_ERROR',
        message: exception.message,
        requestId,
      });
      return;
    }
    if (exception instanceof DomainException) {
      const { statusCode, code, message } = exception;
      response
        .status(statusCode)
        .json({ statusCode, code, message, requestId });
      return;
    }
    if (request.log) {
      request.log.error({ err: exception }, 'Unhandled exception');
    } else {
      new Logger(HttpExceptionFilter.name).error(
        `Unhandled exception (requestId ${requestId})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId,
    });
  }
}
