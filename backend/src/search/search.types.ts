export type SearchDocumentKind = 'test' | 'question' | 'user' | 'attempt' | 'analytics' | 'action';

export type SearchDocument = {
  id: string;
  type: SearchDocumentKind;
  title: string;
  description?: string;
  tags?: string[];
  route: string;
  metadata?: Record<string, unknown>;
};

export type RankedSearchResult = SearchDocument & {
  score: number;
};

export type ParsedQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
};
