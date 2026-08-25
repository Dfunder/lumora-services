import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import { QueueMetricsService } from './metrics.service';

/**
 * Manages dead-letter queues (DLQ) for all Bull queues.
 *
 * Responsibilities:
 * - Moving exhausted jobs into their queue-specific DLQ.
 * - Replaying individual DLQ jobs back to the originating queue.
 * - Purging DLQ entries that are no longer relevant.
 * - Providing a summary of all DLQ jobs for the monitoring dashboard.
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectQueue('email-queue-dlq')
    private readonly emailDlq: Queue,
    @InjectQueue('contract-events-queue-dlq')
    private readonly contractEventsDlq: Queue,
    @InjectQueue('analytics-queue-dlq')
    private readonly analyticsDlq: Queue,
    @InjectQueue('email-queue')
    private readonly emailQueue: Queue,
    @InjectQueue('contract-events-queue')
    private readonly contractEventsQueue: Queue,
    @InjectQueue('analytics-queue')
    private readonly analyticsQueue: Queue,
    private readonly metrics: QueueMetricsService,
  ) {}

  // ─── Move to DLQ ─────────────────────────────────────────────────────────────

  /**
   * Called by processors after all retries are exhausted.
   * Adds a copy of the failed job to the corresponding DLQ queue, enriched
   * with failure metadata.
   */
  async moveToDlq(
    sourceQueueName: string,
    job: Job,
    error: Error,
  ): Promise<void> {
    const dlqQueue = this.getDlqQueue(sourceQueueName);
    if (!dlqQueue) {
      this.logger.warn(`No DLQ configured for queue: ${sourceQueueName}`);
      return;
    }

    const dlqPayload = {
      originalJobId: job.id,
      originalJobName: job.name,
      originalQueue: sourceQueueName,
      data: job.data,
      failedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorStack: error.stack,
      attempts: job.attemptsMade,
    };

    await dlqQueue.add('dlq-entry', dlqPayload, {
      removeOnComplete: false,
      removeOnFail: false,
    });

    this.metrics.jobMovedToDlq(sourceQueueName, job.name, job.id);
    this.logger.error(
      `Job ${job.id} (${job.name}) from ${sourceQueueName} moved to DLQ after ${job.attemptsMade} attempts`,
      error.message,
    );
  }

  // ─── Replay ──────────────────────────────────────────────────────────────────

  /**
   * Replays a single DLQ job back to its original queue.
   * Returns the new job id on the origin queue.
   */
  async replayJob(
    dlqName: string,
    dlqJobId: string | number,
  ): Promise<{ newJobId: string | number }> {
    const dlqQueue = this.getDlqQueueByName(dlqName);
    if (!dlqQueue) {
      throw new Error(`Unknown DLQ: ${dlqName}`);
    }

    const dlqJob = await dlqQueue.getJob(dlqJobId);
    if (!dlqJob) {
      throw new Error(`DLQ job ${dlqJobId} not found in ${dlqName}`);
    }

    const { originalQueue, originalJobName, data } = dlqJob.data as {
      originalQueue: string;
      originalJobName: string;
      data: unknown;
    };

    const originQueue = this.getOriginQueue(originalQueue);
    if (!originQueue) {
      throw new Error(`Cannot resolve origin queue for: ${originalQueue}`);
    }

    const newJob = await originQueue.add(originalJobName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    });

    // Remove the DLQ entry after successful replay
    await dlqJob.remove();

    this.logger.log(
      `Replayed DLQ job ${dlqJobId} → new job ${newJob.id} on ${originalQueue}`,
    );
    return { newJobId: newJob.id };
  }

  /**
   * Replays ALL waiting jobs in a given DLQ back to their origin queue.
   */
  async replayAll(dlqName: string): Promise<{ replayed: number }> {
    const dlqQueue = this.getDlqQueueByName(dlqName);
    if (!dlqQueue) throw new Error(`Unknown DLQ: ${dlqName}`);

    const jobs = await dlqQueue.getJobs(['waiting', 'failed']);
    let replayed = 0;

    for (const job of jobs) {
      try {
        await this.replayJob(dlqName, job.id);
        replayed++;
      } catch (err) {
        this.logger.error(`Failed to replay DLQ job ${job.id}`, err);
      }
    }

    this.logger.log(`Replayed ${replayed}/${jobs.length} jobs from ${dlqName}`);
    return { replayed };
  }

  // ─── Monitoring ──────────────────────────────────────────────────────────────

  async getDlqSummary() {
    const [email, contractEvents, analytics] = await Promise.all([
      this.getQueueDlqStats(this.emailDlq, 'email-queue-dlq'),
      this.getQueueDlqStats(this.contractEventsDlq, 'contract-events-queue-dlq'),
      this.getQueueDlqStats(this.analyticsDlq, 'analytics-queue-dlq'),
    ]);

    return { email, contractEvents, analytics };
  }

  private async getQueueDlqStats(queue: Queue, name: string) {
    const [waiting, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getFailed(),
    ]);

    return {
      queue: name,
      waiting: waiting.length,
      failed: failed.length,
      total: waiting.length + failed.length,
      oldestJob:
        waiting[0]?.timestamp
          ? new Date(waiting[0].timestamp).toISOString()
          : null,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getDlqQueue(sourceQueueName: string): Queue | null {
    switch (sourceQueueName) {
      case 'email-queue':
        return this.emailDlq;
      case 'contract-events-queue':
        return this.contractEventsDlq;
      case 'analytics-queue':
        return this.analyticsDlq;
      default:
        return null;
    }
  }

  private getDlqQueueByName(dlqName: string): Queue | null {
    switch (dlqName) {
      case 'email-queue-dlq':
        return this.emailDlq;
      case 'contract-events-queue-dlq':
        return this.contractEventsDlq;
      case 'analytics-queue-dlq':
        return this.analyticsDlq;
      default:
        return null;
    }
  }

  private getOriginQueue(queueName: string): Queue | null {
    switch (queueName) {
      case 'email-queue':
        return this.emailQueue;
      case 'contract-events-queue':
        return this.contractEventsQueue;
      case 'analytics-queue':
        return this.analyticsQueue;
      default:
        return null;
    }
  }
}
