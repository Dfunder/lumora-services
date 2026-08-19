Logging strategy

Overview

- Use Winston for structured JSON logs.
- Correlation ID propagated via AsyncLocalStorage and `x-correlation-id` header.
- Request start/end logs include method, path, duration, userId and walletAddress.
- Slow DB queries (>100ms) are logged with model/action/params and correlation id.
- Queue jobs are enriched with `_meta.correlationId` when enqueued; processors propagate this id into their execution context.
- Business events (e.g., campaign.created) emitted as structured log entries.

Correlation flow

1. Incoming HTTP request: middleware extracts `x-correlation-id` or generates one and stores it in AsyncLocalStorage.
2. Middleware sets the `x-correlation-id` response header and logs request start.
3. Async code (DB calls, queue enqueueing) reads correlation id from AsyncLocalStorage and attaches it to logs and job payloads.
4. Queue processor reads `_meta.correlationId` from `job.data` and runs the job inside the same AsyncLocalStorage context.

Sentry/ELK

- Logs are JSON formatted; include timestamps and error stacks when available.
- Sentry can be used for error aggregation (SENTRY_DSN env var); errors should include correlationId to trace back to logs.

Notes

- Header name: `x-correlation-id`.
- For long-running background jobs, ensure `_meta.correlationId` is present in job data.

*** End of file
