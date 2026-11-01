import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DomainException } from '@/shared/domain/domain.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof BadRequestException) {
      const { message } = exception.getResponse() as {
        message: string | string[];
      };
      response.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: [message].flat().join('; '),
      });
      return;
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json({
        statusCode,
        code: HttpStatus[statusCode] ?? 'HTTP_ERROR',
        message: exception.message,
      });
      return;
    }
    if (exception instanceof DomainException) {
      const { statusCode, code, message } = exception;
      response.status(statusCode).json({ statusCode, code, message });
      return;
    }
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
