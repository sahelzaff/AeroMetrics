import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Trend } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(userId: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        blueprint: true,
        questions: {
          include: {
            answer: true,
            question: {
              include: {
                chapter: true,
                options: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      timeLimitMinutes: attempt.blueprint.timeLimitMinutes,
      totalQuestions: attempt.totalQuestions,
      questions: attempt.questions.map((entry) => ({
        attemptQuestionId: entry.id,
        sequence: entry.sequence,
        questionText: entry.question.questionText,
        chapter: entry.question.chapter.name,
        options: entry.question.options.map((option) => ({
          id: option.id,
          text: option.text,
          sortOrder: option.sortOrder,
        })),
        selectedOptionId: entry.answer?.selectedOptionId ?? null,
      })),
    };
  }

  async start(userId: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, userId },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status !== AttemptStatus.DRAFT) {
      return attempt;
    }

    return this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
  }

  async answer(userId: string, attemptId: string, attemptQuestionId: string, selectedOptionId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({ where: { id: attemptId, userId } });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status === AttemptStatus.SUBMITTED) {
      throw new BadRequestException('Attempt already submitted');
    }

    const attemptQuestion = await this.prisma.attemptQuestion.findFirst({
      where: { id: attemptQuestionId, attemptId },
      include: { question: { include: { options: true } } },
    });

    if (!attemptQuestion) {
      throw new NotFoundException('Attempt question not found');
    }

    const selectedOption = attemptQuestion.question.options.find((option) => option.id === selectedOptionId);
    if (!selectedOption) {
      throw new BadRequestException('Option does not belong to question');
    }

    return this.prisma.attemptAnswer.upsert({
      where: { attemptQuestionId },
      create: {
        attemptQuestionId,
        selectedOptionId,
        isCorrect: selectedOption.isCorrect,
      },
      update: {
        selectedOptionId,
        isCorrect: selectedOption.isCorrect,
        answeredAt: new Date(),
      },
    });
  }

  async submit(userId: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        questions: {
          include: {
            answer: true,
            question: { include: { chapter: true } },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status === AttemptStatus.SUBMITTED) {
      const existingMetric = await this.prisma.testPerformanceMetric.findUnique({
        where: { attemptId: attempt.id },
      });
      return {
        attemptId: attempt.id,
        status: attempt.status,
        score: attempt.score,
        accuracy: Number(attempt.accuracy.toFixed(2)),
        timeSpentSeconds: attempt.timeSpentSeconds,
        weightedScore: existingMetric?.weightedScore ?? Number((attempt.accuracy * 0.8).toFixed(2)),
        qualityScore: existingMetric?.qualityScore ?? Number((attempt.accuracy * 0.75).toFixed(2)),
        totalQuestions: attempt.totalQuestions,
      };
    }

    const score = attempt.questions.reduce((acc, question) => acc + (question.answer?.isCorrect ? 1 : 0), 0);
    const accuracy = attempt.totalQuestions ? (score / attempt.totalQuestions) * 100 : 0;
    const now = new Date();
    const timeSpentSeconds = attempt.startedAt
      ? Math.max(0, Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000))
      : 0;
    const speed = attempt.totalQuestions ? attempt.totalQuestions / Math.max(1, timeSpentSeconds / 60) : 0;
    const weightedScore = Number(((accuracy * 0.7) + (Math.min(speed, 3) / 3) * 30).toFixed(2));
    const qualityScore = Number(((accuracy * 0.8) + (Math.min(speed, 2.5) / 2.5) * 20).toFixed(2));

    const updated = await this.prisma.testAttempt.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.SUBMITTED,
        score,
        accuracy,
        timeSpentSeconds,
        submittedAt: now,
      },
    });

    await this.prisma.testPerformanceMetric.upsert({
      where: { attemptId: updated.id },
      create: {
        attemptId: updated.id,
        speed,
        accuracy,
        weightedScore,
        qualityScore,
      },
      update: {
        speed,
        accuracy,
        weightedScore,
        qualityScore,
      },
    });

    await this.rebuildChapterSnapshots(userId);

    const chapterStats = this.buildChapterStats(attempt.questions.map((entry) => ({
      chapterName: entry.question.chapter.name,
      correct: Boolean(entry.answer?.isCorrect),
    })));

    return {
      attemptId: updated.id,
      status: updated.status,
      score: updated.score,
      accuracy: Number(updated.accuracy.toFixed(2)),
      timeSpentSeconds: updated.timeSpentSeconds,
      weightedScore,
      qualityScore,
      totalQuestions: updated.totalQuestions,
      chapterBreakdown: chapterStats,
    };
  }

  async review(userId: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        performanceMetrics: true,
        questions: {
          include: {
            answer: true,
            question: {
              include: {
                chapter: true,
                options: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    const accuracy = attempt.totalQuestions ? (attempt.score / attempt.totalQuestions) * 100 : 0;
    const weightedScore = attempt.performanceMetrics?.weightedScore ?? Number((accuracy * 0.8).toFixed(2));
    const qualityScore = attempt.performanceMetrics?.qualityScore ?? Number((accuracy * 0.75).toFixed(2));
    const speed =
      attempt.performanceMetrics?.speed ??
      (attempt.totalQuestions
        ? attempt.totalQuestions / Math.max(1, (attempt.timeSpentSeconds || 1) / 60)
        : 0);

    return {
      attemptId: attempt.id,
      status: attempt.status,
      score: attempt.score,
      accuracy: Number(accuracy.toFixed(2)),
      weightedScore: Number(weightedScore.toFixed(2)),
      qualityScore: Number(qualityScore.toFixed(2)),
      speed: Number(speed.toFixed(2)),
      timeSpentSeconds: attempt.timeSpentSeconds,
      totalQuestions: attempt.totalQuestions,
      questions: attempt.questions.map((entry) => {
        const correctOption = entry.question.options.find((option) => option.isCorrect);
        return {
          attemptQuestionId: entry.id,
          sequence: entry.sequence,
          chapter: entry.question.chapter.name,
          questionText: entry.question.questionText,
          options: entry.question.options,
          selectedOptionId: entry.answer?.selectedOptionId ?? null,
          correctOptionId: correctOption?.id ?? null,
          isCorrect: entry.answer?.isCorrect ?? false,
          timeSpentSeconds: entry.answer?.timeSpentSeconds ?? 0,
          confidence: entry.answer?.confidence ?? null,
          explanation: entry.question.explanation,
        };
      }),
    };
  }

  async history(userId: string, page = 1, limit = 20) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;
    const skip = (safePage - 1) * safeLimit;

    const [total, attempts] = await Promise.all([
      this.prisma.testAttempt.count({
        where: { userId, status: AttemptStatus.SUBMITTED },
      }),
      this.prisma.testAttempt.findMany({
        where: { userId, status: AttemptStatus.SUBMITTED },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          blueprint: {
            select: {
              id: true,
              name: true,
            },
          },
          performanceMetrics: true,
          questions: {
            include: {
              answer: true,
            },
          },
        },
      }),
    ]);

    return {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      items: attempts.map((attempt) => {
        const attemptedCount = attempt.questions.filter((question) => Boolean(question.answer)).length;
        const correctCount = attempt.questions.filter((question) => Boolean(question.answer?.isCorrect)).length;
        const skippedCount = attempt.totalQuestions - attemptedCount;
        const incorrectCount = attemptedCount - correctCount;
        const accuracy = attempt.totalQuestions ? (correctCount / attempt.totalQuestions) * 100 : 0;

        return {
          attemptId: attempt.id,
          blueprintId: attempt.blueprintId,
          blueprintName: attempt.blueprint?.name ?? 'Generated Test',
          score: attempt.score,
          totalQuestions: attempt.totalQuestions,
          correctCount,
          incorrectCount,
          skippedCount,
          accuracy: Number((attempt.accuracy || accuracy).toFixed(2)),
          weightedScore: Number(
            (attempt.performanceMetrics?.weightedScore ?? (attempt.accuracy || accuracy) * 0.8).toFixed(2),
          ),
          qualityScore: Number(
            (attempt.performanceMetrics?.qualityScore ?? (attempt.accuracy || accuracy) * 0.75).toFixed(2),
          ),
          timeSpentSeconds: attempt.timeSpentSeconds,
          submittedAt: attempt.submittedAt,
        };
      }),
    };
  }

  private buildChapterStats(items: Array<{ chapterName: string; correct: boolean }>) {
    const map = new Map<string, { chapter: string; total: number; correct: number }>();

    for (const item of items) {
      const current = map.get(item.chapterName) ?? {
        chapter: item.chapterName,
        total: 0,
        correct: 0,
      };
      current.total += 1;
      if (item.correct) {
        current.correct += 1;
      }
      map.set(item.chapterName, current);
    }

    return Array.from(map.values()).map((value) => ({
      ...value,
      accuracy: value.total ? Number(((value.correct / value.total) * 100).toFixed(2)) : 0,
    }));
  }

  private async rebuildChapterSnapshots(userId: string) {
    const submittedAttempts = await this.prisma.testAttempt.findMany({
      where: { userId, status: AttemptStatus.SUBMITTED },
      include: {
        questions: {
          include: {
            answer: true,
            question: { include: { chapter: true } },
          },
        },
      },
    });

    const chapterMap = new Map<string, { chapterId: string; correct: number; total: number; attempts: Set<string> }>();

    for (const attempt of submittedAttempts) {
      for (const question of attempt.questions) {
        const chapterId = question.question.chapter.id;
        const current = chapterMap.get(chapterId) ?? {
          chapterId,
          correct: 0,
          total: 0,
          attempts: new Set<string>(),
        };

        current.total += 1;
        if (question.answer?.isCorrect) {
          current.correct += 1;
        }
        current.attempts.add(attempt.id);
        chapterMap.set(chapterId, current);
      }
    }

    for (const stat of chapterMap.values()) {
      const accuracy = stat.total ? (stat.correct / stat.total) * 100 : 0;
      const averageScore = stat.total ? stat.correct / stat.attempts.size : 0;
      const existing = await this.prisma.chapterMetricSnapshot.findUnique({
        where: { userId_chapterId: { userId, chapterId: stat.chapterId } },
      });
      const trend = this.getTrend(existing?.accuracy ?? null, accuracy);
      const masteryScore = Number((accuracy * 0.75 + Math.min(100, stat.attempts.size * 5) * 0.25).toFixed(2));
      const priorityScore = Number((100 - accuracy + (trend === Trend.DOWN ? 15 : trend === Trend.STABLE ? 5 : 0)).toFixed(2));

      await this.prisma.chapterMetricSnapshot.upsert({
        where: { userId_chapterId: { userId, chapterId: stat.chapterId } },
        create: {
          userId,
          chapterId: stat.chapterId,
          attemptsCount: stat.attempts.size,
          totalAttempts: stat.attempts.size,
          totalCorrect: stat.correct,
          totalQuestions: stat.total,
          accuracy,
          averageScore,
          masteryScore,
          trend,
          priorityScore,
        },
        update: {
          attemptsCount: stat.attempts.size,
          totalAttempts: stat.attempts.size,
          totalCorrect: stat.correct,
          totalQuestions: stat.total,
          accuracy,
          averageScore,
          masteryScore,
          trend,
          priorityScore,
        },
      });
    }
  }

  private getTrend(previousAccuracy: number | null, currentAccuracy: number): Trend {
    if (previousAccuracy === null) {
      return Trend.STABLE;
    }
    if (currentAccuracy - previousAccuracy >= 3) {
      return Trend.UP;
    }
    if (previousAccuracy - currentAccuracy >= 3) {
      return Trend.DOWN;
    }
    return Trend.STABLE;
  }
}

