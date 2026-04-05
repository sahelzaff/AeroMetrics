import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ObservabilityService } from '../observability/observability.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly observabilityService: ObservabilityService) {
    super();

    this.$use(async (params, next) => {
      const startedAt = Date.now();
      try {
        const result = await next(params);
        this.observabilityService.recordDbQuery(Date.now() - startedAt, false);
        return result;
      } catch (error) {
        this.observabilityService.recordDbQuery(Date.now() - startedAt, true);
        throw error;
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
