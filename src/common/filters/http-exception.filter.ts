import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as Sentry from '@sentry/node';
import { JwtService } from '@nestjs/jwt';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);
  private readonly jwtService = new JwtService({});

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let error = 'Internal Server Error';

    // Extract request context
    const route = `${request.method} ${request.url}`;
    let walletAddress: string | null = null;

    // Extract wallet from JWT token if present
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = this.jwtService.decode(token) as any;
        if (payload?.walletAddress) {
          walletAddress = payload.walletAddress;
        }
      } catch {
        // Ignore invalid tokens
      }
    }

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      error = exceptionResponse.error || exception.name;
      message = exceptionResponse.message || exception.message;

      // Capture 500-level errors with context
      if (statusCode >= 500) {
        this.logger.error(
          `HTTP Exception: ${exception.message} at ${route}`,
          exception.stack,
        );
        Sentry.captureException(exception, {
          contexts: {
            request: {
              url: request.url,
              method: request.method,
              route,
            },
            user: {
              wallet_address: walletAddress,
            },
          },
        });
      }
    } else {
      this.logger.error(
        `Unhandled Exception: ${exception.message} at ${route}`,
        exception.stack,
      );
      Sentry.captureException(exception, {
        contexts: {
          request: {
            url: request.url,
            method: request.method,
            route,
          },
          user: {
            wallet_address: walletAddress,
          },
        },
      });
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}