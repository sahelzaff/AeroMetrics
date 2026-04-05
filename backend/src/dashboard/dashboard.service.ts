import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async overview(userId: string) {
    const [attemptCount, recentAttempts, chapters, trend] = await Promise.all([
      this.prisma.testAttempt.count({ where: { userId, status: 'SUBMITTED' } }),
      this.prisma.testAttempt.findMany({
        where: { userId, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          score: true,
          totalQuestions: true,
          submittedAt: true,
        },
      }),
      this.analyticsService.chapterAnalytics(userId),
      this.analyticsService.trend(userId),
    ]);

    const weakChapters = chapters.filter((chapter) => chapter.needsFocus).slice(0, 5);

    return {
      totalSubmittedTests: attemptCount,
      recentAttempts,
      weakChapters,
      chapterAccuracy: chapters,
      trend,
    };
  }
}

