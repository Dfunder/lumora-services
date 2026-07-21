import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { ConfigType } from '@nestjs/config';
import bullConfig from '../config/bull.config';
import type { EmailJobData } from './processors/email.processor';
import type { ContractEventData } from './processors/contract-events.processor';
import type { AnalyticsEventData } from './processors/analytics.processor';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('email-queue')
    private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue('contract-events-queue')
    private readonly contractEventsQueue: Queue<ContractEventData>,
    @InjectQueue('analytics-queue')
    private readonly analyticsQueue: Queue<AnalyticsEventData>,
    @Inject(bullConfig.KEY)
    private readonly config: ConfigType<typeof bullConfig>,
  ) {}

  // Email queue methods
  async sendNotificationEmail(data: EmailJobData, delay?: number) {
    return await this.emailQueue.add('send-notification', data, {
      delay,
      ...this.config.defaultJobOptions,
    });
  }

  async sendWelcomeEmail(data: EmailJobData, delay?: number) {
    return await this.emailQueue.add('send-welcome', data, {
      delay,
      ...this.config.defaultJobOptions,
    });
  }

  async sendCampaignUpdateEmail(data: EmailJobData, delay?: number) {
    return await this.emailQueue.add('send-campaign-update', data, {
      delay,
      ...this.config.defaultJobOptions,
    });
  }

  // Contract events queue methods
  async processDonationEvent(data: ContractEventData) {
    return await this.contractEventsQueue.add('process-donation', data, {
      ...this.config.defaultJobOptions,
      priority: 10, // High priority for financial events
    });
  }

  async processCampaignCreatedEvent(data: ContractEventData) {
    return await this.contractEventsQueue.add(
      'process-campaign-created',
      data,
      {
        ...this.config.defaultJobOptions,
      },
    );
  }

  async processCampaignFundedEvent(data: ContractEventData) {
    return await this.contractEventsQueue.add('process-campaign-funded', data, {
      ...this.config.defaultJobOptions,
      priority: 8, // High priority
    });
  }

  async processWithdrawalEvent(data: ContractEventData) {
    return await this.contractEventsQueue.add('process-withdrawal', data, {
      ...this.config.defaultJobOptions,
      priority: 10, // High priority for financial events
    });
  }

  // Analytics queue methods
  async trackPageView(data: AnalyticsEventData) {
    return await this.analyticsQueue.add('track-page-view', data, {
      ...this.config.defaultJobOptions,
      priority: 1, // Low priority
    });
  }

  async trackUserAction(data: AnalyticsEventData) {
    return await this.analyticsQueue.add('track-user-action', data, {
      ...this.config.defaultJobOptions,
      priority: 3, // Medium priority
    });
  }

  async trackCampaignView(data: AnalyticsEventData) {
    return await this.analyticsQueue.add('track-campaign-view', data, {
      ...this.config.defaultJobOptions,
      priority: 2, // Low-medium priority
    });
  }

  async trackDonationCompleted(data: AnalyticsEventData) {
    return await this.analyticsQueue.add('track-donation-completed', data, {
      ...this.config.defaultJobOptions,
      priority: 5, // Medium-high priority
    });
  }

  // Queue management methods
  async getQueueStats() {
    const [emailStats, contractStats, analyticsStats] = await Promise.all([
      this.getEmailQueueStats(),
      this.getContractEventsQueueStats(),
      this.getAnalyticsQueueStats(),
    ]);

    return {
      email: emailStats,
      contractEvents: contractStats,
      analytics: analyticsStats,
    };
  }

  private async getEmailQueueStats() {
    return {
      waiting: await this.emailQueue.getWaiting().then((jobs) => jobs.length),
      active: await this.emailQueue.getActive().then((jobs) => jobs.length),
      completed: await this.emailQueue
        .getCompleted()
        .then((jobs) => jobs.length),
      failed: await this.emailQueue.getFailed().then((jobs) => jobs.length),
      delayed: await this.emailQueue.getDelayed().then((jobs) => jobs.length),
    };
  }

  private async getContractEventsQueueStats() {
    return {
      waiting: await this.contractEventsQueue
        .getWaiting()
        .then((jobs) => jobs.length),
      active: await this.contractEventsQueue
        .getActive()
        .then((jobs) => jobs.length),
      completed: await this.contractEventsQueue
        .getCompleted()
        .then((jobs) => jobs.length),
      failed: await this.contractEventsQueue
        .getFailed()
        .then((jobs) => jobs.length),
      delayed: await this.contractEventsQueue
        .getDelayed()
        .then((jobs) => jobs.length),
    };
  }

  private async getAnalyticsQueueStats() {
    return {
      waiting: await this.analyticsQueue
        .getWaiting()
        .then((jobs) => jobs.length),
      active: await this.analyticsQueue.getActive().then((jobs) => jobs.length),
      completed: await this.analyticsQueue
        .getCompleted()
        .then((jobs) => jobs.length),
      failed: await this.analyticsQueue.getFailed().then((jobs) => jobs.length),
      delayed: await this.analyticsQueue
        .getDelayed()
        .then((jobs) => jobs.length),
    };
  }
}
