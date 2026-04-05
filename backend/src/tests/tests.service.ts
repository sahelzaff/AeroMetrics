import { BadRequestException, Injectable } from '@nestjs/common';
import type { BlueprintRule, ChapterMetricSnapshot, Question } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateFromBlueprint(userId: string, blueprintId: string, prioritizeWeakChapters: boolean) {
    const blueprint = await this.prisma.testBlueprint.findUnique({
      where: { id: blueprintId },
      include: {
        rules: {
          include: {
            chapter: true,
          },
        },
      },
    });

    if (!blueprint) {
      throw new BadRequestException('Blueprint not found');
    }

    const chapterIds = blueprint.rules.map((rule) => rule.chapterId);
    const chapterSnapshots = await this.prisma.chapterMetricSnapshot.findMany({
      where: {
        userId,
        chapterId: { in: chapterIds },
      },
    });
    const chapterAccuracyMap = new Map(chapterSnapshots.map((snapshot) => [snapshot.chapterId, snapshot]));

    const adjustedRules = prioritizeWeakChapters
      ? this.adjustRuleCountsForWeakChapters(blueprint.rules, chapterAccuracyMap, blueprint.totalQuestions)
      : blueprint.rules.map((rule) => ({ ...rule }));

    const selectedQuestionIds: string[] = [];

    for (const rule of adjustedRules) {
      const pool = await this.prisma.question.findMany({
        where: {
          chapterId: rule.chapterId,
          isLatest: true,
          ...(rule.difficulty ? { difficulty: rule.difficulty } : {}),
        },
        select: { id: true, chapterId: true },
      });

      if (pool.length < rule.questionCount) {
        throw new BadRequestException(
          `Insufficient questions in chapter ${rule.chapter.name} for rule count ${rule.questionCount}`,
        );
      }

      const selected = await this.weightedPickQuestions(userId, pool, rule.questionCount);
      selectedQuestionIds.push(...selected);
    }

    if (selectedQuestionIds.length !== blueprint.totalQuestions) {
      throw new BadRequestException('Blueprint rules total does not match totalQuestions');
    }

    const attempt = await this.prisma.testAttempt.create({
      data: {
        userId,
        blueprintId: blueprint.id,
        totalQuestions: selectedQuestionIds.length,
        questions: {
          create: selectedQuestionIds.map((questionId, index) => ({
            questionId,
            sequence: index + 1,
          })),
        },
      },
      include: {
        questions: {
          include: {
            question: {
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' },
                },
                chapter: { include: { subject: true } },
              },
            },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return {
      attemptId: attempt.id,
      status: attempt.status,
      totalQuestions: attempt.totalQuestions,
      prioritizeWeakChapters,
      questions: attempt.questions.map((entry) => ({
        attemptQuestionId: entry.id,
        sequence: entry.sequence,
        questionId: entry.questionId,
        questionText: entry.question.questionText,
        chapter: entry.question.chapter.name,
        subject: entry.question.chapter.subject.name,
        options: entry.question.options.map((option) => ({
          id: option.id,
          text: option.text,
          sortOrder: option.sortOrder,
        })),
      })),
    };
  }

  private adjustRuleCountsForWeakChapters(
    rules: (BlueprintRule & { chapter: { id: string; name: string } })[],
    accuracyMap: Map<string, ChapterMetricSnapshot>,
    totalQuestions: number,
  ) {
    const adjusted = rules.map((rule) => ({ ...rule }));
    const byStrength = [...adjusted].sort(
      (a, b) => (accuracyMap.get(a.chapterId)?.accuracy ?? 50) - (accuracyMap.get(b.chapterId)?.accuracy ?? 50),
    );

    const transferBudget = Math.max(1, Math.floor(totalQuestions * 0.2));
    let used = 0;

    while (used < transferBudget && byStrength.length > 1) {
      const weak = byStrength[0];
      const strong = byStrength[byStrength.length - 1];
      if (!strong || !weak || strong.chapterId === weak.chapterId || strong.questionCount <= 1) {
        break;
      }

      strong.questionCount -= 1;
      weak.questionCount += 1;
      used += 1;

      byStrength.sort(
        (a, b) => (accuracyMap.get(a.chapterId)?.accuracy ?? 50) - (accuracyMap.get(b.chapterId)?.accuracy ?? 50),
      );
    }

    return adjusted;
  }

  private async weightedPickQuestions(
    userId: string,
    pool: Array<Pick<Question, 'id' | 'chapterId'>>,
    count: number,
  ) {
    const poolIds = pool.map((question) => question.id);

    const history = await this.prisma.attemptQuestion.findMany({
      where: {
        questionId: { in: poolIds },
        attempt: { userId, status: 'SUBMITTED' },
      },
      include: {
        answer: true,
      },
    });

    const historyByQuestion = new Map<string, { wrong: number; correct: number }>();
    for (const item of history) {
      const current = historyByQuestion.get(item.questionId) ?? { wrong: 0, correct: 0 };
      if (item.answer?.isCorrect) {
        current.correct += 1;
      } else if (item.answer) {
        current.wrong += 1;
      }
      historyByQuestion.set(item.questionId, current);
    }

    const weightedPool = pool.map((question) => {
      const stats = historyByQuestion.get(question.id) ?? { wrong: 0, correct: 0 };
      const neverSeenBoost = stats.correct + stats.wrong === 0 ? 2 : 0;
      const wrongBoost = stats.wrong * 3;
      const correctPenalty = stats.correct;
      const weight = Math.max(1, 2 + neverSeenBoost + wrongBoost - correctPenalty);
      return { id: question.id, weight };
    });

    return this.sampleWithoutReplacement(weightedPool, count);
  }

  private sampleWithoutReplacement(pool: Array<{ id: string; weight: number }>, count: number) {
    const copy = [...pool];
    const selected: string[] = [];

    while (selected.length < count && copy.length > 0) {
      const totalWeight = copy.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * totalWeight;
      let chosenIndex = 0;

      for (let i = 0; i < copy.length; i += 1) {
        roll -= copy[i].weight;
        if (roll <= 0) {
          chosenIndex = i;
          break;
        }
      }

      selected.push(copy[chosenIndex].id);
      copy.splice(chosenIndex, 1);
    }

    return selected;
  }
}
