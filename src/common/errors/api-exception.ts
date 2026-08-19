import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class ApiException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    message: string,
    statusCode: HttpStatus,
    details?: any,
  ) {
    super(
      {
        errorCode,
        message,
        details,
      },
      statusCode,
    );
  }
}
