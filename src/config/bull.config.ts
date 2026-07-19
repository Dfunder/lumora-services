import { registerAs } from '@nestjs/config';

export default registerAs('bull', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
  queues: {
    email: 'email-queue',
    contractEvents: 'contract-events-queue',
    analytics: 'analytics-queue',
  },
}));