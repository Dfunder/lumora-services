import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Server as SorobanRpcServer } from '@stellar/stellar-sdk/rpc';
import type { Api } from '@stellar/stellar-sdk/rpc';
import { xdr } from '@stellar/stellar-sdk';
import { QueueService } from '../queues/queue.service';
import { RedisService } from '../redis/redis.service';
import sorobanConfig from '../config/soroban.config';
import { logger } from '../common/logger/logger';
import type { ContractEventData } from '../queues/processors/contract-events.processor';

const CURSOR_KEY = 'contract-event-streamer:cursor';
const LEDGER_KEY = 'contract-event-streamer:last-ledger';

/** Event name → queue dispatch method mapping */
const EVENT_NAME_MAP: Record<
  string,
  ContractEventData['eventType']
> = {
  DonationReceived: 'donation',
  MilestoneReleased: 'milestone_released',
};

@Injectable()
export class ContractEventStreamerService
  implements OnModuleInit, OnModuleDestroy
{
  private rpcServer: SorobanRpcServer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private shutdownRequested = false;

  constructor(
    @Inject(sorobanConfig.KEY)
    private readonly config: ConfigType<typeof sorobanConfig>,
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
  ) {
    this.rpcServer = new SorobanRpcServer(this.config.rpcUrl, {
      allowHttp: this.config.rpcUrl.startsWith('http://'),
    });
  }

  async onModuleInit() {
    await this.startStreaming();
  }

  async onModuleDestroy() {
    await this.stopStreaming();
  }

  // ── public control ────────────────────────────────────────────────

  async startStreaming() {
    if (this.timer) return;

    const contractIds = this.config.contractIds;
    if (contractIds.length === 0) {
      logger.warn('contract-event-streamer.no-contracts', {
        msg: 'STELLARAID_CONTRACT_IDS is empty – streamer will not start',
      });
      return;
    }

    logger.info('contract-event-streamer.starting', {
      rpcUrl: this.config.rpcUrl,
      contractIds,
      pollingIntervalMs: this.config.pollingIntervalMs,
    });

    this.shutdownRequested = false;
    this.poll(); // kick off first poll immediately (non-blocking)
    this.timer = setInterval(
      () => this.poll(),
      this.config.pollingIntervalMs,
    );
  }

  async stopStreaming() {
    this.shutdownRequested = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for any in-flight poll to finish
    while (this.polling) {
      await new Promise((r) => setTimeout(r, 50));
    }
    logger.info('contract-event-streamer.stopped', {
      msg: 'Contract event streamer stopped',
    });
  }

  /** Expose status for health checks / tests */
  async getStatus() {
    const cursor = await this.redisService.get(CURSOR_KEY);
    const lastLedger = await this.redisService.get(LEDGER_KEY);
    return {
      running: this.timer !== null,
      cursor,
      lastLedger: lastLedger ? Number(lastLedger) : null,
      contractIds: this.config.contractIds,
      pollingIntervalMs: this.config.pollingIntervalMs,
    };
  }

  // ── core polling loop ─────────────────────────────────────────────

  private async poll() {
    if (this.polling || this.shutdownRequested) return;
    this.polling = true;

    try {
      await this.pollOnce();
    } catch (err) {
      logger.error('contract-event-streamer.poll-error', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.polling = false;
    }
  }

  /**
   * Single poll iteration.
   * 1. Load cursor (or derive startLedger from latest – offset)
   * 2. Call getEvents with filter
   * 3. Dispatch each event to Bull queue
   * 4. Persist new cursor
   */
  async pollOnce() {
    const cursor = await this.redisService.get(CURSOR_KEY);

    const request = this.buildRequest(cursor);
    const response = await this.rpcServer.getEvents(request);

    if (response.events.length === 0) {
      // No new events – update latest ledger so we can resume sensibly
      await this.redisService.set(LEDGER_KEY, String(response.latestLedger));
      return;
    }

    logger.info('contract-event-streamer.batch', {
      count: response.events.length,
      fromCursor: cursor ?? `ledger:${request.startLedger ?? '?'}`,
      latestLedger: response.latestLedger,
    });

    for (const event of response.events) {
      await this.dispatchEvent(event);
    }

    // Persist cursor and ledger for restart-safe resumption
    await Promise.all([
      this.redisService.set(CURSOR_KEY, response.cursor),
      this.redisService.set(LEDGER_KEY, String(response.latestLedger)),
    ]);
  }

  // ── request building ──────────────────────────────────────────────

  private async buildRequest(
    cursor: string | null,
  ): Promise<Api.GetEventsRequest> {
    const contractFilter: Api.EventFilter = {
      type: 'contract',
      contractIds: this.config.contractIds,
    };

    if (cursor) {
      return {
        filters: [contractFilter],
        cursor,
        limit: 100,
      };
    }

    // First start: begin from (latestLedger - offset) so we catch up
    // without re-processing the entire chain history.
    const startLedger = await this.resolveStartLedger();
    return {
      filters: [contractFilter],
      startLedger,
      limit: 100,
    };
  }

  /**
   * Resolve the startLedger when no cursor exists.
   * Queries the latest ledger from the RPC and applies the configured offset.
   */
  private async resolveStartLedger(): Promise<number> {
    try {
      const latest = await this.rpcServer.getLatestLedger();
      const start = Math.max(
        1,
        latest.sequence - this.config.startLedgerOffset,
      );
      logger.info('contract-event-streamer.start-ledger', {
        latestSequence: latest.sequence,
        startLedger: start,
        offset: this.config.startLedgerOffset,
      });
      return start;
    } catch (err) {
      logger.error('contract-event-streamer.get-latest-ledger-failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback: start from 1 (will catch up eventually, but slow)
      return 1;
    }
  }

  // ── event dispatch ────────────────────────────────────────────────

  private async dispatchEvent(event: Api.EventResponse) {
    const eventType = this.resolveEventType(event);
    if (!eventType) {
      logger.debug('contract-event-streamer.unhandled-event', {
        id: event.id,
        topics: event.topic.map((t) => t.toXDR().toString('base64')),
      });
      return;
    }

    const contractAddress = event.contractId?.address() ?? '';

    const eventData: ContractEventData = {
      eventType,
      transactionHash: event.txHash,
      blockNumber: event.ledger,
      contractAddress,
      eventData: {
        id: event.id,
        type: event.type,
        ledgerClosedAt: event.ledgerClosedAt,
        transactionIndex: event.transactionIndex,
        operationIndex: event.operationIndex,
        inSuccessfulContractCall: event.inSuccessfulContractCall,
        topics: event.topic.map((t) => t.toXDR().toString('base64')),
        value: event.value.toXDR().toString('base64'),
      },
    };

    try {
      switch (eventType) {
        case 'donation':
          await this.queueService.processDonationEvent(eventData);
          break;
        case 'milestone_released':
          await this.queueService.processMilestoneReleasedEvent(eventData);
          break;
        default:
          logger.warn('contract-event-streamer.unmapped-event-type', {
            eventType,
            txHash: event.txHash,
          });
      }

      logger.info('contract-event-streamer.event-dispatched', {
        eventType,
        txHash: event.txHash,
        ledger: event.ledger,
      });
    } catch (err) {
      logger.error('contract-event-streamer.dispatch-failed', {
        eventType,
        txHash: event.txHash,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Resolve the first topic (event name) from a Soroban contract event.
   * Returns the mapped queue event type or undefined if unrecognised.
   */
  private resolveEventType(
    event: Api.EventResponse,
  ): ContractEventData['eventType'] | undefined {
    const firstTopic = event.topic[0];
    if (!firstTopic) return undefined;

    const switchTag = firstTopic.switch().name;
    if (switchTag !== 'scvSymbol') return undefined;

    const eventName = firstTopic.sym().toString();
    return EVENT_NAME_MAP[eventName];
  }
}
