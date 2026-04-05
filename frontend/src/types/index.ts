export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface DashboardOverview {
  totalSubmittedTests: number;
  recentAttempts: Array<{
    id: string;
    score: number;
    totalQuestions: number;
    submittedAt: string;
  }>;
  weakChapters: Array<{
    chapterName: string;
    accuracy: number;
  }>;
  chapterAccuracy: Array<{
    chapterName: string;
    accuracy: number;
    attemptsCount: number;
  }>;
  trend: Array<{
    attemptId: string;
    testNumber: number;
    score: number;
    totalQuestions: number;
    accuracy: number;
    submittedAt: string;
  }>;
}
