import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlueprintDto } from './dto/create-blueprint.dto';

@Injectable()
export class BlueprintsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBlueprintDto) {
    const rulesTotal = dto.rules.reduce((sum, rule) => sum + rule.questionCount, 0);
    if (rulesTotal !== dto.totalQuestions) {
      throw new BadRequestException('Rule total must equal totalQuestions');
    }

    return this.prisma.testBlueprint.create({
      data: {
        subjectId: dto.subjectId,
        name: dto.name,
        totalQuestions: dto.totalQuestions,
        timeLimitMinutes: dto.timeLimitMinutes,
        rules: {
          create: dto.rules.map((rule) => ({
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
}

