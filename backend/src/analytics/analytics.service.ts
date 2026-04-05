import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async chapterAnalytics(userId: string) {
    const snapshots = await this.prisma.chapterMetricSnapshot.findMany({
      where: { userId },
      include: { chapter: { include: { subject: true } } },
      orderBy: { accuracy: 'asc' },
    });

    return snapshots.map((snapshot) => ({
      chapterId: snapshot.chapterId,
      chapterName: snapshot.chapter.name,
      subject: snapshot.chapter.subject.name,
      attemptsCount: snapshot.attemptsCount,
      accuracy: Number(snapshot.accuracy.toFixed(2)),
      averageScore: Number(snapshot.averageScore.toFixed(2)),
      masteryScore: Number(snapshot.masteryScore.toFixed(2)),
      trend: snapshot.trend,
      priorityScore: Number(snapshot.priorityScore.toFixed(2)),
      needsFocus: snapshot.accuracy < 60,
    }));
  }

  async wrongQuestions(userId: string) {
    const wrong = await this.prisma.attemptAnswer.findMany({
      where: {
        isCorrect: false,
        attemptQuestion: {
          attempt: {
            userId,
            status: 'SUBMITTED',
          },
        },
      },
      include: {
        attemptQuestion: {
          include: {
            question: {
              include: {
                chapter: true,
                options: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
        selectedOption: true,
      },
      orderBy: { answeredAt: 'desc' },
      take: 100,
    });

    return wrong.map((entry) => {
      const correctOption = entry.attemptQuestion.question.options.find((option) => option.isCorrect);
      return {
        attemptQuestionId: entry.attemptQuestionId,
        chapter: entry.attemptQuestion.question.chapter.name,
        questionText: entry.attemptQuestion.question.questionText,
        selectedOption: entry.selectedOption.text,
        correctOption: correctOption?.text ?? null,
        explanation: entry.attemptQuestion.question.explanation,
        answeredAt: entry.answeredAt,
      };
    });
  }

  async trend(userId: string) {
    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        userId,
        status: 'SUBMITTED',
      },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        score: true,
        totalQuestions: true,
        submittedAt: true,
      },
    });

    return attempts.map((attempt, index) => ({
      attemptId: attempt.id,
      testNumber: index + 1,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      accuracy: attempt.totalQuestions ? Number(((attempt.score / attempt.totalQuestions) * 100).toFixed(2)) : 0,
      submittedAt: attempt.submittedAt,
    }));
  }
}

