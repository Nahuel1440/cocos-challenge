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

const MAX_INT = 2147483647;

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
    if (!/^\d+$/.test(raw) || Number(raw) > MAX_INT) {
      throw new InvalidUserIdException();
    }
    if (!(await this.users.searchExistsById(Number(raw)))) {
      throw new UnknownUserException(raw);
    }
    request.userId = Number(raw);
    return true;
  }
}
