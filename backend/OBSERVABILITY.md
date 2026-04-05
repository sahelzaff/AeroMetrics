# Observability: Logs, Metrics, Health, Tracing (Local-First)

This backend now provides a production-style observability foundation locally.

## Storage (Local)

Logs are written as JSONL files under:

- `backend/logs/api-access-YYYY-MM-DD.jsonl`
- `backend/logs/app-events-YYYY-MM-DD.jsonl`
- `backend/logs/error-YYYY-MM-DD.jsonl`

Each line is one structured JSON event.

## 1) Logs (Event-Level)

## Request Logs (every API request)
Shape:

```json
{
  "timestamp": "ISO",
  "level": "INFO|WARN|ERROR",
  "service": "api|search|auth",
  "env": "dev|prod",
  "requestId": "uuid",
  "userId": "optional",
  "method": "GET|POST|...",
  "route": "/search",
  "statusCode": 200,
  "responseTimeMs": 120,
  "ip": "client-ip",
  "userAgent": "browser/device",
  "message": "GET /search completed with status 200"
}
```

## Error Logs
Captured by global exception filter:

```json
{
  "level": "ERROR",
  "error": {
    "message": "...",
    "stack": "...",
    "code": "HTTP_500"
  }
}
```

## Auth Logs
Examples:

- `REGISTER_SUCCESS`
- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `TOKEN_REFRESH_SUCCESS`
- `TOKEN_REFRESH_FAILED`
- `LOGOUT_SUCCESS`

## Business Logs
Examples:

- `TEST_STARTED`
- `TEST_SUBMITTED`
- `TEST_REVIEW_VIEWED`
- `TEST_HISTORY_VIEWED`
- `SEARCH_EXECUTED`
- `SEARCH_SELECTION_TRACKED`
- `QUESTION_IMPORT_VALIDATED`
- `QUESTION_IMPORT_COMMITTED`

## Security Logs
Events containing failed/suspicious/rate-limit patterns are logged with WARN level.

## 2) Metrics (Aggregated)

Endpoint:

- `GET /health/metrics`

Returns:

- Traffic metrics:
  - `totalRequests`
  - `requestsPerMinute`
- Performance metrics:
  - `avgResponseTime`
  - `p50`, `p95`, `p99`
- Error metrics:
  - `errorRate`
  - `errorsByType`
- Endpoint metrics:
  - `route`, `count`, `avgTime`, `errorRate`, `p95`
- User metrics:
  - `activeUsers`
  - `topActiveUsers`
  - `newUsers`
- Feature usage:
  - `searchUsage`
  - `testSubmissions`
  - `imports`
- Business metrics:
  - `avgTestScore`
  - `avgAccuracy`
  - `completionRate`
- System metrics:
  - CPU usage (process microseconds)
  - memory usage (rss/heap)
  - `dbConnections` (when DB allows querying `pg_stat_activity`)
- Database metrics:
  - `queryTimeAvg`
  - `slowQueries`

## 3) Tracing (Basic)

Each request carries a `requestId`:

- generated in request interceptor
- returned in response header `x-request-id`
- included in request/error logs

Use this as trace key across logs.

## Health Endpoint

- `GET /health`
  - API + DB liveness (`ok` or `degraded`)

## Quick PowerShell Commands

```powershell
# Tail request logs (today)
Get-Content .\logs\api-access-$(Get-Date -Format yyyy-MM-dd).jsonl -Wait

# Tail business/auth/security logs (today)
Get-Content .\logs\app-events-$(Get-Date -Format yyyy-MM-dd).jsonl -Wait

# Tail errors
Get-Content .\logs\error-$(Get-Date -Format yyyy-MM-dd).jsonl -Wait

# Find by requestId
Get-ChildItem .\logs\*.jsonl | Select-String "<request-id>"

# Find user activity
Get-ChildItem .\logs\*.jsonl | Select-String "<user-id>"
```

## Notes

- Logs are local-first and git-ignored via `backend/logs/`.
- `GET /health/metrics` is process-memory based for fast local monitoring.
- For production, forward the same structured logs to ELK/Loki/Datadog and Prometheus-compatible metrics.
