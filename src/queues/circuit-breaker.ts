/**
 * Minimal circuit-breaker implementation for queue processors.
 *
 * States:
 *  CLOSED  → calls pass through normally.
 *  OPEN    → calls fail fast without hitting the external service.
 *  HALF_OPEN → one probe call is allowed; success closes the circuit,
 *              failure reopens it.
 *
 * Usage:
 *   const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 });
 *   const result = await cb.call(() => externalServiceCall());
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens. Default: 3 */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN state before probing again. Default: 30 000 */
  resetTimeoutMs?: number;
  /** Optional callback fired when state changes. */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly onStateChange?: CircuitBreakerOptions['onStateChange'];

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 3;
    this.resetTimeout = opts.resetTimeoutMs ?? 30_000;
    this.onStateChange = opts.onStateChange;
  }

  get currentState(): CircuitBreakerState {
    return this.state;
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.transition('HALF_OPEN');
      }
    }
    return this.state === 'OPEN';
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new CircuitOpenError(
        `Circuit is OPEN. Last failure ${Math.round((Date.now() - this.lastFailureTime) / 1000)}s ago.`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state !== 'CLOSED') {
      this.transition('CLOSED');
    }
    this.failureCount = 0;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.threshold) {
      this.transition('OPEN');
    }
  }

  private transition(to: CircuitBreakerState) {
    const from = this.state;
    this.state = to;
    this.onStateChange?.(from, to);
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
