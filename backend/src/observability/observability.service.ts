import { Injectable } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

interface RequestLogEntry {
  timestamp?: string;
  level?: LogLevel;
  service: 'api' | 'search' | 'auth';
  env: string;
  requestId: string;
  userId?: string;
  method: string;
  route: string;
  statusCode: number;
  responseTimeMs: number;
  ip: string;
  userAgent?: string;
  message: string;
}

interface ErrorLogEntry {
  timestamp?: string;
  level?: LogLevel;
  service: 'api' | 'search' | 'auth';
  env: string;
  requestId: string;
  userId?: string;
  method: string;
  route: string;
  statusCode: number;
  responseTimeMs?: number;
  ip: string;
  userAgent?: string;
  message: string;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
}

@Injectable()
export class ObservabilityService {
  private readonly logDir = join(process.cwd(), 'logs');
  private readonly env = process.env.NODE_ENV ?? 'dev';
  private readonly startedAt = Date.now();
  private readonly slowQueryThresholdMs = Number(process.env.SLOW_QUERY_MS ?? 200);

  private totalRequests = 0;
  private failedRequests = 0;
  private readonly requestsByMinute: number[] = [];
  private readonly latencyWindow: number[] = [];
  private readonly errorsByStatus = new Map<string, number>();

  private readonly endpointStats = new Map<
    string,
    {
      route: string;
      count: number;
      totalTimeMs: number;
      errorCount: number;
      durations: number[];
    }
  >();

  private readonly requestsByFeature = new Map<string, number>();
  private readonly authEventsByType = new Map<string, number>();
  private readonly businessEventsByType = new Map<string, number>();
  private readonly requestsByUser = new Map<string, number>();
  private readonly userLastSeen = new Map<string, number>();

  private dbTotalQueries = 0;
  private dbTotalQueryTimeMs = 0;
  private dbSlowQueries = 0;

  constructor() {
    void mkdir(this.logDir, { recursive: true });
  }

  logRequest(entry: RequestLogEntry) {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    const level = entry.level ?? (entry.statusCode >= 400 ? 'WARN' : 'INFO');

    this.totalRequests += 1;
    if (entry.statusCode >= 400) {
      this.failedRequests += 1;
      const key = String(entry.statusCode);
      this.errorsByStatus.set(key, (this.errorsByStatus.get(key) ?? 0) + 1);
    }

    this.requestsByMinute.push(Date.now());
    this.trimRequestMinuteWindow();

    this.latencyWindow.push(entry.responseTimeMs);
    if (this.latencyWindow.length > 5000) {
      this.latencyWindow.shift();
    }

    this.requestsByFeature.set(entry.service, (this.requestsByFeature.get(entry.service) ?? 0) + 1);

    if (entry.userId) {
      this.requestsByUser.set(entry.userId, (this.requestsByUser.get(entry.userId) ?? 0) + 1);
      this.userLastSeen.set(entry.userId, Date.now());
    }

    const endpoint = this.endpointStats.get(entry.route) ?? {
      route: entry.route,
      count: 0,
      totalTimeMs: 0,
      errorCount: 0,
      durations: [],
    };
    endpoint.count += 1;
    endpoint.totalTimeMs += entry.responseTimeMs;
    if (entry.statusCode >= 400) {
      endpoint.errorCount += 1;
    }
    endpoint.durations.push(entry.responseTimeMs);
    if (endpoint.durations.length > 1000) {
      endpoint.durations.shift();
    }
    this.endpointStats.set(entry.route, endpoint);

    const payload = {
      timestamp,
      level,
      service: entry.service,
      env: entry.env,
      requestId: entry.requestId,
      userId: entry.userId,
      method: entry.method,
      route: entry.route,
      statusCode: entry.statusCode,
      responseTimeMs: entry.responseTimeMs,
      ip: entry.ip,
      userAgent: entry.userAgent,
      message: entry.message,
    };

    return this.writeJsonLine('api-access', payload);
  }

  logError(entry: ErrorLogEntry) {
    const payload = {
      timestamp: entry.timestamp ?? new Date().toISOString(),
      level: entry.level ?? 'ERROR',
      service: entry.service,
      env: entry.env,
      requestId: entry.requestId,
      userId: entry.userId,
      method: entry.method,
      route: entry.route,
      statusCode: entry.statusCode,
      responseTimeMs: entry.responseTimeMs,
      ip: entry.ip,
      userAgent: entry.userAgent,
      message: entry.message,
      error: entry.error,
    };

    return this.writeJsonLine('error', payload);
  }

  logAuthEvent(event: string, payload: { userId?: string; sessionId?: string; [key: string]: unknown }) {
    this.authEventsByType.set(event, (this.authEventsByType.get(event) ?? 0) + 1);
    return this.writeJsonLine('app-events', {
      timestamp: new Date().toISOString(),
      level: event.includes('FAILED') ? 'WARN' : 'INFO',
      service: 'auth',
      env: this.env,
      event,
      ...payload,
    });
  }

  logBusinessEvent(event: string, payload: Record<string, unknown>) {
    this.businessEventsByType.set(event, (this.businessEventsByType.get(event) ?? 0) + 1);
    return this.writeJsonLine('app-events', {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'api',
      env: this.env,
      event,
      ...payload,
    });
  }

  logSecurityEvent(event: string, payload: Record<string, unknown>) {
    return this.writeJsonLine('app-events', {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      service: 'auth',
      env: this.env,
      event,
      ...payload,
    });
  }

