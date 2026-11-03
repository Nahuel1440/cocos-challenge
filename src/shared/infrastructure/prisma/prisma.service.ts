import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const POOL_MAX_CONNECTIONS = 10;
const POOL_CONNECTION_TIMEOUT_MS = 2000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    super({
      adapter: new PrismaPg({
        connectionString,
        max: POOL_MAX_CONNECTIONS,
        connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
      }),
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
