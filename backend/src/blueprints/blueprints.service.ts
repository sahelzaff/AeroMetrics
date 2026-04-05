import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionDifficulty, Trend } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';
import { ObservabilityService } from '../observability/observability.service';

type ChapterAllocationInput = {
  chapterId: string;
  chapterName: string;
  capacity: number;
  weight: number;
};

type AutoPlanResult = {
  rules: Array<{ chapterId: string; questionCount: number; difficulty?: QuestionDifficulty }>;
  diagnostics: {
    mode: 'new_user_equal_mix' | 'weakness_weighted_mix';
    requestedTotalQuestions: number;
    allocatedTotalQuestions: number;
    chapters: Array<{
      chapterId: string;
      chapterName: string;
      weight: number;
      capacity: number;
      allocated: number;
      accuracy?: number;
      priorityScore?: number;
      trend?: Trend;
    }>;
  };
};

@Injectable()
export class BlueprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async create(userId: string, dto: CreateBlueprintDto) {
    const mode = dto.mode ?? 'manual';

    if (mode === 'manual') {
      const rules = dto.rules ?? [];
      this.validateManualRulesTotal(dto.totalQuestions, rules.map((r) => r.questionCount));
      await this.validateManualRulesAgainstAvailability(dto.subjectId, rules);

      const created = await this.prisma.testBlueprint.create({
        data: {
          subjectId: dto.subjectId,
          name: dto.name,
          totalQuestions: dto.totalQuestions,
          timeLimitMinutes: dto.timeLimitMinutes,
          rules: {
            create: rules.map((rule) => ({
              chapterId: rule.chapterId,
              questionCount: rule.questionCount,
              difficulty: rule.difficulty,
            })),
          },
        },
        include: {
          rules: true,
        },
      });

      void this.observabilityService.logBusinessEvent('BLUEPRINT_CREATED_MANUAL', {
        userId,
        blueprintId: created.id,
        subjectId: created.subjectId,
        totalQuestions: created.totalQuestions,
      });

      return created;
    }

    const plan = await this.generateAutoPlan(userId, dto);
    const created = await this.prisma.testBlueprint.create({
      data: {
        subjectId: dto.subjectId,
        name: dto.name,
        totalQuestions: dto.totalQuestions,
        timeLimitMinutes: dto.timeLimitMinutes,
        rules: {
          create: plan.rules.map((rule) => ({
            chapterId: rule.chapterId,
            questionCount: rule.questionCount,
            difficulty: rule.difficulty,
          })),
        },
      },
      include: {
        rules: true,
      },
    });

    void this.observabilityService.logBusinessEvent('BLUEPRINT_CREATED_AUTO', {
      userId,
      blueprintId: created.id,
      subjectId: created.subjectId,
      totalQuestions: created.totalQuestions,
      autoMode: plan.diagnostics.mode,
    });

