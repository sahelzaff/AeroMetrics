export interface JwtPayload {
  sub: string;
  email: string;
  sessionId: string;
  type: 'access' | 'refresh';
}

