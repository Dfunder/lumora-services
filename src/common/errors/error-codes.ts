export enum ErrorCode {
  // Authentication Errors
  AUTH_001 = 'Invalid credentials',
  AUTH_002 = 'Unauthorized',
  AUTH_003 = 'Token expired',
  AUTH_004 = 'Invalid token',

  // Campaign Errors
  CAMPAIGN_001 = 'Campaign not found',
  CAMPAIGN_002 = 'Invalid campaign status',

  // Donation Errors
  DONATION_001 = 'Donation failed',

  // User Errors
  USER_001 = 'User not found',

  // Validation Errors
  VALIDATION_001 = 'Validation failed',

  // General Errors
  UNKNOWN_ERROR = 'An unknown error occurred',
}
