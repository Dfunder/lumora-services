import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import type { ConfigType } from '@nestjs/config';
import bullConfig from '../config/bull.config';
import correlation from '../common/correlation/correlation.service';
import { logger } from '../common/logger/logger';
import { DlqService } from './dlq.service';
import { QueueMetricsService } from './metrics.service';
import type { EmailJobData } from './processors/email.processor';
import type { ContractEventData } from './processors/contract-events.processor';
import type { AnalyticsEventData } from './processors/analytics.processor';

@Injectable()
export class QueueService {
  private readonly nestLogger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('email-queue')
    private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue('contract-events-queue')
    private readonly contractEventsQueue: Queue<ContractEventData>,
    @InjectQueue('analytics-queue')
    private readonly analyticsQueue: Queue<AnalyticsEventData>,
    @Inject(bullConfig.KEY)
    private readonly config: ConfigType<typeof bullConfig>,
    private readonly dlqService: DlqService,
    private readonly metrics: QueueMetricsService,
  ) {}

  // ─── Email queue ─────────────────────────────────────────────────────────────

  async sendNotificationEmail(data: EmailJobData, delay?: number): Promise<Job<EmailJobData>> {
    const enriched = this.enrich(data);
    logger.info('queue.enqueue', {
      queue: 'email-queue',
      job: 'send-notification',
      correlationId: enriched._meta?.correlationId,
    });
    return this.emailQueue.add('send-notification', enriched, {
      delay,
      ...this.emailJobOptions(),
    });
  }

  async sendWelcomeEmail(data: EmailJobData, delay?: number): Promise<Job<EmailJobData>> {
    const enriched = this.enrich(data);
    return this.emailQueue.add('send-welcome', enriched, {
      delay,
      ...this.emailJobOptions(),
    });
  }

  async sendCampaignUpdateEmail(data: EmailJobData, delay?: number): Promise<Job<EmailJobData>> {
    const enriched = this.enrich(data);
    return this.emailQueue.add('send-campaign-update', enriched, {
      delay,
      ...this.emailJobOptions(),
    });
  }

  // ─── Contract events queue ───────────────────────────────────────────────────

  async processDonationEvent(data: ContractEventData): Promise<Job<ContractEventData>> {
    const enriched = this.enrich(data);
    logger.info('queue.enqueue', {
      queue: 'contract-events-queue',
      job: 'process-donation',
      correlationId: enriched._meta?.correlationId,
    });
    return this.contractEventsQueue.add('process-donation', enriched, {
      ...this.contractJobOptions(),
      priority: 10, // highest priority for financial events
    });
  }

  async processCampaignCreatedEvent(data: ContractEventData): Promise<Job<ContractEventData>> {
    const enriched = this.enrich(data);
    return this.contractEventsQueue.add('process-campaign-created', enriched, {
      ...this.contractJobOptions(),
    });
  }

  async processCampaignFundedEvent(data: ContractEventData): Promise<Job<ContractEventData>> {
    const enriched = this.enrich(data);
    return this.contractEventsQueue.add('process-campaign-funded', enriched, {
      ...this.contractJobOptions(),
      priority: 8,
    });
  }

  async processWithdrawalEvent(data: ContractEventData): Promise<Job<ContractEventData>> {
    const enriched = this.enrich(data);
    return this.contractEventsQueue.add('process-withdrawal', enriched, {
      ...this.contractJobOptions(),
      priority: 10,
    });
  }

  async processMilestoneReleasedEvent(data: ContractEventData): Promise<Job<ContractEventData>> {
    const enriched = this.enrich(data);
    logger.info('queue.enqueue', {
      queue: 'contract-events-queue',
      job: 'process-milestone-released',
      correlationId: enriched._meta?.correlationId,
    });
    return this.contractEventsQueue.add('process-milestone-released', enriched, {
      ...this.contractJobOptions(),
      priority: 9,
    });
  }

  // ─── Analytics queue ─────────────────────────────────────────────────────────

  async trackPageView(data: AnalyticsEventData): Promise<Job<AnalyticsEventData>> {
    const enriched = this.enrich(data);
    logger.info('queue.enqueue', {
      queue: 'analytics-queue',
      job: 'track-page-view',
      correlationId: enriched._meta?.correlationId,
    });
    return this.analyticsQueue.add('track-page-view', enriched, {
      ...this.analyticsJobOptions(),
      priority: 1,
    });
  }

  async trackUserAction(data: AnalyticsEventData): Promise<Job<AnalyticsEventData>> {
    const enriched = this.enrich(data);
    return this.analyticsQueue.add('track-user-action', enriched, {
      ...this.analyticsJobOptions(),
      priority: 3,
    });
  }

  async trackCampaignView(data: AnalyticsEventData): Promise<Job<AnalyticsEventData>> {
    const enriched = this.enrich(data);
    return this.analyticsQueue.add('track-campaign-view', enriched, {
      ...this.analyticsJobOptions(),
      priority: 2,
    });
  }

  async trackDonationCompleted(data: AnalyticsEventData): Promise<Job<AnalyticsEventData>> {
    const enriched = this.enrich(data);
    return this.analyticsQueue.add('track-donation-completed', enriched, {
      ...this.analyticsJobOptions(),
      priority: 5,
    });
  }

  // ─── Queue stats ─────────────────────────────────────────────────────────────

  async getQueueStats() {
    const [email, contractEvents, analytics, dlq] = await Promise.all([
      this.getQueueCounts(this.emailQueue),
      this.getQueueCounts(this.contractEventsQueue),
      this.getQueueCounts(this.analyticsQueue),
      this.dlqService.getDlqSummary(),
    ]);

    return {
      queues: { email, contractEvents, analytics },
      deadLetterQueues: dlq,
      metrics: this.metrics.snapshot(),
    };
  }

  // ─── DLQ replay ──────────────────────────────────────────────────────────────

  /**
   * Replay a single job from a DLQ back to its origin queue.
   * @param dlqName  e.g. 'email-queue-dlq'
   * @param jobId    The job id in the DLQ
   */
  async replayDlqJob(
    dlqName: string,
    jobId: string | number,
  ): Promise<{ newJobId: string | number }> {
    this.nestLogger.log(`Replaying DLQ job ${jobId} from ${dlqName}`);
    return this.dlqService.replayJob(dlqName, jobId);
  }

  /**
   * Replay all waiting/failed jobs in a given DLQ.
   * @param dlqName  e.g. 'contract-events-queue-dlq'
   */
  async replayAllDlqJobs(dlqName: string): Promise<{ replayed: number }> {
    this.nestLogger.log(`Replaying all jobs from ${dlqName}`);
    return this.dlqService.replayAll(dlqName);
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  /** Attach correlation context to job payload. */
  private enrich<T extends { _meta?: { correlationId?: string } }>(data: T): T {
    return {
      ...data,
      _meta: {
        ...data._meta,
        correlationId: data._meta?.correlationId ?? correlation.get().correlationId,
      },
    };
  }

  private emailJobOptions() {
    return {
      ...this.config.defaultJobOptions,
      timeout: this.config.queues.email.timeout,
    };
  }

  private contractJobOptions() {
    return {
      ...this.config.defaultJobOptions,
      timeout: this.config.queues.contractEvents.timeout,
    };
  }

  private analyticsJobOptions() {
    return {
      ...this.config.defaultJobOptions,
      timeout: this.config.queues.analytics.timeout,
    };
  }

  private async getQueueCounts(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}
