import { Injectable, OnModuleInit } from '@nestjs/common';
import { logger } from '../common/logger/logger';

/**
 * Lightweight Prometheus-compatible metrics service for queue observability.
 *
 * Counters and histograms are emitted as structured log lines so they can be
 * scraped by a log-based metrics collector (e.g., Prometheus Loki exporter or
 * a custom scrape endpoint).  If `prom-client` is added later this module can
 * be swapped out without touching the processors.
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit {
  /** In-memory counters – reset on process restart. */
  private readonly counters = new Map<string, number>();

  /** Accumulated durations for avg-latency tracking. */
  private readonly durations = new Map<string, number[]>();

  onModuleInit() {
    logger.info('queue.metrics.init', { message: 'Queue metrics service initialized' });
  }

  // ─── Counter helpers ────────────────────────────────────────────────────────

  increment(metric: string, labels: Record<string, string> = {}) {
    const key = this.buildKey(metric, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    logger.info('queue.metric.counter', { metric, labels, value: this.counters.get(key) });
  }

  // ─── Histogram / timing helpers ─────────────────────────────────────────────

  /**
   * Records a job processing duration and emits a structured log entry that
   * can be parsed by a Prometheus push-gateway or log exporter.
   */
  recordDuration(
    metric: string,
    durationMs: number,
    labels: Record<string, string> = {},
  ) {
    const key = this.buildKey(metric, labels);
    const bucket = this.durations.get(key) ?? [];
    bucket.push(durationMs);
    this.durations.set(key, bucket);

    logger.info('queue.metric.histogram', {
      metric,
      labels,
      duration_ms: durationMs,
      sample_count: bucket.length,
      avg_ms: Math.round(bucket.reduce((a, b) => a + b, 0) / bucket.length),
    });
  }

  // ─── Convenience wrappers used by processors ────────────────────────────────

  jobStarted(queue: string, jobName: string, jobId: string | number) {
    this.increment('queue_job_started_total', { queue, job: jobName });
    logger.info('queue.job.started', { queue, job: jobName, jobId });
  }

  jobCompleted(
    queue: string,
    jobName: string,
    jobId: string | number,
    durationMs: number,
  ) {
    this.increment('queue_job_completed_total', { queue, job: jobName });
    this.recordDuration('queue_process_duration_ms', durationMs, {
      queue,
      job: jobName,
    });
    logger.info('queue.job.completed', { queue, job: jobName, jobId, duration_ms: durationMs });
  }

  jobFailed(
    queue: string,
    jobName: string,
    jobId: string | number,
    attempt: number,
    error: Error,
  ) {
    this.increment('queue_job_failed_total', { queue, job: jobName });
    logger.warn('queue.job.failed', {
      queue,
      job: jobName,
      jobId,
      attempt,
      error: error.message,
      stack: error.stack,
    });
  }

  jobMovedToDlq(queue: string, jobName: string, jobId: string | number) {
    this.increment('queue_job_dlq_total', { queue, job: jobName });
    logger.error('queue.job.dlq', {
      queue,
      job: jobName,
      jobId,
      message: 'Job exhausted all retries and was moved to DLQ',
    });
  }

  circuitOpen(queue: string, service: string) {
    this.increment('queue_circuit_open_total', { queue, service });
    logger.error('queue.circuit.open', { queue, service, message: 'Circuit breaker OPENED' });
  }

  circuitClosed(queue: string, service: string) {
    this.increment('queue_circuit_closed_total', { queue, service });
    logger.info('queue.circuit.closed', { queue, service, message: 'Circuit breaker CLOSED' });
  }

  // ─── Snapshot (useful for /health or /metrics HTTP endpoints) ───────────────

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      durationSamples: Object.fromEntries(
        Array.from(this.durations.entries()).map(([k, v]) => [
          k,
          {
            count: v.length,
            avg_ms: v.length
              ? Math.round(v.reduce((a, b) => a + b, 0) / v.length)
              : 0,
            max_ms: v.length ? Math.max(...v) : 0,
            min_ms: v.length ? Math.min(...v) : 0,
          },
        ]),
      ),
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private buildKey(metric: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${metric}{${labelStr}}` : metric;
  }
}
