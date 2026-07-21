import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

export interface ContractEventData {
  eventType: 'donation' | 'campaign_created' | 'campaign_funded' | 'withdrawal';
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  eventData: Record<string, any>;
}

@Processor('contract-events-queue')
export class ContractEventsProcessor {
  private readonly logger = new Logger(ContractEventsProcessor.name);

  @Process('process-donation')
  async handleDonationEvent(job: Job<ContractEventData>) {
    this.logger.log(
      `Processing donation event ${job.id} - TX: ${job.data.transactionHash}`,
    );

    try {
      // Future implementation: Process donation, update database, trigger notifications
      this.logger.log(`Donation event processed: ${job.data.transactionHash}`);
      this.logger.debug('Event data:', job.data.eventData);

      return { success: true, processed: true };
    } catch (error) {
      this.logger.error(
        `Failed to process donation event ${job.data.transactionHash}`,
        error,
      );
      throw error;
    }
  }

  @Process('process-campaign-created')
  async handleCampaignCreated(job: Job<ContractEventData>) {
    this.logger.log(`Processing campaign created event ${job.id}`);

    try {
      // Future implementation: Index new campaign, send notifications
      this.logger.log(
        `Campaign created event processed: ${job.data.transactionHash}`,
      );

      return { success: true, processed: true };
    } catch (error) {
      this.logger.error(
        `Failed to process campaign created event ${job.data.transactionHash}`,
        error,
      );
      throw error;
    }
  }

  @Process('process-campaign-funded')
  async handleCampaignFunded(job: Job<ContractEventData>) {
    this.logger.log(`Processing campaign funded event ${job.id}`);

    try {
      // Future implementation: Update campaign status, send notifications to creator
      this.logger.log(
        `Campaign funded event processed: ${job.data.transactionHash}`,
      );

      return { success: true, processed: true };
    } catch (error) {
      this.logger.error(
        `Failed to process campaign funded event ${job.data.transactionHash}`,
        error,
      );
      throw error;
    }
  }

  @Process('process-withdrawal')
  async handleWithdrawal(job: Job<ContractEventData>) {
    this.logger.log(`Processing withdrawal event ${job.id}`);

    try {
      // Future implementation: Process withdrawal, update balances
      this.logger.log(
        `Withdrawal event processed: ${job.data.transactionHash}`,
      );

      return { success: true, processed: true };
    } catch (error) {
      this.logger.error(
        `Failed to process withdrawal event ${job.data.transactionHash}`,
        error,
      );
      throw error;
    }
  }
}
