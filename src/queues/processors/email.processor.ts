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

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
  _meta?: { correlationId?: string };
}

const QUEUE_NAME = 'email-queue';
const JOB_TIMEOUT_MS = 30_000; // 30 s per acceptance criteria

/**
 * Processes all email jobs from the email-queue.
 *
 * Resilience features:
 * - 3 retries with exponential backoff configured at the queue level (bull.config.ts).
 * - Per-job timeout enforced via Promise.race.
 * - Circuit breaker guards calls to the external email provider.
 * - Exhausted jobs are forwarded to email-queue-dlq via DlqService.
 * - Job progress is reported via job.progress() for Bull Board visibility.
 * - Timing metrics emitted on every completion/failure.
 */
@Processor(QUEUE_NAME)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  /** One circuit breaker shared across all email provider calls in this process. */
  private readonly emailProviderCircuit: CircuitBreaker;

  constructor(
    private readonly metrics: QueueMetricsService,
    private readonly dlq: DlqService,
  ) {
    this.emailProviderCircuit = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      onStateChange: (from, to) => {
        if (to === 'OPEN') {
          this.metrics.circuitOpen(QUEUE_NAME, 'email-provider');
        } else if (to === 'CLOSED') {
          this.metrics.circuitClosed(QUEUE_NAME, 'email-provider');
        }
      },
    });
  }

  // ─── Lifecycle hooks ─────────────────────────────────────────────────────────

  @OnQueueActive()
  onActive(job: Job<EmailJobData>) {
    this.metrics.jobStarted(QUEUE_NAME, job.name, job.id);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<EmailJobData>, result: unknown) {
    this.logger.log(`Job ${job.id} (${job.name}) completed`, { result });
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error('Queue-level error on email-queue', error.stack);
  }

  /**
   * Called after ALL retry attempts are exhausted.
   * Forwards the job to the DLQ.
   */
  @OnQueueFailed()
  async onFailed(job: Job<EmailJobData>, error: Error) {
    this.metrics.jobFailed(QUEUE_NAME, job.name, job.id, job.attemptsMade, error);

    // Only move to DLQ when no more retries remain
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await this.dlq.moveToDlq(QUEUE_NAME, job, error);
    }
  }

  // ─── Job handlers ─────────────────────────────────────────────────────────────

  @Process({ name: 'send-notification', concurrency: 5 })
  async handleSendNotification(job: Job<EmailJobData>) {
    return this.runWithResilience(job, () =>
      this.dispatchEmail(job, 'notification'),
    );
  }

  @Process({ name: 'send-welcome', concurrency: 5 })
  async handleSendWelcome(job: Job<EmailJobData>) {
    return this.runWithResilience(job, () =>
      this.dispatchEmail(job, 'welcome'),
    );
  }

  @Process({ name: 'send-campaign-update', concurrency: 5 })
  async handleSendCampaignUpdate(job: Job<EmailJobData>) {
    return this.runWithResilience(job, () =>
      this.dispatchEmail(job, 'campaign-update'),
    );
  }

  // ─── Core dispatch (circuit-breaker protected) ───────────────────────────────

  private async dispatchEmail(
    job: Job<EmailJobData>,
    type: string,
  ): Promise<{ success: boolean; emailId: string; type: string }> {
    const { to, subject, template, context } = job.data;

    return this.emailProviderCircuit.call(async () => {
      /**
       * TODO: Replace this stub with your email provider integration.
       * Example providers: SendGrid (@sendgrid/mail), AWS SES (aws-sdk),
       * Resend (resend), Nodemailer, etc.
       *
       * const sg = new SendGrid(process.env.SENDGRID_API_KEY);
       * await sg.send({ to, subject, templateId: template, dynamicTemplateData: context });
       */
      this.logger.log(
        `[STUB] Sending ${type} email to ${to} | subject: "${subject}" | template: ${template}`,
      );
      this.logger.debug('Email context:', context);

      // Simulate async dispatch
      await Promise.resolve();

      return {
        success: true,
        emailId: `${type}_${Date.now()}`,
        type,
      };
    });
  }

  // ─── Resilience wrapper ───────────────────────────────────────────────────────

  /**
   * Wraps a job handler with:
   * - Correlation ID propagation
   * - job.progress() tracking
   * - Per-job timeout enforcement
   * - Timing metrics
   * - Structured error logging
   */
  private async runWithResilience<T>(
    job: Job<EmailJobData>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const correlationId = job.data._meta?.correlationId;
    const startedAt = Date.now();

    return correlation.run({ correlationId }, async () => {
      await job.progress(0);

      try {
        const result = await Promise.race([
          fn().then((r) => { void job.progress(100); return r; }),
          this.timeoutReject(JOB_TIMEOUT_MS, job),
        ]);

        const duration = Date.now() - startedAt;
        this.metrics.jobCompleted(QUEUE_NAME, job.name, job.id, duration);
        return result;
      } catch (err) {
        const duration = Date.now() - startedAt;

        if (err instanceof CircuitOpenError) {
          this.logger.warn(
            `Email provider circuit is OPEN – job ${job.id} will retry`,
            err.message,
          );
        } else {
          this.logger.error(
            `Job ${job.id} (${job.name}) failed after ${duration}ms on attempt ${job.attemptsMade + 1}`,
            (err as Error).message,
          );
        }
        throw err; // re-throw so Bull records the failure and retries
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