    return {
      ...created,
      autoPlan: plan.diagnostics,
    };
  }

  async previewAutoRules(userId: string, dto: CreateBlueprintDto) {
    const plan = await this.generateAutoPlan(userId, dto);
    return {
      previewOnly: true,
      rules: plan.rules,
      diagnostics: plan.diagnostics,
    };
  }

  async list() {
    return this.prisma.testBlueprint.findMany({
      include: {
        subject: true,
        rules: {
          include: {
            chapter: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private validateManualRulesTotal(totalQuestions: number, questionCounts: number[]) {
    const rulesTotal = questionCounts.reduce((sum, count) => sum + count, 0);
    if (rulesTotal !== totalQuestions) {
      throw new BadRequestException('Rule total must equal totalQuestions');
    }
  }

  private async validateManualRulesAgainstAvailability(
    subjectId: string,
    rules: Array<{ chapterId: string; questionCount: number; difficulty?: QuestionDifficulty }>,
  ) {
    const chapterIds = [...new Set(rules.map((rule) => rule.chapterId))];
    const chapters = await this.prisma.chapter.findMany({
      where: {
        subjectId,
        id: { in: chapterIds },
      },
      select: { id: true },
    });

    if (chapters.length !== chapterIds.length) {
      throw new BadRequestException('One or more chapters do not belong to selected subject');
    }

    const availability = await this.prisma.question.groupBy({
      by: ['chapterId', 'difficulty'],
      where: {
        isLatest: true,
        chapterId: { in: chapterIds },
      },
      _count: { _all: true },
    });

    const byChapterAndDifficulty = new Map<string, number>();
    const byChapter = new Map<string, number>();
    for (const row of availability) {
      const key = `${row.chapterId}:${row.difficulty}`;
      byChapterAndDifficulty.set(key, row._count._all);
      byChapter.set(row.chapterId, (byChapter.get(row.chapterId) ?? 0) + row._count._all);
    }

    for (const rule of rules) {
      const available = rule.difficulty
        ? byChapterAndDifficulty.get(`${rule.chapterId}:${rule.difficulty}`) ?? 0
        : byChapter.get(rule.chapterId) ?? 0;

      if (available < rule.questionCount) {
        throw new BadRequestException(
          `Insufficient questions for chapter ${rule.chapterId}${
            rule.difficulty ? ` at difficulty ${rule.difficulty}` : ''
          }. Requested ${rule.questionCount}, available ${available}.`,
        );
      }
    }
  }

  private async generateAutoPlan(userId: string, dto: CreateBlueprintDto): Promise<AutoPlanResult> {
    if (!dto.autoConfig) {
      throw new BadRequestException('autoConfig is required when mode is auto');
    }

    const chapterIds = [...new Set(dto.autoConfig.chapterIds)];
    if (!chapterIds.length) {
      throw new BadRequestException('At least one chapter is required for auto mode');
    }

    const difficultyDistribution = dto.autoConfig.difficultyDistribution ?? {
      easy: 30,
      medium: 50,
      hard: 20,
    };

    const distributionTotal =
      difficultyDistribution.easy + difficultyDistribution.medium + difficultyDistribution.hard;
    if (distributionTotal !== 100) {
      throw new BadRequestException('difficultyDistribution must sum to 100');
    }

    const [chapters, availabilityRows, snapshots] = await Promise.all([
      this.prisma.chapter.findMany({
        where: {
          subjectId: dto.subjectId,
          id: { in: chapterIds },
        },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.question.groupBy({
        by: ['chapterId', 'difficulty'],
        where: {
          isLatest: true,
          chapterId: { in: chapterIds },
        },
        _count: { _all: true },
      }),
      this.prisma.chapterMetricSnapshot.findMany({
        where: {
          userId,
          chapterId: { in: chapterIds },
        },
      }),
    ]);

    if (chapters.length !== chapterIds.length) {
      throw new BadRequestException('One or more selected chapters do not belong to subject');
    }

    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const chapterCapacity = new Map<string, number>();
    const chapterDifficultyCapacity = new Map<string, number>();

    for (const row of availabilityRows) {
      chapterCapacity.set(row.chapterId, (chapterCapacity.get(row.chapterId) ?? 0) + row._count._all);
      chapterDifficultyCapacity.set(`${row.chapterId}:${row.difficulty}`, row._count._all);
    }

    const totalAvailable = chapterIds.reduce((sum, chapterId) => sum + (chapterCapacity.get(chapterId) ?? 0), 0);
    if (totalAvailable < dto.totalQuestions) {
      throw new BadRequestException(
        `Not enough questions across selected chapters. Requested ${dto.totalQuestions}, available ${totalAvailable}.`,
      );
    }

    const snapshotByChapterId = new Map(snapshots.map((snapshot) => [snapshot.chapterId, snapshot]));
    const hasHistory = snapshots.some((snapshot) => snapshot.totalAttempts > 0 || snapshot.attemptsCount > 0);

    const prioritizeWeakChapters = dto.autoConfig.prioritizeWeakChapters ?? true;
    const weaknessBoostPercent = Math.max(0, dto.autoConfig.weaknessBoostPercent ?? 100);

    const chapterInputs: ChapterAllocationInput[] = chapterIds.map((chapterId) => {
      const chapter = chapterById.get(chapterId)!;
      const snapshot = snapshotByChapterId.get(chapterId);
      const capacity = chapterCapacity.get(chapterId) ?? 0;
      let weight = 1;

      if (prioritizeWeakChapters && hasHistory && snapshot) {
        const accuracyPenalty = (100 - snapshot.accuracy) / 100;
        const prioritySignal = Math.max(0, snapshot.priorityScore / 100);
        const trendSignal = snapshot.trend === Trend.DOWN ? 0.2 : snapshot.trend === Trend.STABLE ? 0.08 : 0;
        const weaknessStrength = Math.max(0, accuracyPenalty * 0.8 + prioritySignal * 0.35 + trendSignal);
        weight = 1 + weaknessStrength * (weaknessBoostPercent / 100);
      }

      return {
        chapterId,
        chapterName: chapter.name,
        capacity,
        weight,
      };
    });

    const minimumPerChapterRequested = dto.autoConfig.minimumPerChapter ?? 1;
    const effectiveMinimumPerChapter = Math.min(
      minimumPerChapterRequested,
      Math.floor(dto.totalQuestions / chapterInputs.length),
    );

    const allocatedByChapter = this.allocateQuestionCounts({
      totalQuestions: dto.totalQuestions,
      chapters: chapterInputs,
      minimumPerChapter: effectiveMinimumPerChapter,
      maxPerChapter: dto.autoConfig.maxPerChapter,
    });

    const rules: Array<{ chapterId: string; questionCount: number; difficulty?: QuestionDifficulty }> = [];

    for (const chapter of chapterInputs) {
      const chapterTarget = allocatedByChapter.get(chapter.chapterId) ?? 0;
      if (chapterTarget <= 0) {
        continue;
      }

      const difficultyAllocation = this.allocateDifficultyCounts(
        chapter.chapterId,
        chapterTarget,
        difficultyDistribution,
        chapterDifficultyCapacity,
      );

      if (difficultyAllocation.easy > 0) {
        rules.push({
          chapterId: chapter.chapterId,
          questionCount: difficultyAllocation.easy,
          difficulty: QuestionDifficulty.EASY,
        });
      }
      if (difficultyAllocation.medium > 0) {
        rules.push({
          chapterId: chapter.chapterId,
          questionCount: difficultyAllocation.medium,
          difficulty: QuestionDifficulty.MEDIUM,
        });
      }
      if (difficultyAllocation.hard > 0) {
        rules.push({
          chapterId: chapter.chapterId,
          questionCount: difficultyAllocation.hard,
          difficulty: QuestionDifficulty.HARD,
        });
      }

      const allocatedByDifficulty =
        difficultyAllocation.easy + difficultyAllocation.medium + difficultyAllocation.hard;
      const fallbackAnyDifficulty = chapterTarget - allocatedByDifficulty;
      if (fallbackAnyDifficulty > 0) {
        rules.push({
          chapterId: chapter.chapterId,
          questionCount: fallbackAnyDifficulty,
        });
      }
    }

    const allocatedTotalQuestions = rules.reduce((sum, rule) => sum + rule.questionCount, 0);
    if (allocatedTotalQuestions !== dto.totalQuestions) {
      throw new BadRequestException(
        `Auto allocation failed consistency check. Expected ${dto.totalQuestions}, got ${allocatedTotalQuestions}.`,
      );
    }

    return {
      rules,
      diagnostics: {
        mode: hasHistory && prioritizeWeakChapters ? 'weakness_weighted_mix' : 'new_user_equal_mix',
        requestedTotalQuestions: dto.totalQuestions,
        allocatedTotalQuestions,
        chapters: chapterInputs.map((chapter) => {
          const snapshot = snapshotByChapterId.get(chapter.chapterId);
          return {
            chapterId: chapter.chapterId,
            chapterName: chapter.chapterName,
            weight: Number(chapter.weight.toFixed(4)),
            capacity: chapter.capacity,
            allocated: allocatedByChapter.get(chapter.chapterId) ?? 0,
            accuracy: snapshot ? Number(snapshot.accuracy.toFixed(2)) : undefined,
            priorityScore: snapshot ? Number(snapshot.priorityScore.toFixed(2)) : undefined,
            trend: snapshot?.trend,
          };
        }),
      },
    };
  }

  private allocateQuestionCounts(params: {
    totalQuestions: number;
    chapters: ChapterAllocationInput[];
    minimumPerChapter: number;
    maxPerChapter?: number;
  }) {
    const { totalQuestions, chapters, minimumPerChapter, maxPerChapter } = params;

    const assignment = new Map<string, number>();
    const cappedCapacity = new Map<string, number>();

    for (const chapter of chapters) {
      const cap = Math.min(chapter.capacity, maxPerChapter ?? chapter.capacity);
      cappedCapacity.set(chapter.chapterId, cap);
      assignment.set(chapter.chapterId, 0);
    }

    let assigned = 0;
    for (const chapter of chapters) {
      const cap = cappedCapacity.get(chapter.chapterId) ?? 0;
      const minAssign = Math.min(minimumPerChapter, cap);
      assignment.set(chapter.chapterId, minAssign);
      assigned += minAssign;
    }

    if (assigned > totalQuestions) {
      throw new BadRequestException('Unable to satisfy minimumPerChapter for requested totalQuestions');
    }

    let remaining = totalQuestions - assigned;
    const totalExtraCapacity = chapters.reduce(
      (sum, chapter) => sum + Math.max(0, (cappedCapacity.get(chapter.chapterId) ?? 0) - (assignment.get(chapter.chapterId) ?? 0)),
      0,
    );

    if (totalExtraCapacity < remaining) {
      throw new BadRequestException('Chapter capacity is insufficient for requested totalQuestions');
    }

    const totalWeight = chapters.reduce((sum, chapter) => sum + chapter.weight, 0) || 1;

    const fractional: Array<{ chapterId: string; fraction: number; weight: number }> = [];

    for (const chapter of chapters) {
      if (remaining <= 0) {
        break;
      }

      const current = assignment.get(chapter.chapterId) ?? 0;
      const cap = cappedCapacity.get(chapter.chapterId) ?? 0;
      const extraCap = Math.max(0, cap - current);
      if (extraCap === 0) {
        continue;
      }

      const ideal = (remaining * chapter.weight) / totalWeight;
      const floor = Math.min(extraCap, Math.floor(ideal));
      assignment.set(chapter.chapterId, current + floor);
      remaining -= floor;
      fractional.push({
        chapterId: chapter.chapterId,
        fraction: ideal - Math.floor(ideal),
        weight: chapter.weight,
      });
    }

    if (remaining > 0) {
      const sorted = [...fractional].sort((a, b) => b.fraction - a.fraction || b.weight - a.weight);
      for (const entry of sorted) {
        if (remaining <= 0) {
          break;
        }
        const current = assignment.get(entry.chapterId) ?? 0;
        const cap = cappedCapacity.get(entry.chapterId) ?? 0;
        if (current < cap) {
          assignment.set(entry.chapterId, current + 1);
          remaining -= 1;
        }
      }
    }

    if (remaining > 0) {
      const sortedByWeight = [...chapters].sort((a, b) => b.weight - a.weight);
      for (const chapter of sortedByWeight) {
        while (remaining > 0) {
          const current = assignment.get(chapter.chapterId) ?? 0;
          const cap = cappedCapacity.get(chapter.chapterId) ?? 0;
          if (current >= cap) {
            break;
          }
          assignment.set(chapter.chapterId, current + 1);
          remaining -= 1;
        }
        if (remaining <= 0) {
          break;
        }
      }
    }

    if (remaining !== 0) {
      throw new BadRequestException('Auto allocation failed due to chapter capacity constraints');
    }

    return assignment;
  }

  private allocateDifficultyCounts(
    chapterId: string,
    chapterQuestionCount: number,
    distribution: { easy: number; medium: number; hard: number },
    capacityMap: Map<string, number>,
  ) {
    const capacities = {
      easy: capacityMap.get(`${chapterId}:${QuestionDifficulty.EASY}`) ?? 0,
      medium: capacityMap.get(`${chapterId}:${QuestionDifficulty.MEDIUM}`) ?? 0,
      hard: capacityMap.get(`${chapterId}:${QuestionDifficulty.HARD}`) ?? 0,
    };

    const targetRaw = {
      easy: (chapterQuestionCount * distribution.easy) / 100,
      medium: (chapterQuestionCount * distribution.medium) / 100,
      hard: (chapterQuestionCount * distribution.hard) / 100,
    };

    const assigned = {
      easy: Math.min(capacities.easy, Math.floor(targetRaw.easy)),
      medium: Math.min(capacities.medium, Math.floor(targetRaw.medium)),
      hard: Math.min(capacities.hard, Math.floor(targetRaw.hard)),
    };

    let remaining =
      chapterQuestionCount - (assigned.easy + assigned.medium + assigned.hard);

    const candidates: Array<{ key: 'easy' | 'medium' | 'hard'; fraction: number }> = [
      { key: 'easy', fraction: targetRaw.easy - Math.floor(targetRaw.easy) },
      { key: 'medium', fraction: targetRaw.medium - Math.floor(targetRaw.medium) },
      { key: 'hard', fraction: targetRaw.hard - Math.floor(targetRaw.hard) },
    ] as Array<{ key: 'easy' | 'medium' | 'hard'; fraction: number }>;
    candidates.sort((a, b) => b.fraction - a.fraction);

    for (const candidate of candidates) {
      if (remaining <= 0) {
        break;
      }
      const cap = capacities[candidate.key];
      if (assigned[candidate.key] < cap) {
        assigned[candidate.key] += 1;
        remaining -= 1;
      }
    }

    if (remaining > 0) {
      const order: Array<'easy' | 'medium' | 'hard'> = ['medium', 'easy', 'hard'];
      for (const key of order) {
        while (remaining > 0 && assigned[key] < capacities[key]) {
          assigned[key] += 1;
          remaining -= 1;
        }
      }
    }

    return assigned;
  }
}
