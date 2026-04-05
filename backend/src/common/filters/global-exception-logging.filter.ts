import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ObservabilityService } from '../../observability/observability.service';

@Catch()
export class GlobalExceptionLoggingFilter implements ExceptionFilter {
  constructor(private readonly observabilityService: ObservabilityService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { user?: { userId?: string }; requestId?: string }>();
    const res = ctx.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const routePath = (req.originalUrl || req.url || '').split('?')[0];
    const requestId = req.requestId ?? 'unknown';

    const errorMessage =
      exception instanceof HttpException
        ? this.extractHttpMessage(exception)
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const stack = exception instanceof Error ? exception.stack : undefined;
    const code =
      exception instanceof HttpException
        ? `HTTP_${statusCode}`
        : exception instanceof Error
          ? exception.name
          : 'UNKNOWN_ERROR';

    void this.observabilityService.logError({
      service: this.inferService(routePath),
      env: process.env.NODE_ENV ?? 'dev',
      requestId,
      userId: req.user?.userId,
      method: req.method,
      route: routePath,
      statusCode,
      ip: req.ip ?? 'unknown',
      userAgent: req.get('user-agent') ?? undefined,
      message: `${req.method} ${routePath} failed with status ${statusCode}`,
      error: {
        message: errorMessage,
        stack,
        code,
      },
    });

    const responseBody = {
      statusCode,
      message: errorMessage,
      requestId,
      timestamp: new Date().toISOString(),
    };

    res.status(statusCode).json(responseBody);
  }

  private extractHttpMessage(exception: HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response && 'message' in response) {
      const messageValue = (response as { message?: string | string[] }).message;
      if (Array.isArray(messageValue)) {
        return messageValue.join(', ');
      }
      if (typeof messageValue === 'string') {
        return messageValue;
      }
    }
    return exception.message;
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
