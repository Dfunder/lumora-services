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
import { correlation } from '../correlation/correlation.service';
import { ErrorCode } from '../errors/error-codes';
import { ApiException } from '../errors/api-exception';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = correlation.getCorrelationId();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'INTERNAL_SERVER_ERROR';
    let errorCode = ErrorCode.UNKNOWN_ERROR;
    let details: any;

    if (exception instanceof ApiException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      message = exceptionResponse.message;
      errorCode = exceptionResponse.errorCode;
      error = HttpStatus[statusCode];
      details = exceptionResponse.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      error = exceptionResponse.error || exception.name;
      message = exceptionResponse.message || exception.message;
    }

    const sentryTags = {
      endpoint: `${request.method} ${request.path}`,
      error_type: error,
      status_code: statusCode,
      user_role: (request as any).user?.role,
    };

    const errorResponse = {
      statusCode,
      message,
      error,
      errorCode,
      requestId: correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      details,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `HTTP Exception: ${exception.message}`,
        exception.stack,
        {
          correlationId,
          request: {
            method: request.method,
            url: request.url,
            body: request.body,
          },
          user: (request as any).user,
        },
      );
      Sentry.captureException(exception, {
        tags: sentryTags,
        extra: {
          'Request ID': correlationId,
        },
        user: {
          id: (request as any).user?.id,
        },
      });
    }

    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
      errorResponse.message = 'Internal server error';
      delete errorResponse.details;
    }

    response.status(statusCode).json(errorResponse);
  }
}
