import { Injectable } from '@nestjs/common';
import type { UserRepository } from '@/shared/domain/ports/user.repository';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async searchExistsById(id: number): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { id } });

    return count > 0;
  }
}
