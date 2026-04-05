import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

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
}
