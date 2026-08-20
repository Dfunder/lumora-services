import { Test, TestingModule } from '@nestjs/testing';
import { ConfigType } from '@nestjs/config';
import { ContractEventStreamerService } from './contract-event-streamer.service';
import sorobanConfig from '../config/soroban.config';
import { QueueService } from '../queues/queue.service';
import { RedisService } from '../redis/redis.service';

// ── mock external modules that may not be installed in CI ──────────

jest.mock('../common/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── mock the Soroban RPC Server ───────────────────────────────────

const mockGetEvents = jest.fn();
const mockGetLatestLedger = jest.fn();

jest.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: jest.fn().mockImplementation(() => ({
    getEvents: mockGetEvents,
    getLatestLedger: mockGetLatestLedger,
  })),
}));

jest.mock('@stellar/stellar-sdk', () => ({
  xdr: {
    ScVal: {
      scvSymbol: jest.fn(),
    },
  },
}));

// ── helpers ───────────────────────────────────────────────────────

function makeScvSymbol(name: string) {
  const buf = Buffer.from(name);
  return {
    switch: () => ({ name: 'scvSymbol' as const }),
    sym: () => buf,
    toXDR: () => buf,
  } as any;
}

function makeEvent(overrides: {
  id?: string;
  txHash?: string;
  ledger?: number;
  topic?: any[];
  contractAddress?: string;
} = {}) {
  const contractId = overrides.contractAddress
    ? { address: () => overrides.contractAddress }
    : undefined;

  return {
    id: overrides.id ?? 'evt-1',
    type: 'contract' as const,
    ledger: overrides.ledger ?? 1000,
    ledgerClosedAt: '2026-08-20T00:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: overrides.txHash ?? 'tx-hash-abc',
    contractId,
    topic: overrides.topic ?? [makeScvSymbol('DonationReceived')],
    value: {
      toXDR: () => Buffer.from('value-xdr'),
    } as any,
  };
}

function makeGetEventsResponse(
  events: any[] = [],
  cursor = 'cursor-42',
  latestLedger = 1100,
) {
  return {
    events,
    cursor,
    latestLedger,
    oldestLedger: 900,
    latestLedgerCloseTime: '2026-08-20T00:01:00Z',
    oldestLedgerCloseTime: '2026-08-19T00:00:00Z',
  } as any;
}

/**
 * Flush all pending microtasks and macrotasks.
 * With fake timers, setImmediate doesn't fire, so we advance timers by 0
 * which triggers jest's internal microtask flushing.
 */
async function flushPromises() {
  await jest.advanceTimersByTimeAsync(0);
}

// ── test suite ────────────────────────────────────────────────────

