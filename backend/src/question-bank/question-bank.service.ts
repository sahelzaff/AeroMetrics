import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async getStructure() {
    const subjects = await this.prisma.subject.findMany({
      include: {
        chapters: {
          include: {
            questions: {
              where: { isLatest: true },
              select: { id: true },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      chapters: subject.chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        questionCount: chapter.questions.length,
      })),
    }));
  }

  async getQuestionsByChapter(chapterId: string, limit = 100) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    const questions = await this.prisma.question.findMany({
      where: {
        chapterId,
        isLatest: true,
      },
      include: {
        chapter: {
          include: { subject: true },
        },
        options: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return questions.map((question) => ({
      id: question.id,
      chapterId: question.chapterId,
      chapterName: question.chapter.name,
      subjectName: question.chapter.subject.name,
      questionText: question.questionText,
      difficulty: question.difficulty,
      sourceRef: question.sourceRef,
      tags: question.tags,
      version: question.version,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        sortOrder: option.sortOrder,
        isCorrect: option.isCorrect,
      })),
    }));
  }

  async renameChapter(chapterId: string, nextNameInput: string) {
    const nextName = nextNameInput.trim();
    if (!nextName) {
      throw new BadRequestException('Chapter name cannot be empty');
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { subject: true },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    if (chapter.name === nextName) {
      return {
        success: true,
        chapterId,
        chapterName: chapter.name,
      };
    }

    const existingWithName = await this.prisma.chapter.findFirst({
      where: {
        subjectId: chapter.subjectId,
        name: {
          equals: nextName,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    if (existingWithName) {
      throw new BadRequestException('A chapter with this name already exists in the selected subject');
    }

    const updated = await this.prisma.chapter.update({
      where: { id: chapterId },
      data: { name: nextName },
    });

    void this.observabilityService.logBusinessEvent('CHAPTER_RENAMED', {
      chapterId,
      subjectId: chapter.subjectId,
      oldName: chapter.name,
      newName: nextName,
    });

    return {
      success: true,
      chapterId: updated.id,
      chapterName: updated.name,
      oldName: chapter.name,
    };
  }

  async deleteQuestion(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        chapter: true,
        attemptQs: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.attemptQs.length > 0) {
      throw new BadRequestException('Cannot delete a question that has been used in attempts');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.deleteQuestionVersionWithFallback(tx, question);
    });

    const chapterQuestionCount = await this.prisma.question.count({
      where: {
        chapterId: question.chapterId,
        isLatest: true,
      },
    });

    void this.observabilityService.logBusinessEvent('QUESTION_DELETED', {
      questionId: question.id,
      chapterId: question.chapterId,
      chapterName: question.chapter.name,
    });

    return {
      success: true,
      deletedQuestionId: question.id,
      chapterId: question.chapterId,
      chapterName: question.chapter.name,
      remainingQuestionsInChapter: chapterQuestionCount,
    };
  }

  async bulkDeleteQuestions(questionIds: string[]) {
    const uniqueIds = [...new Set(questionIds)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No question ids provided');
    }

    const questions = await this.prisma.question.findMany({
      where: {
        id: { in: uniqueIds },
      },
      include: {
        chapter: true,
        attemptQs: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (questions.length !== uniqueIds.length) {
      throw new NotFoundException('One or more questions were not found');
    }

    const blocked = questions.filter((question) => question.attemptQs.length > 0);
    if (blocked.length > 0) {
      throw new BadRequestException(
        `Cannot bulk delete because ${blocked.length} selected questions have been used in attempts`,
      );
    }

    const chapterIds = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const question of questions) {
        chapterIds.add(question.chapterId);
        await this.deleteQuestionVersionWithFallback(tx, question);
      }
    });

    void this.observabilityService.logBusinessEvent('QUESTION_BULK_DELETED', {
      deletedCount: questions.length,
      chapterCount: chapterIds.size,
    });

    return {
      success: true,
      deletedCount: questions.length,
      affectedChapters: chapterIds.size,
      deletedQuestionIds: questions.map((question) => question.id),
    };
  }

  async deleteChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { subject: true },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const attemptedQuestionCount = await this.prisma.attemptQuestion.count({
      where: {
        question: {
          chapterId,
        },
      },
    });

    if (attemptedQuestionCount > 0) {
      throw new BadRequestException(
        `Cannot delete chapter because ${attemptedQuestionCount} attempted question records depend on it`,
      );
    }

    const totalLatestQuestions = await this.prisma.question.count({
      where: {
        chapterId,
        isLatest: true,
      },
    });

    await this.prisma.chapter.delete({
      where: { id: chapterId },
    });

    void this.observabilityService.logBusinessEvent('CHAPTER_DELETED', {
      chapterId,
      chapterName: chapter.name,
      subjectId: chapter.subjectId,
      subjectName: chapter.subject.name,
      removedLatestQuestions: totalLatestQuestions,
    });

    return {
      success: true,
      deletedChapterId: chapterId,
      deletedChapterName: chapter.name,
      subjectId: chapter.subjectId,
      subjectName: chapter.subject.name,
      removedLatestQuestions: totalLatestQuestions,
    };
  }

  private async deleteQuestionVersionWithFallback(
    tx: any,
    question: {
      id: string;
      chapterId: string;
      questionHash: string;
      version: number;
      isLatest: boolean;
    },
  ) {
    if (question.isLatest) {
      const previousVersion = await tx.question.findFirst({
        where: {
          chapterId: question.chapterId,
          questionHash: question.questionHash,
          version: { lt: question.version },
        },
        orderBy: { version: 'desc' },
      });

      if (previousVersion) {
        await tx.question.update({
          where: { id: previousVersion.id },
          data: { isLatest: true },
        });
      }
    }

    await tx.question.delete({ where: { id: question.id } });
  }
}
