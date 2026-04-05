import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ObservabilityService } from '../../observability/observability.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly observabilityService: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: { userId?: string; sessionId?: string }; requestId?: string }
    >();
    const res = context.switchToHttp().getResponse<Response>();

    const requestId = req.requestId ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const responseTimeMs = Date.now() - startedAt;
        const routePath = (req.originalUrl || req.url || '').split('?')[0];

        void this.observabilityService.logRequest({
          service: this.inferService(routePath),
          env: process.env.NODE_ENV ?? 'dev',
          requestId,
          userId: req.user?.userId,
          method: req.method,
          route: routePath,
          statusCode: res.statusCode,
          responseTimeMs,
          ip: req.ip ?? 'unknown',
          userAgent: req.get('user-agent') ?? undefined,
          message: `${req.method} ${routePath} completed with status ${res.statusCode}`,
        });
      }),
    );
  }

  private inferService(path: string): 'api' | 'search' | 'auth' {
    const firstSegment = path.split('/').filter(Boolean)[0];
    if (firstSegment === 'search') {
      return 'search';
    }
    if (firstSegment === 'auth') {
      return 'auth';
    }
    return 'api';
  }
}
