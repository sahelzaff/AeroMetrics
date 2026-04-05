import { Injectable } from '@nestjs/common';
import { ParsedQuery, RankedSearchResult, SearchDocument } from './search.types';

@Injectable()
export class RankingService {
  rank(
    docs: SearchDocument[],
    parsed: ParsedQuery,
    recentQueryHits: Set<string>,
    usageBoostByKey: Map<string, number>,
  ): RankedSearchResult[] {
    if (!parsed.normalized) {
      return [];
    }

    const results = docs
      .map((doc) => ({
        ...doc,
        score: this.scoreDocument(doc, parsed, recentQueryHits, usageBoostByKey),
      }))
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    return results;
  }

  private scoreDocument(
    doc: SearchDocument,
    parsed: ParsedQuery,
    recentQueryHits: Set<string>,
    usageBoostByKey: Map<string, number>,
  ) {
    const haystacks = [doc.title, doc.description ?? '', ...(doc.tags ?? [])]
      .join(' ')
      .toLowerCase();

    const title = doc.title.toLowerCase();
    const hasExact = title === parsed.normalized || haystacks.includes(parsed.normalized);
    const hasPrefix = title.startsWith(parsed.normalized) || parsed.tokens.some((t) => title.startsWith(t));

    const fuzzyDistance = this.levenshtein(parsed.normalized, title.slice(0, Math.max(parsed.normalized.length, 1)));
    const fuzzyMatch = fuzzyDistance <= 2 ? 1 : fuzzyDistance <= 4 ? 0.5 : 0;

    const tagMatch = (doc.tags ?? []).some((tag) => parsed.tokens.includes(tag.toLowerCase())) ? 1 : 0;

    const usageKey = `${doc.type}:${doc.id}`;
    const usageBoost = usageBoostByKey.get(usageKey) ?? 0;
    const recentBoost = recentQueryHits.has(usageKey) ? 2 : 0;
    const typePriority = this.typePriority(doc.type);

    return (
      (hasExact ? 10 : 0) +
      (hasPrefix ? 6 : 0) +
      fuzzyMatch * 4 +
      tagMatch * 3 +
      recentBoost +
      usageBoost +
      typePriority
    );
  }

  private typePriority(type: SearchDocument['type']) {
    switch (type) {
      case 'action':
        return 4;
      case 'test':
        return 3;
      case 'question':
        return 2;
      case 'attempt':
        return 2;
      case 'analytics':
        return 1;
      case 'user':
      default:
        return 1;
    }
  }

  private levenshtein(a: string, b: string) {
    const m = a.length;
    const n = b.length;

    if (!m) {
      return n;
    }
    if (!n) {
      return m;
    }

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));

    for (let i = 0; i <= m; i += 1) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j += 1) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    return dp[m][n];
  }
}
