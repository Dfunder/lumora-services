export const AUTH_CONSTANTS = {
  REFRESH_TOKEN_PREFIX: 'auth:refresh:',
  SESSION_PREFIX: 'auth:sessions:',
  BLACKLIST_PREFIX: 'auth:token:blacklist:',
  CHALLENGE_PREFIX: 'auth:challenge:',
  CHALLENGE_CONSUMED_PREFIX: 'auth:challenge:consumed:',
  ACCESS_TOKEN_TTL: 15 * 60, // 15 minutes
  REFRESH_TOKEN_TTL: 7 * 24 * 60 * 60, // 7 days
  CHALLENGE_TTL: 300, // 5 minutes
  CHALLENGE_CONSUMED_TTL: 300, // 5 minutes
};
