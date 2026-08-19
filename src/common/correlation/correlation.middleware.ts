import { Request, Response, NextFunction } from 'express';
import { CORRELATION_HEADER, correlation } from './correlation.service';
import { logger } from '../logger/logger';
import * as crypto from 'crypto';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = (req.headers[CORRELATION_HEADER] as string) || '';
  const correlationId = incoming || crypto.randomUUID();

  const ctx = {
    correlationId,
    userId: (req as any).user?.id,
    walletAddress: (req as any).user?.walletAddress,
  };

  correlation.run(ctx, () => {
    res.setHeader(CORRELATION_HEADER, correlationId);
    const start = Date.now();
    logger.info('request.start', {
      correlationId,
      method: req.method,
      path: req.originalUrl || req.url,
      userId: ctx.userId,
      walletAddress: ctx.walletAddress,
    });

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('request.end', {
        correlationId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration,
        userId: ctx.userId,
        walletAddress: ctx.walletAddress,
      });
    });

    next();
  });
}

export default correlationMiddleware;
