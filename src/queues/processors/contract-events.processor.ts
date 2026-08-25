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

export interface ContractEventData {
  eventType:
    | 'donation'
    | 'campaign_created'
    | 'campaign_funded'
    | 'withdrawal'
    | 'milestone_released';
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  eventData: Record<string, any>;
  _meta?: { correlationId?: string };
}

const QUEUE_NAME = 'contract-events-queue';
const JOB_TIMEOUT_MS = 60_000; // 60 s per acceptance criteria

/**
 * Processes all Stellar contract events.
 *
 * Resilience features:
 * - 3 retries with exponential backoff (configured in bull.config.ts).
 * - 60 s per-job timeout enforced via Promise.race.
 * - Circuit breaker for on-chain / database calls.
 * - Exhausted jobs forwarded to contract-events-queue-dlq.
 * - Full progress + timing metrics.
 */
@Processor(QUEUE_NAME)
export class ContractEventsProcessor {
  private readonly logger = new Logger(ContractEventsProcessor.name);

  /** Guards database writes; on-chain reads use a separate circuit. */
  private readonly dbCircuit: CircuitBreaker;
  private readonly chainCircuit: CircuitBreaker;

  constructor(
    private readonly metrics: QueueMetricsService,
    private readonly dlq: DlqService,
  ) {
    this.dbCircuit = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      onStateChange: (from, to) => {
        if (to === 'OPEN') this.metrics.circuitOpen(QUEUE_NAME, 'database');
        else if (to === 'CLOSED') this.metrics.circuitClosed(QUEUE_NAME, 'database');
      },
    });

    this.chainCircuit = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      onStateChange: (from, to) => {
        if (to === 'OPEN') this.metrics.circuitOpen(QUEUE_NAME, 'stellar-rpc');
        else if (to === 'CLOSED') this.metrics.circuitClosed(QUEUE_NAME, 'stellar-rpc');
      },
    });
  }

  // ─── Lifecycle hooks ─────────────────────────────────────────────────────────

  @OnQueueActive()
  onActive(job: Job<ContractEventData>) {
    this.metrics.jobStarted(QUEUE_NAME, job.name, job.id);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<ContractEventData>, result: unknown) {
    this.logger.log(`Job ${job.id} (${job.name}) completed`, { result });
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error('Queue-level error on contract-events-queue', error.stack);
  }

  @OnQueueFailed()
  async onFailed(job: Job<ContractEventData>, error: Error) {
    this.metrics.jobFailed(QUEUE_NAME, job.name, job.id, job.attemptsMade, error);

    this.logger.error(
      `Contract event failed – tx: ${job.data.transactionHash} | attempt ${job.attemptsMade}`,
      error.message,
    );

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await this.dlq.moveToDlq(QUEUE_NAME, job, error);
    }
  }

  // ─── Job handlers ─────────────────────────────────────────────────────────────

  @Process({ name: 'process-donation', concurrency: 3 })
  async handleDonationEvent(job: Job<ContractEventData>) {
    return this.runWithResilience(job, async () => {
      await job.progress(10);

      /**
       * TODO: Implement donation processing:
       * 1. Verify transaction on-chain via chainCircuit
       * 2. Update Donation record status in DB via dbCircuit
       * 3. Update Campaign.raisedAmount
       * 4. Emit notification job to email-queue
       */
      await this.dbCircuit.call(async () => {
        // stub: await this.prisma.donation.update({ where: { transactionHash: job.data.transactionHash }, data: { status: 'COMPLETED' } })
        this.logger.log(
          `[STUB] Processed donation – tx: ${job.data.transactionHash}`,
        );
      });

      await job.progress(100);
      return { success: true, transactionHash: job.data.transactionHash };
    });
  }

  @Process({ name: 'process-campaign-created', concurrency: 3 })
  async handleCampaignCreated(job: Job<ContractEventData>) {
    return this.runWithResilience(job, async () => {
      await job.progress(10);

      /** TODO: Index new campaign from on-chain data, send creator notifications. */
      await this.dbCircuit.call(async () => {
        this.logger.log(
          `[STUB] Processed campaign created – tx: ${job.data.transactionHash}`,
        );
      });

      await job.progress(100);
      return { success: true, transactionHash: job.data.transactionHash };
    });
  }

  @Process({ name: 'process-campaign-funded', concurrency: 3 })
  async handleCampaignFunded(job: Job<ContractEventData>) {
    return this.runWithResilience(job, async () => {
      await job.progress(10);

      /** TODO: Mark campaign as fully funded, unlock milestones, notify creator. */
      await this.dbCircuit.call(async () => {
        this.logger.log(
          `[STUB] Processed campaign funded – tx: ${job.data.transactionHash}`,
        );
      });

      await job.progress(100);
      return { success: true, transactionHash: job.data.transactionHash };
    });
  }

  @Process({ name: 'process-withdrawal', concurrency: 2 })
  async handleWithdrawal(job: Job<ContractEventData>) {
    return this.runWithResilience(job, async () => {
      await job.progress(10);

      /** TODO: Update milestone status to RELEASED, update raised amounts. */
      await this.dbCircuit.call(async () => {
        this.logger.log(
          `[STUB] Processed withdrawal – tx: ${job.data.transactionHash}`,
        );
      });

      await job.progress(100);
      return { success: true, transactionHash: job.data.transactionHash };
    });
  }

  @Process({ name: 'process-milestone-released', concurrency: 2 })
  async handleMilestoneReleased(job: Job<ContractEventData>) {
    return this.runWithResilience(job, async () => {
      await job.progress(10);

      /** TODO: Set milestone status to RELEASED, notify creator and top donors. */
      await this.dbCircuit.call(async () => {
        this.logger.log(
          `[STUB] Processed milestone released – tx: ${job.data.transactionHash}`,
        );
      });

      await job.progress(100);
      return { success: true, transactionHash: job.data.transactionHash };
    });
  }

  // ─── Resilience wrapper ───────────────────────────────────────────────────────

  private async runWithResilience<T>(
    job: Job<ContractEventData>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const correlationId = job.data._meta?.correlationId;
    const startedAt = Date.now();

    return correlation.run({ correlationId }, async () => {
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
            `Circuit OPEN – job ${job.id} (${job.name}) will retry`,
            err.message,
          );
        } else {
          this.logger.error(
            `Job ${job.id} (${job.name}) failed after ${duration}ms | tx: ${job.data.transactionHash}`,
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
