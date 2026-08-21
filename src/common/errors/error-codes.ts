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
  DONATION_002 = 'Failed to verify transaction after multiple attempts',
  DONATION_003 = 'Transaction was not successful on-chain',
  DONATION_004 = 'No operations found in transaction',
  DONATION_005 = 'No valid payment operation to campaign contract found in transaction',
  DONATION_006 = 'Asset is not accepted for donations',

  // User Errors
  USER_001 = 'User not found',

  // Validation Errors
  VALIDATION_001 = 'Validation failed',

  // Contract Errors
  CONTRACT_001 = 'Contract invocation failed',
  CONTRACT_002 = 'Contract not found',
  CONTRACT_003 = 'Contract panic error',
  CONTRACT_004 = 'Contract deployment failed',

  // General Errors
  UNKNOWN_ERROR = 'An unknown error occurred',
}