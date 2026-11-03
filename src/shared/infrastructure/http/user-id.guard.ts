import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidUserIdException,
  MissingUserIdException,
  UnknownUserException,
} from '@/shared/domain';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@/shared/domain/ports/user.repository';
import { POSTGRES_INT_MAX } from '@/shared/infrastructure/http/postgres-int-max';

@Injectable()
export class UserIdGuard implements CanActivate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const raw = request.headers['x-user-id'];
    if (raw === undefined) {
      throw new MissingUserIdException();
    }
    if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) > POSTGRES_INT_MAX) {
      throw new InvalidUserIdException();
    }
    if (!(await this.users.searchExistsById(Number(raw)))) {
      throw new UnknownUserException(raw);
    }
    request.userId = Number(raw);
    return true;
  }
}
