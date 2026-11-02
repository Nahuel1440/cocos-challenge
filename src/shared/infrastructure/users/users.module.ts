import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from '@/shared/domain/ports/user.repository';
import { PrismaUserRepository } from '@/shared/infrastructure/users/prisma-user.repository';

@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