  recordDbQuery(durationMs: number, isError = false) {
    this.dbTotalQueries += 1;
    this.dbTotalQueryTimeMs += durationMs;
    if (durationMs >= this.slowQueryThresholdMs || isError) {
      this.dbSlowQueries += 1;
    }
  }

  // Backward-compatible wrappers used by existing modules.
  logApiAccess(entry: {
    method: string;
    path: string;
    feature: string;
    statusCode: number;
    durationMs: number;
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }) {
    const service = this.normalizeService(entry.feature);
    return this.logRequest({
      service,
      env: this.env,
      requestId: entry.requestId ?? 'unknown',
      userId: entry.userId,
      method: entry.method,
      route: entry.path,
      statusCode: entry.statusCode,
      responseTimeMs: entry.durationMs,
      ip: entry.ipAddress ?? 'unknown',
      userAgent: entry.userAgent,
      message: `${entry.method} ${entry.path} -> ${entry.statusCode} in ${entry.durationMs}ms`,
    });
  }

  logEvent(entry: {
    eventType: string;
    level?: 'info' | 'warn' | 'error';
    userId?: string;
    sessionId?: string;
    payload?: Record<string, unknown>;
  }) {
    const event = entry.eventType.toUpperCase();
    if (event.startsWith('AUTH_') || event.startsWith('LOGIN_') || event.startsWith('LOGOUT_')) {
      return this.logAuthEvent(event, {
        userId: entry.userId,
        sessionId: entry.sessionId,
        ...(entry.payload ?? {}),
      });
    }
    if (event.includes('FAILED') || event.includes('SUSPICIOUS') || event.includes('RATE_LIMIT')) {
      return this.logSecurityEvent(event, {
        userId: entry.userId,
        sessionId: entry.sessionId,
        ...(entry.payload ?? {}),
      });
    }
    return this.logBusinessEvent(event, {
      userId: entry.userId,
      sessionId: entry.sessionId,
      ...(entry.payload ?? {}),
    });
  }

  getMetricsSnapshot() {
    this.trimRequestMinuteWindow();

    const avgResponseTime = this.latencyWindow.length
      ? Number((this.latencyWindow.reduce((sum, value) => sum + value, 0) / this.latencyWindow.length).toFixed(2))
      : 0;

    const endpointMetrics = Array.from(this.endpointStats.values())
      .map((entry) => ({
        route: entry.route,
        count: entry.count,
        avgTime: entry.count ? Number((entry.totalTimeMs / entry.count).toFixed(2)) : 0,
        errorRate: entry.count ? Number(((entry.errorCount / entry.count) * 100).toFixed(2)) : 0,
        p95: this.percentile(entry.durations, 95),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const errorRate = this.totalRequests === 0 ? 0 : Number(((this.failedRequests / this.totalRequests) * 100).toFixed(2));

    const memory = process.memoryUsage();

    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds,
      traffic: {
        totalRequests: this.totalRequests,
        requestsPerMinute: this.requestsByMinute.length,
      },
      performance: {
        avgResponseTime,
        p50: this.percentile(this.latencyWindow, 50),
        p95: this.percentile(this.latencyWindow, 95),
        p99: this.percentile(this.latencyWindow, 99),
      },
      errors: {
        errorRate,
        errorsByType: Object.fromEntries(this.errorsByStatus),
      },
      endpointMetrics,
      users: {
        activeUsers: this.activeUsersCount(30),
        topActiveUsers: this.sortMap(this.requestsByUser).slice(0, 10),
      },
      featureUsage: {
        searchUsage: this.businessEventsByType.get('SEARCH_EXECUTED') ?? 0,
        testSubmissions: this.businessEventsByType.get('TEST_SUBMITTED') ?? 0,
        imports: this.businessEventsByType.get('QUESTION_IMPORT_COMMITTED') ?? 0,
      },
      authEvents: Object.fromEntries(this.authEventsByType),
      businessEvents: Object.fromEntries(this.businessEventsByType),
      system: {
        cpuUsageMicros: process.cpuUsage(),
        memoryUsage: {
          rss: memory.rss,
          heapTotal: memory.heapTotal,
          heapUsed: memory.heapUsed,
          external: memory.external,
        },
      },
      database: {
        queryTimeAvg: this.dbTotalQueries ? Number((this.dbTotalQueryTimeMs / this.dbTotalQueries).toFixed(2)) : 0,
        slowQueries: this.dbSlowQueries,
      },
    };
  }

  private percentile(values: number[], percentile: number) {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  private activeUsersCount(lastMinutes: number) {
    const threshold = Date.now() - lastMinutes * 60 * 1000;
    let count = 0;
    for (const [, lastSeen] of this.userLastSeen.entries()) {
      if (lastSeen >= threshold) {
        count += 1;
      }
    }
    return count;
  }

  private sortMap(map: Map<string, number>) {
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }

  private normalizeService(feature: string): 'api' | 'search' | 'auth' {
    if (feature === 'search') {
      return 'search';
    }
    if (feature === 'auth') {
      return 'auth';
    }
    return 'api';
  }

  private trimRequestMinuteWindow() {
    const threshold = Date.now() - 60_000;
    while (this.requestsByMinute.length > 0 && this.requestsByMinute[0] < threshold) {
      this.requestsByMinute.shift();
    }
  }

  private writeJsonLine(prefix: 'api-access' | 'app-events' | 'error', payload: Record<string, unknown>) {
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = join(this.logDir, `${prefix}-${datePart}.jsonl`);
    return appendFile(filename, `${JSON.stringify(payload)}\n`, 'utf8');
  }
}
