import { registerAs } from '@nestjs/config';

export default registerAs('bull', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  /** Default retry policy applied to all queues unless overridden per-queue. */
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100, // keep more failed jobs so DLQ handler can read them
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1 s → 5 s → 10 s (exponential with jitter applied in processors)
    },
  },

  /** Per-queue settings (timeouts in milliseconds). */
  queues: {
    email: {
      name: 'email-queue',
      timeout: 30_000, // 30 s
      dlqName: 'email-queue-dlq',
    },
    contractEvents: {
      name: 'contract-events-queue',
      timeout: 60_000, // 60 s
      dlqName: 'contract-events-queue-dlq',
    },
    analytics: {
      name: 'analytics-queue',
      timeout: 120_000, // 120 s
      dlqName: 'analytics-queue-dlq',
    },
  },
}));
