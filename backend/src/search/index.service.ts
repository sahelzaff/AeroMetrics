import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParsedQuery, SearchDocument } from './search.types';

@Injectable()
export class IndexService {
  constructor(private readonly prisma: PrismaService) {}

  async buildFederatedIndex(userId: string, parsed: ParsedQuery, limitPerSource = 8): Promise<SearchDocument[]> {
    const query = parsed.normalized;
    if (!query) {
      return this.actionDocuments();
    }

    const [tests, questions, users, attempts, analytics] = await Promise.all([
      this.searchTests(query, limitPerSource),
      this.searchQuestions(query, limitPerSource),
      this.searchUsers(query, limitPerSource),
      this.searchAttempts(userId, query, limitPerSource),
      this.searchAnalytics(userId, query, limitPerSource),
    ]);

    return [
      ...tests,
      ...questions,
      ...users,
      ...attempts,
      ...analytics,
      ...this.actionDocuments(),
    ];
  }

  private async searchTests(query: string, limit: number): Promise<SearchDocument[]> {
    const blueprints = await this.prisma.testBlueprint.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { subject: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { subject: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return blueprints.map((item) => ({
      id: item.id,
      type: 'test' as const,
      title: item.name,
      description: `${item.subject.name} • ${item.totalQuestions} questions • ${item.timeLimitMinutes} min`,
      tags: ['test', 'blueprint', item.subject.name],
      route: '/blueprints',
      metadata: {
        subjectId: item.subjectId,
      },
    }));
  }

  private async searchQuestions(query: string, limit: number): Promise<SearchDocument[]> {
    const questions = await this.prisma.question.findMany({
      where: {
        isLatest: true,
        OR: [
          { questionText: { contains: query, mode: 'insensitive' } },
          { topic: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
          { chapter: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        chapter: {
          include: { subject: true },
        },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return questions.map((item) => ({
      id: item.id,
      type: 'question' as const,
      title: item.questionText.slice(0, 110),
      description: `${item.chapter.subject.name} • ${item.chapter.name} • ${item.difficulty}`,
      tags: ['question', item.chapter.name, item.chapter.subject.name, ...(item.tags ?? [])],
      route: '/question-bank',
      metadata: {
        chapterId: item.chapterId,
      },
    }));
  }

  private async searchUsers(query: string, limit: number): Promise<SearchDocument[]> {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return users.map((item) => ({
      id: item.id,
      type: 'user' as const,
      title: item.name || item.email,
      description: `${item.email} • ${item.role}`,
      tags: ['user', item.role],
      route: '/dashboard',
    }));
  }

  private async searchAttempts(userId: string, query: string, limit: number): Promise<SearchDocument[]> {
    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        userId,
        status: 'SUBMITTED',
        OR: [
          { blueprint: { name: { contains: query, mode: 'insensitive' } } },
          { id: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        blueprint: true,
      },
      take: limit,
      orderBy: { submittedAt: 'desc' },
    });

    return attempts.map((item) => ({
      id: item.id,
      type: 'attempt' as const,
      title: `Attempt ${item.id.slice(0, 8)} • ${item.blueprint.name}`,
      description: `Score ${item.score}/${item.totalQuestions} • ${Math.round(item.accuracy)}%`,
      tags: ['attempt', 'result', item.blueprint.name],
      route: `/review/${item.id}`,
      metadata: {
        attemptId: item.id,
      },
    }));
  }

  private async searchAnalytics(userId: string, query: string, limit: number): Promise<SearchDocument[]> {
    const chapters = await this.prisma.chapterMetricSnapshot.findMany({
      where: {
        userId,
        OR: [
          { chapter: { name: { contains: query, mode: 'insensitive' } } },
          { chapter: { subject: { name: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        chapter: { include: { subject: true } },
      },
      orderBy: { priorityScore: 'desc' },
      take: limit,
    });

    return chapters.map((item) => ({
      id: item.id,
      type: 'analytics' as const,
      title: `${item.chapter.name} Analytics`,
      description: `${item.chapter.subject.name} • Accuracy ${Math.round(item.accuracy)}% • Priority ${Math.round(item.priorityScore)}`,
      tags: ['analytics', 'chapter', item.chapter.name, item.chapter.subject.name],
      route: '/dashboard',
      metadata: {
        chapterId: item.chapterId,
      },
    }));
  }

  private actionDocuments(): SearchDocument[] {
    return [
      {
        id: 'action-create-test',
        type: 'action',
        title: 'Create Test Blueprint',
        description: 'Create a new chapter-wise test blueprint',
        tags: ['action', 'create', 'test', 'blueprint'],
        route: '/blueprints',
      },
      {
        id: 'action-import-questions',
        type: 'action',
        title: 'Import Questions',
        description: 'Upload and validate new questions',
        tags: ['action', 'import', 'questions'],
        route: '/import',
      },
      {
        id: 'action-take-test',
        type: 'action',
        title: 'Take Test',
        description: 'Start a new test attempt',
        tags: ['action', 'test', 'attempt'],
        route: '/tests',
      },
      {
        id: 'action-view-results',
        type: 'action',
        title: 'View Results',
        description: 'Review past attempts and analytics',
        tags: ['action', 'results', 'analytics'],
        route: '/results',
      },
    ];
  }
}
