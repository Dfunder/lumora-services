# Redis and Bull Queue Infrastructure

This document describes the Redis caching and Bull queue infrastructure implemented for Lumora Services.

## Overview

The infrastructure provides:
- **Redis**: Caching and session storage with connection pooling
- **Bull Queues**: Background job processing for emails, contract events, and analytics
- **Bull Board**: Queue monitoring dashboard (development only)
- **Health Checks**: Redis connectivity and queue status monitoring

## Queue Design

### 1. Email Queue (`email-queue`)

Handles all email communications including:

**Jobs:**
- `send-notification`: Generic notification emails
- `send-welcome`: Welcome emails for new users
- `send-campaign-update`: Campaign status updates

**Future Features Using This Queue:**
- User registration confirmations
- Password reset emails
- Donation receipt emails
- Campaign milestone notifications
- Weekly digest emails

### 2. Contract Events Queue (`contract-events-queue`)

Processes blockchain contract events:

**Jobs:**
- `process-donation`: Handle donation events from smart contracts
- `process-campaign-created`: Index new campaigns
- `process-campaign-funded`: Update campaign funding status
- `process-withdrawal`: Process fund withdrawals

**Future Features Using This Queue:**
- Real-time donation notifications
- Campaign funding goal tracking
- Smart contract event indexing
- Blockchain state synchronization
- Transaction confirmations

### 3. Analytics Queue (`analytics-queue`)

Tracks user behavior and application metrics:

**Jobs:**
- `track-page-view`: Page view analytics
- `track-user-action`: User interaction tracking
- `track-campaign-view`: Campaign page analytics
- `track-donation-completed`: Conversion tracking

**Future Features Using This Queue:**
- User engagement metrics
- Campaign performance analytics
- Conversion funnel analysis
- A/B testing data collection
- User behavior insights

## Configuration

### Redis Configuration
```typescript
// Environment variables
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### Queue Configuration
- **Connection pooling**: Automatic reconnection with exponential backoff
- **Job retention**: 50 completed/failed jobs kept for monitoring
- **Retry policy**: 3 attempts with exponential backoff (2s base delay)
- **Priority levels**: Financial events (10), notifications (5-8), analytics (1-3)

## Usage Examples

### Adding Jobs to Queues

```typescript
// Email notifications
await queueService.sendWelcomeEmail({
  to: 'user@example.com',
  subject: 'Welcome to Lumora!',
  template: 'welcome',
  context: { userName: 'John Doe' }
});

// Contract events
await queueService.processDonationEvent({
  eventType: 'donation',
  transactionHash: '0x123...',
  blockNumber: 12345,
  contractAddress: '0xabc...',
  eventData: { amount: '1000000', donor: '0x456...' }
});

// Analytics
await queueService.trackCampaignView({
  eventType: 'campaign_view',
  sessionId: 'sess_123',
  timestamp: new Date(),
  properties: { campaignId: 'camp_456', referrer: 'homepage' }
});
```

### Health Checks

- **Full health**: `GET /health`
- **Redis only**: `GET /health/redis`
- **Queues only**: `GET /health/queues`

### Queue Dashboard (Development)

Access Bull Board at `/admin/queues` when `NODE_ENV !== 'production'`

## Dead Letter Handling

Failed jobs are:
1. Retried 3 times with exponential backoff
2. Moved to failed queue after max retries
3. Kept for 50 jobs for debugging
4. Logged with full error details

## Monitoring

Queue statistics available via:
```typescript
const stats = await queueService.getQueueStats();
// Returns waiting, active, completed, failed, delayed counts for each queue
```

## Dependencies Added

- `ioredis`: Redis client with connection pooling
- `@nestjs/bull`: NestJS Bull integration
- `bull`: Queue processing library
- `@bull-board/express`: Queue monitoring dashboard
- `@bull-board/nestjs`: NestJS Bull Board integration

## Integration Points

This infrastructure is designed to integrate with:
- **User Module**: Welcome emails, password resets
- **Campaign Module**: Campaign notifications, funding updates
- **Donation Module**: Receipt emails, donation processing
- **Contract Module**: Blockchain event processing
- **Analytics Module**: User behavior tracking
- **Notification Module**: Real-time notifications