import { Injectable } from '@nestjs/common';
import { ParsedQuery } from './search.types';

@Injectable()
export class QueryParser {
  parse(input: string): ParsedQuery {
    const normalized = (input || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens = normalized.length > 0 ? normalized.split(' ').filter((token) => token.length > 0) : [];

    return {
      raw: input || '',
      normalized,
      tokens,
    };
  }
}
