import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { UserRepository } from '@/shared/domain/ports/user.repository';
import { UserIdGuard } from '@/shared/infrastructure/http/user-id.guard';

const contextFor = (request: object) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as ExecutionContext;

const contextWith = (headers: Record<string, string>) =>
  contextFor({ headers });

const usersWith = (exists: boolean): UserRepository => ({
  exists: vi.fn().mockResolvedValue(exists),
});

describe('UserIdGuard', () => {
  it('should reject with MISSING_USER_ID when the X-User-Id header is absent', async () => {
    const guard = new UserIdGuard(usersWith(true));

    await expect(guard.canActivate(contextWith({}))).rejects.toMatchObject({
      code: 'MISSING_USER_ID',
      statusCode: 400,
    });
  });

  it('should reject with INVALID_USER_ID when the X-User-Id header is not an integer', async () => {
    const guard = new UserIdGuard(usersWith(true));

    await expect(
      guard.canActivate(contextWith({ 'x-user-id': 'abc' })),
    ).rejects.toMatchObject({ code: 'INVALID_USER_ID', statusCode: 400 });
  });

  it('should reject with UNKNOWN_USER when no user exists for the X-User-Id', async () => {
    const guard = new UserIdGuard(usersWith(false));

    await expect(
      guard.canActivate(contextWith({ 'x-user-id': '999' })),
    ).rejects.toMatchObject({ code: 'UNKNOWN_USER', statusCode: 400 });
  });

  it('should allow the request and expose the user id when the user exists', async () => {
    const request: { headers: Record<string, string>; userId?: number } = {
      headers: { 'x-user-id': '7' },
    };
    const guard = new UserIdGuard(usersWith(true));

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.userId).toBe(7);
  });

  it('should reject with INVALID_USER_ID when the X-User-Id exceeds the INT range', async () => {
    const guard = new UserIdGuard(usersWith(true));

    await expect(
      guard.canActivate(contextWith({ 'x-user-id': '2147483648' })),
    ).rejects.toMatchObject({ code: 'INVALID_USER_ID', statusCode: 400 });
  });
});
