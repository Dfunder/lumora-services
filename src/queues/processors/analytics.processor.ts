import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QueueMetricsService } from '../metrics.service';
import { DlqService } from '../dlq.service';
import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker';
import correlation from '../../common/correlation/correlation.service';

export interface AnalyticsEventData {
  campaignId?: string;
  userId?: string;
  action?: string;
  metadata?: Record<string, any>;
  _meta?: { correlationId?: string };
}

/**
 * NOTE: The queue name MUST match the name registered in BullModule.registerQueue()
 * and used in @InjectQueue() — which is 'analytics-queue'.
 * The previous implementation used @Processor('analytics') which was wrong.
 */
const QUEUE_NAME = 'analytics-queue';
const JOB_TIMEOUT_MS = 120_000; // 120 s per acceptance criteria

/**
 * Processes all analytics events from the analytics-queue.
 *
 * Handles:
 * - track-page-view
 * - track-user-action
 * - track-campaign-view
 * - track-donation-completed
 * - increment-view-count (legacy, kept for backward compatibility)
 *
 * Resilience features:
 * - 3 retries with exponential backoff configured at queue level.
 * - 120 s per-job timeout.
 * - Circuit breaker for analytics storage writes.
 * - Exhausted jobs forwarded to analytics-queue-dlq.
 * - Progress tracking + timing metrics on every job.
 */
@Processor(QUEUE_NAME)
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  private readonly storageCircuit: CircuitBreaker;

  constructor(
    private readonly metrics: QueueMetricsService,
    private readonly dlq: DlqService,
  ) {
    this.storageCircuit = new CircuitBreaker({
      failureThreshold: 5, // analytics is lower-criticality, allow more before tripping
      resetTimeoutMs: 60_000,
      onStateChange: (from, to) => {
        if (to === 'OPEN') this.metrics.circuitOpen(QUEUE_NAME, 'analytics-storage');
        else if (to === 'CLOSED') this.metrics.circuitClosed(QUEUE_NAME, 'analytics-storage');
      },
    });
  }

  // ─── Lifecycle hooks ─────────────────────────────────────────────────────────

  @OnQueueActive()
  onActive(job: Job<AnalyticsEventData>) {
    this.metrics.jobStarted(QUEUE_NAME, job.name, job.id);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<AnalyticsEventData>, result: unknown) {
    this.logger.debug(`Analytics job ${job.id} (${job.name}) completed`, { result });
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error('Queue-level error on analytics-queue', error.stack);
  }

  @OnQueueFailed()
  async onFailed(job: Job<AnalyticsEventData>, error: Error) {
    this.metrics.jobFailed(QUEUE_NAME, job.name, job.id, job.attemptsMade, error);

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await this.dlq.moveToDlq(QUEUE_NAME, job, error);
    }
  }

  // ─── Job handlers ─────────────────────────────────────────────────────────────

  /** Page view events from web/app clients. */
  @Process({ name: 'track-page-view', concurrency: 10 })
  async handleTrackPageView(job: Job<AnalyticsEventData>) {
    return this.runWithResilience(job, async () => {
      await this.storageCircuit.call(async () => {
        /** TODO: Persist page view to analytics store (ClickHouse, BigQuery, etc.) */
        this.logger.debug('[STUB] Tracked page-view', {
          userId: job.data.userId,
          metadata: job.data.metadata,
        });
      });
      return { success: true, type: 'page-view' };
    });
  }

  /** Generic user action events (button clicks, form submissions, etc.). */
  @Process({ name: 'track-user-action', concurrency: 10 })
  async handleTrackUserAction(job: Job<AnalyticsEventData>) {
    return this.runWithResilience(job, async () => {
      await this.storageCircuit.call(async () => {
        /** TODO: Persist user action to analytics store. */
        this.logger.debug('[STUB] Tracked user-action', {
          userId: job.data.userId,
          action: job.data.action,
          metadata: job.data.metadata,
        });
      });
      return { success: true, type: 'user-action' };
    });
  }

  /** Campaign detail page view — also increments campaign view count. */
  @Process({ name: 'track-campaign-view', concurrency: 10 })
  async handleTrackCampaignView(job: Job<AnalyticsEventData>) {
    return this.runWithResilience(job, async () => {
      const { campaignId } = job.data;
      await job.progress(50);

      await this.storageCircuit.call(async () => {
        /**
         * TODO: Increment campaign viewCount in DB and write analytics event.
         * Example Prisma:
         * await this.prisma.campaign.update({
         *   where: { id: campaignId },
         *   data: { viewCount: { increment: 1 } },
         * });
         */
        this.logger.debug('[STUB] Tracked campaign-view', { campaignId });
      });

      await job.progress(100);
      return { success: true, type: 'campaign-view', campaignId };
    });
  }

  /** Fired after a donation is confirmed on-chain. */
  @Process({ name: 'track-donation-completed', concurrency: 5 })
  async handleTrackDonationCompleted(job: Job<AnalyticsEventData>) {
    return this.runWithResilience(job, async () => {
      await this.storageCircuit.call(async () => {
        /** TODO: Record donation conversion event in analytics store. */
        this.logger.debug('[STUB] Tracked donation-completed', {
          campaignId: job.data.campaignId,
          metadata: job.data.metadata,
        });
      });
      return { success: true, type: 'donation-completed' };
    });
  }

  /**
   * Legacy job name kept for backward compatibility with any existing
   * enqueued jobs.  Delegates to the campaign-view increment logic.
   */
  @Process({ name: 'increment-view-count', concurrency: 10 })
  async handleIncrementViewCount(job: Job<AnalyticsEventData>) {
    return this.runWithResilience(job, async () => {
      const { campaignId } = job.data;
      await this.storageCircuit.call(async () => {
        /**
         * TODO:
         * await this.prisma.campaign.update({
         *   where: { id: campaignId },
         *   data: { viewCount: { increment: 1 } },
         * });
         */
        this.logger.debug('[STUB] Incremented view count', { campaignId });
      });
      return { success: true, type: 'increment-view-count', campaignId };
    });
  }

  // ─── Resilience wrapper ───────────────────────────────────────────────────────

  private async runWithResilience<T>(
    job: Job<AnalyticsEventData>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const correlationId = job.data._meta?.correlationId;
    const startedAt = Date.now();

    return correlation.run({ correlationId }, async () => {
      await job.progress(0);

      try {
        const result = await Promise.race([
          fn(),
          this.timeoutReject(JOB_TIMEOUT_MS, job),
        ]);

        const duration = Date.now() - startedAt;
        this.metrics.jobCompleted(QUEUE_NAME, job.name, job.id, duration);
        return result;
      } catch (err) {
        const duration = Date.now() - startedAt;

        if (err instanceof CircuitOpenError) {
          this.logger.warn(
            `Analytics storage circuit OPEN – job ${job.id} will retry`,
            err.message,
          );
        } else {
          this.logger.error(
            `Analytics job ${job.id} (${job.name}) failed after ${duration}ms`,
            (err as Error).message,
          );
        }
        throw err;
      }
    });
  }

  private timeoutReject(ms: number, job: Job): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Job ${job.id} timed out after ${ms}ms`)),
        ms,
      ),
    );
  }
}
