import { registerAs } from '@nestjs/config';

export default registerAs('soroban', () => ({
  rpcUrl:
    process.env.SOROBAN_RPC_URL || 'https://soroban-rpc.stellar.org',
  contractIds: (process.env.STELLARAID_CONTRACT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  pollingIntervalMs: parseInt(
    process.env.CONTRACT_EVENT_POLLING_INTERVAL_MS || '5000',
    10,
  ),
  startLedgerOffset: parseInt(
    process.env.CONTRACT_EVENT_START_LEDGER_OFFSET || '100',
    10,
  ),
}));
