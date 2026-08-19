import { AsyncLocalStorage } from 'async_hooks';

type Context = { correlationId?: string; userId?: string; walletAddress?: string };

const als = new AsyncLocalStorage<Context>();

export const CORRELATION_HEADER = 'x-correlation-id';

export const correlation = {
  run: <T>(ctx: Context, fn: () => T) => als.run(ctx, fn),
  get: (): Context => als.getStore() ?? {},
  set: (key: keyof Context, value: string) => {
    const store = als.getStore();
    if (store) (store as any)[key] = value;
  },
};

export default correlation;
