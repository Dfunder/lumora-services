import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

/**
 * Sets up the Bull Board UI root at /admin/queues.
 *
 * Individual queue adapters are registered via BullBoardModule.forFeature()
 * inside QueueModule so the board automatically reflects all primary queues
 * and their corresponding dead-letter queues.
 *
 * Access the dashboard at: GET /admin/queues
 *
 * Note: only load this module in non-production environments unless you
 * protect the route with authentication middleware.
 */
@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
  ],
  exports: [BullBoardModule],
})
export class BullBoardConfigModule {}
