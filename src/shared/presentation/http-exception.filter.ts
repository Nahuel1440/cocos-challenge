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
    // body-parser (http-errors) 4xx: 413, 415... keep their own status.
    // Only exposed http-errors; any other error with a `status` stays a 500.
    const httpError = exception as {
      status?: unknown;
      statusCode?: unknown;
      expose?: unknown;
      type?: unknown;
    };
    if (
      exception instanceof Error &&
      httpError.expose === true &&
      typeof httpError.status === 'number' &&
      httpError.status === httpError.statusCode &&
      httpError.status >= 400 &&
      httpError.status < 500
    ) {
      const { status } = httpError;
      // Body-parser fails before pino-http: no access line, so log it here.
      const context = { requestId, status, type: httpError.type };
      if (request.log) request.log.warn(context, exception.message);
      else new Logger(HttpExceptionFilter.name).warn({ ...context });
      response.status(status).json({
        statusCode: status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: exception.message,
        requestId,
      });
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
