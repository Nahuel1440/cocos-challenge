import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';

interface RequestWithBody {
  headers: Record<string, string | undefined>;
  is(type: string): string | false | null;
}

function hasBody(request: RequestWithBody): boolean {
  const { 'content-length': length, 'transfer-encoding': encoding } =
    request.headers;

  return Number(length ?? 0) > 0 || encoding !== undefined;
}

@Injectable()
export class JsonBodyGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithBody>();
    if (hasBody(request) && !request.is('application/json')) {
      throw new UnsupportedMediaTypeException(
        'The request body must be application/json',
      );
    }

    return true;
  }
}
