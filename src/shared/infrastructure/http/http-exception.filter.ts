import { randomUUID } from 'node:crypto';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainException, ErrorCategory } from '@/shared/domain';

const STATUS_BY_CATEGORY: Record<ErrorCategory, number> = {
  [ErrorCategory.InvalidArgument]: HttpStatus.BAD_REQUEST,
  [ErrorCategory.NotFound]: HttpStatus.NOT_FOUND,
  [ErrorCategory.Conflict]: HttpStatus.CONFLICT,
  [ErrorCategory.Unprocessable]: HttpStatus.UNPROCESSABLE_ENTITY,
};

interface JsonResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

interface LoggedRequest {
  id?: string;
  log?: {
    warn(context: object, message: string): void;
    error(context: object, message: string): void;
  };
}

interface ErrorReply {
  response: JsonResponse;
  request: LoggedRequest;
  requestId: string;
}

interface ExposedHttpError extends Error {
  status: number;
  type?: unknown;
}

// body-parser (http-errors) 4xx such as 413 and 415 keep their own status;
// any other error with a `status` stays a 500.
function isExposedClientHttpError(
  exception: unknown,
): exception is ExposedHttpError {
  if (!(exception instanceof Error)) return false;
  const status: unknown = Reflect.get(exception, 'status');
  const statusCode: unknown = Reflect.get(exception, 'statusCode');
  const expose: unknown = Reflect.get(exception, 'expose');
  return (
    expose === true &&
    typeof status === 'number' &&
    status === statusCode &&
    status >= 400 &&
    status < 500
  );
}

function validationMessage(exception: BadRequestException): string {
  const body = exception.getResponse();
  const message =
    typeof body === 'object' && 'message' in body ? body.message : undefined;
  return [message].flat().join('; ');
}

function replyValidationError(
  exception: BadRequestException,
  reply: ErrorReply,
): void {
  reply.response.status(400).json({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: validationMessage(exception),
    requestId: reply.requestId,
  });
}

function replyHttpException(exception: HttpException, reply: ErrorReply): void {
  const statusCode = exception.getStatus();
  reply.response.status(statusCode).json({
    statusCode,
    code: HttpStatus[statusCode] ?? 'HTTP_ERROR',
    message: exception.message,
    requestId: reply.requestId,
  });
}

function replyDomainException(
  exception: DomainException,
  reply: ErrorReply,
): void {
  const { code, message, category } = exception;
  const statusCode = STATUS_BY_CATEGORY[category];
  reply.response
    .status(statusCode)
    .json({ statusCode, code, message, requestId: reply.requestId });
}

function replyBodyParserError(
  exception: ExposedHttpError,
  reply: ErrorReply,
): void {
  const { status } = exception;
  // Body-parser fails before pino-http: no access line, so log it here.
  const context = { requestId: reply.requestId, status, type: exception.type };
  if (reply.request.log) reply.request.log.warn(context, exception.message);
  else
    new Logger(HttpExceptionFilter.name).warn({
      ...context,
      message: exception.message,
    });
  reply.response.status(status).json({
    statusCode: status,
    code: HttpStatus[status] ?? 'HTTP_ERROR',
    message: exception.message,
    requestId: reply.requestId,
  });
}

function replyInternalError(exception: unknown, reply: ErrorReply): void {
  if (reply.request.log) {
    reply.request.log.error({ err: exception }, 'Unhandled exception');
  } else {
    new Logger(HttpExceptionFilter.name).error(
      `Unhandled exception (requestId ${reply.requestId})`,
      exception instanceof Error ? exception.stack : String(exception),
    );
  }
  reply.response.status(500).json({
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    requestId: reply.requestId,
  });
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<JsonResponse>();
    const request = http.getRequest<LoggedRequest>();
    // Body-parser errors fail before pino-http runs: no id and no request.log.
    const requestId: string = request.id ?? randomUUID();
    if (!request.id) response.setHeader('X-Request-Id', requestId);
    const reply: ErrorReply = { response, request, requestId };

    if (exception instanceof BadRequestException) {
      replyValidationError(exception, reply);
    } else if (
      exception instanceof HttpException &&
      exception.getStatus() < 500
    ) {
      replyHttpException(exception, reply);
    } else if (exception instanceof DomainException) {
      replyDomainException(exception, reply);
    } else if (isExposedClientHttpError(exception)) {
      replyBodyParserError(exception, reply);
    } else {
      replyInternalError(exception, reply);
    }
  }
}
