import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ObservabilityService } from './observability/observability.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Get()
  async check() {
    let databaseStatus: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = 'error';
    }

    return {
      status: databaseStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        database: databaseStatus,
      },
    };
  }

  @Get('metrics')
  async metrics() {
    const base = this.observabilityService.getMetricsSnapshot();

    const [newUsers, submittedAgg, totalAttempts] = await Promise.all([
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.testAttempt.aggregate({
        where: { status: 'SUBMITTED' },
        _avg: { score: true, accuracy: true },
        _count: { _all: true },
      }),
      this.prisma.testAttempt.count(),
    ]);

    let dbConnections: number | null = null;
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()",
      )) as Array<{ count: number }>;
      dbConnections = rows?.[0]?.count ?? null;
    } catch {
      dbConnections = null;
    }

    const completionRate = totalAttempts
      ? Number(((submittedAgg._count._all / totalAttempts) * 100).toFixed(2))
      : 0;

    return {
      ...base,
      users: {
        ...base.users,
        newUsers,
      },
      businessMetrics: {
        avgTestScore: Number((submittedAgg._avg.score ?? 0).toFixed(2)),
        avgAccuracy: Number((submittedAgg._avg.accuracy ?? 0).toFixed(2)),
        completionRate,
      },
      system: {
        ...base.system,
        dbConnections,
      },
    };
  }
}
