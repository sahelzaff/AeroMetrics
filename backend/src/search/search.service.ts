import { Injectable } from '@nestjs/common';
import { SearchDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { QueryParser } from './query-parser.service';
import { RankingService } from './ranking.service';
import { IndexService } from './index.service';
import { SearchDocumentKind } from './search.types';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: QueryParser,
    private readonly ranking: RankingService,
    private readonly indexService: IndexService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async search(userId: string, query: string, limit = 20) {
    const parsed = this.parser.parse(query);
    if (!parsed.normalized) {
      return {
        results: [],
        grouped: {
          tests: [],
          users: [],
          questions: [],
          attempts: [],
          analytics: [],
          actions: [],
        },
      };
    }

    const cappedLimit = Math.min(50, Math.max(1, limit));

    const [docs, recentLogs, usageRows] = await Promise.all([
      this.indexService.buildFederatedIndex(userId, parsed, 12),
      this.prisma.searchQueryLog.findMany({
        where: {
          userId,
          normalizedQuery: parsed.normalized,
          selectedType: { not: null },
          selectedId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.searchUsage.findMany({
        where: { userId },
        orderBy: [{ usageCount: 'desc' }, { lastUsedAt: 'desc' }],
        take: 200,
      }),
    ]);

    const recentQueryHits = new Set(
      recentLogs
        .filter((row) => row.selectedType && row.selectedId)
        .map((row) => `${this.fromEnumType(row.selectedType!)}:${row.selectedId!}`),
    );

    const usageBoostByKey = new Map<string, number>();
    for (const row of usageRows) {
      const key = `${this.fromEnumType(row.documentType)}:${row.documentId}`;
      const boost = Math.min(8, Math.log2(row.usageCount + 1));
      usageBoostByKey.set(key, Number(boost.toFixed(2)));
    }

    const ranked = this.ranking.rank(docs, parsed, recentQueryHits, usageBoostByKey).slice(0, cappedLimit);

    const grouped = {
      tests: ranked.filter((item) => item.type === 'test'),
      users: ranked.filter((item) => item.type === 'user'),
      questions: ranked.filter((item) => item.type === 'question'),
      attempts: ranked.filter((item) => item.type === 'attempt'),
      analytics: ranked.filter((item) => item.type === 'analytics'),
      actions: ranked.filter((item) => item.type === 'action'),
    };

    await this.prisma.searchQueryLog.create({
      data: {
        userId,
        query: query.trim(),
        normalizedQuery: parsed.normalized,
      },
    });

    void this.observabilityService.logEvent({
      eventType: 'search_executed',
      userId,
      payload: { query: parsed.normalized, totalResults: ranked.length },
    });

    return {
      results: ranked,
      grouped,
    };
  }

  async trackSelection(
    userId: string,
    input: { id: string; type: SearchDocumentKind; title: string; route: string; query?: string },
  ) {
    const documentType = this.toEnumType(input.type);
    const normalizedQuery = this.parser.parse(input.query ?? '').normalized;

    await this.prisma.searchUsage.upsert({
      where: {
        userId_documentType_documentId: {
          userId,
          documentType,
          documentId: input.id,
        },
      },
      create: {
        userId,
        documentType,
        documentId: input.id,
        title: input.title,
        route: input.route,
        usageCount: 1,
        lastUsedAt: new Date(),
      },
      update: {
        title: input.title,
        route: input.route,
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    await this.prisma.searchQueryLog.create({
      data: {
        userId,
        query: input.query ?? '',
        normalizedQuery,
        selectedType: documentType,
        selectedId: input.id,
        selectedTitle: input.title,
      },
    });

    void this.observabilityService.logEvent({
      eventType: 'search_selection_tracked',
      userId,
      payload: {
        type: input.type,
        id: input.id,
        route: input.route,
      },
    });

    return { success: true };
  }

  private toEnumType(type: SearchDocumentKind): SearchDocumentType {
    switch (type) {
      case 'test':
        return SearchDocumentType.TEST;
      case 'question':
        return SearchDocumentType.QUESTION;
      case 'user':
        return SearchDocumentType.USER;
      case 'attempt':
        return SearchDocumentType.ATTEMPT;
      case 'analytics':
        return SearchDocumentType.ANALYTICS;
      case 'action':
      default:
        return SearchDocumentType.ACTION;
    }
  }

  private fromEnumType(type: SearchDocumentType): SearchDocumentKind {
    switch (type) {
      case SearchDocumentType.TEST:
        return 'test';
      case SearchDocumentType.QUESTION:
        return 'question';
      case SearchDocumentType.USER:
        return 'user';
      case SearchDocumentType.ATTEMPT:
        return 'attempt';
      case SearchDocumentType.ANALYTICS:
        return 'analytics';
      case SearchDocumentType.ACTION:
      default:
        return 'action';
    }
  }
}