describe('ContractEventStreamerService', () => {
  let service: ContractEventStreamerService;
  let redisService: { get: jest.Mock; set: jest.Mock };
  let queueService: {
    processDonationEvent: jest.Mock;
    processMilestoneReleasedEvent: jest.Mock;
  };

  const baseConfig: ConfigType<typeof sorobanConfig> = {
    rpcUrl: 'https://soroban-rpc.stellar.org',
    contractIds: ['CContract1111', 'CContract2222'],
    pollingIntervalMs: 5000,
    startLedgerOffset: 100,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    redisService = { get: jest.fn(), set: jest.fn() };
    queueService = {
      processDonationEvent: jest.fn().mockResolvedValue({ id: 'job-1' }),
      processMilestoneReleasedEvent: jest
        .fn()
        .mockResolvedValue({ id: 'job-2' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractEventStreamerService,
        { provide: sorobanConfig.KEY, useValue: baseConfig },
        { provide: QueueService, useValue: queueService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get(ContractEventStreamerService);
  });

  afterEach(async () => {
    await service.stopStreaming();
    jest.useRealTimers();
  });

  // ── lifecycle ──────────────────────────────────────────────────

  describe('onModuleInit / startStreaming', () => {
    it('does not start when contractIds is empty', async () => {
      const module = await Test.createTestingModule({
        providers: [
          ContractEventStreamerService,
          {
            provide: sorobanConfig.KEY,
            useValue: { ...baseConfig, contractIds: [] },
          },
          { provide: QueueService, useValue: queueService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();

      const svc = module.get(ContractEventStreamerService);
      await svc.onModuleInit();

      expect(mockGetEvents).not.toHaveBeenCalled();
    });

    it('kicks off an immediate poll when contractIds are present', async () => {
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockResolvedValue({ sequence: 1050 });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([]));

      await service.startStreaming();

      expect(mockGetEvents).toHaveBeenCalledTimes(1);
      expect(mockGetLatestLedger).toHaveBeenCalledTimes(1);
    });
  });

  // ── cursor resume ──────────────────────────────────────────────

  describe('cursor-based restart', () => {
    it('resumes from persisted cursor when one exists in Redis', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === 'contract-event-streamer:cursor')
          return 'saved-cursor-abc';
        if (key === 'contract-event-streamer:last-ledger') return '999';
        return null;
      });
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse([], 'next-cursor'),
      );

      await service.startStreaming();
      await flushPromises();

      expect(mockGetEvents).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'saved-cursor-abc' }),
      );
      expect(mockGetLatestLedger).not.toHaveBeenCalled();
    });

    it('starts from latest ledger minus offset when no cursor exists', async () => {
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockResolvedValue({ sequence: 1050 });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([]));

      await service.startStreaming();
      await flushPromises();

      expect(mockGetLatestLedger).toHaveBeenCalledTimes(1);
      expect(mockGetEvents).toHaveBeenCalledWith(
        expect.objectContaining({ startLedger: 950 }),
      );
    });

    it('persists cursor and ledger after each poll with events', async () => {
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockResolvedValue({ sequence: 1050 });
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse([makeEvent()], 'new-cursor-99', 1100),
      );

      await service.startStreaming();
      await flushPromises();

      expect(redisService.set).toHaveBeenCalledWith(
        'contract-event-streamer:cursor',
        'new-cursor-99',
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'contract-event-streamer:last-ledger',
        '1100',
      );
    });

    it('updates last-ledger even when no events returned', async () => {
      redisService.get.mockResolvedValue('existing-cursor');
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse([], 'same-cursor', 1200),
      );

      await service.startStreaming();
      await flushPromises();

      expect(redisService.set).toHaveBeenCalledWith(
        'contract-event-streamer:last-ledger',
        '1200',
      );
      expect(redisService.set).not.toHaveBeenCalledWith(
        'contract-event-streamer:cursor',
        expect.anything(),
      );
    });
  });

  // ── event dispatch ─────────────────────────────────────────────

  describe('event dispatch', () => {
    it('dispatches DonationReceived events to processDonationEvent', async () => {
      redisService.get.mockResolvedValue('cursor-1');
      const evt = makeEvent({
        txHash: 'tx-donation-001',
        ledger: 1500,
        contractAddress: 'CContract1111',
        topic: [makeScvSymbol('DonationReceived')],
      });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([evt]));

      await service.startStreaming();
      await flushPromises();

      expect(queueService.processDonationEvent).toHaveBeenCalledTimes(1);
      expect(queueService.processDonationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'donation',
          transactionHash: 'tx-donation-001',
          blockNumber: 1500,
          contractAddress: 'CContract1111',
        }),
      );
    });

    it('dispatches MilestoneReleased events to processMilestoneReleasedEvent', async () => {
      redisService.get.mockResolvedValue('cursor-2');
      const evt = makeEvent({
        txHash: 'tx-milestone-001',
        ledger: 1600,
        topic: [makeScvSymbol('MilestoneReleased')],
      });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([evt]));

      await service.startStreaming();
      await flushPromises();

      expect(
        queueService.processMilestoneReleasedEvent,
      ).toHaveBeenCalledTimes(1);
      expect(
        queueService.processMilestoneReleasedEvent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'milestone_released',
          transactionHash: 'tx-milestone-001',
          blockNumber: 1600,
        }),
      );
    });

    it('skips events with unrecognised topic names', async () => {
      redisService.get.mockResolvedValue('cursor-3');
      const evt = makeEvent({
        topic: [makeScvSymbol('UnknownEvent')],
      });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([evt]));

      await service.startStreaming();
      await flushPromises();

      expect(queueService.processDonationEvent).not.toHaveBeenCalled();
      expect(
        queueService.processMilestoneReleasedEvent,
      ).not.toHaveBeenCalled();
    });

    it('handles multiple events in a single batch', async () => {
      redisService.get.mockResolvedValue('cursor-4');
      const donationEvt = makeEvent({
        id: 'evt-d',
        txHash: 'tx-d',
        topic: [makeScvSymbol('DonationReceived')],
      });
      const milestoneEvt = makeEvent({
        id: 'evt-m',
        txHash: 'tx-m',
        topic: [makeScvSymbol('MilestoneReleased')],
      });
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse([donationEvt, milestoneEvt]),
      );

      await service.startStreaming();
      await flushPromises();

      expect(queueService.processDonationEvent).toHaveBeenCalledTimes(1);
      expect(
        queueService.processMilestoneReleasedEvent,
      ).toHaveBeenCalledTimes(1);
    });
  });

  // ── restart simulation ─────────────────────────────────────────

  describe('restart-safe cursor (acceptance test)', () => {
    it('simulates a mid-stream restart and confirms no events are lost', async () => {
      // ── First session: process some events ──
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockResolvedValue({ sequence: 2000 });

      const batch1 = [
        makeEvent({
          id: 'evt-1',
          txHash: 'tx-1',
          ledger: 1901,
          topic: [makeScvSymbol('DonationReceived')],
        }),
        makeEvent({
          id: 'evt-2',
          txHash: 'tx-2',
          ledger: 1902,
          topic: [makeScvSymbol('MilestoneReleased')],
        }),
      ];
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse(batch1, 'cursor-after-batch1', 1950),
      );

      await service.startStreaming();
      await flushPromises();

      expect(queueService.processDonationEvent).toHaveBeenCalledTimes(1);
      expect(
        queueService.processMilestoneReleasedEvent,
      ).toHaveBeenCalledTimes(1);

      // Verify cursor was persisted
      expect(redisService.set).toHaveBeenCalledWith(
        'contract-event-streamer:cursor',
        'cursor-after-batch1',
      );

      // ── Simulate restart: stop the streamer ──
      await service.stopStreaming();
      jest.clearAllMocks();

      // ── Second session: should resume from persisted cursor ──
      const newModule = await Test.createTestingModule({
        providers: [
          ContractEventStreamerService,
          { provide: sorobanConfig.KEY, useValue: baseConfig },
          { provide: QueueService, useValue: queueService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();

      const newService = newModule.get(ContractEventStreamerService);

      // Redis still has the saved cursor
      redisService.get.mockImplementation(async (key: string) => {
        if (key === 'contract-event-streamer:cursor')
          return 'cursor-after-batch1';
        if (key === 'contract-event-streamer:last-ledger') return '1950';
        return null;
      });

      // New events since last cursor
      const batch2 = [
        makeEvent({
          id: 'evt-3',
          txHash: 'tx-3',
          ledger: 1951,
          topic: [makeScvSymbol('DonationReceived')],
        }),
      ];
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse(batch2, 'cursor-after-batch2', 2000),
      );

      await newService.startStreaming();
      await flushPromises();

      // Should have resumed from the persisted cursor
      expect(mockGetEvents).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-after-batch1' }),
      );
      expect(mockGetLatestLedger).not.toHaveBeenCalled();

      // The new event should have been dispatched
      expect(queueService.processDonationEvent).toHaveBeenCalledTimes(1);
      expect(queueService.processDonationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'donation',
          transactionHash: 'tx-3',
          blockNumber: 1951,
        }),
      );

      await newService.stopStreaming();
    });
  });

  // ── error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('does not crash on RPC errors during poll', async () => {
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockRejectedValue(new Error('network timeout'));

      await expect(service.startStreaming()).resolves.not.toThrow();
      await flushPromises();

      const status = await service.getStatus();
      expect(status.running).toBe(true);
    });

    it('does not crash when getEvents fails', async () => {
      redisService.get.mockResolvedValue('cursor-x');
      mockGetEvents.mockRejectedValue(new Error('RPC unavailable'));

      await service.startStreaming();
      await flushPromises();

      const status = await service.getStatus();
      expect(status.running).toBe(true);
    });

    it('does not crash when queue dispatch fails', async () => {
      redisService.get.mockResolvedValue('cursor-y');
      queueService.processDonationEvent.mockRejectedValue(
        new Error('queue full'),
      );
      mockGetEvents.mockResolvedValue(
        makeGetEventsResponse([
          makeEvent({ topic: [makeScvSymbol('DonationReceived')] }),
        ]),
      );

      await service.startStreaming();
      await flushPromises();

      expect(redisService.set).toHaveBeenCalledWith(
        'contract-event-streamer:cursor',
        expect.any(String),
      );
    });
  });

  // ── polling interval ───────────────────────────────────────────

  describe('polling interval', () => {
    it('polls repeatedly at the configured interval', async () => {
      redisService.get.mockResolvedValue('cursor-z');
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([]));

      await service.startStreaming();

      expect(mockGetEvents).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(5000);
      expect(mockGetEvents).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(5000);
      expect(mockGetEvents).toHaveBeenCalledTimes(3);
    });

    it('stops polling after stopStreaming', async () => {
      redisService.get.mockResolvedValue('cursor-z');
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([]));

      await service.startStreaming();
      expect(mockGetEvents).toHaveBeenCalledTimes(1);

      await service.stopStreaming();

      await jest.advanceTimersByTimeAsync(15000);
      expect(mockGetEvents).toHaveBeenCalledTimes(1);
    });
  });

  // ── getStatus ──────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns current status with cursor and ledger info', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === 'contract-event-streamer:cursor') return 'cursor-abc';
        if (key === 'contract-event-streamer:last-ledger') return '1234';
        return null;
      });

      const status = await service.getStatus();

      expect(status).toEqual({
        running: false,
        cursor: 'cursor-abc',
        lastLedger: 1234,
        contractIds: baseConfig.contractIds,
        pollingIntervalMs: baseConfig.pollingIntervalMs,
      });
    });

    it('reports running: true when streaming is active', async () => {
      redisService.get.mockResolvedValue(null);
      mockGetLatestLedger.mockResolvedValue({ sequence: 100 });
      mockGetEvents.mockResolvedValue(makeGetEventsResponse([]));

      await service.startStreaming();

      const status = await service.getStatus();
      expect(status.running).toBe(true);
    });
  });
});
