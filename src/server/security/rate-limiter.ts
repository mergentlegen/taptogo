export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitState = {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the next attempt is allowed (0 when allowed). */
  retryAfterMs: number;
};

/**
 * Sliding-window rate limiter. The in-memory version works for a single
 * server process; swap for Redis/Upstash when running several instances.
 */
export interface RateLimiter {
  /** Reads the state without counting an attempt. */
  check(key: string, rule: RateLimitRule): Promise<RateLimitState>;
  /** Counts an attempt and returns the state after it. */
  hit(key: string, rule: RateLimitRule): Promise<RateLimitState>;
  reset(key: string): Promise<void>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitState> {
    return this.state(this.recent(key, rule), rule);
  }

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitState> {
    const recent = this.recent(key, rule);
    recent.push(this.clock().getTime());
    this.attempts.set(key, recent);
    this.sweep(rule);
    return this.state(recent, rule);
  }

  async reset(key: string): Promise<void> {
    this.attempts.delete(key);
  }

  private recent(key: string, rule: RateLimitRule): number[] {
    const since = this.clock().getTime() - rule.windowMs;
    return (this.attempts.get(key) ?? []).filter((t) => t > since);
  }

  private state(recent: number[], rule: RateLimitRule): RateLimitState {
    const count = recent.length;
    const oldest = recent[0];
    const allowed = count < rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - count),
      retryAfterMs:
        allowed || oldest === undefined ? 0 : Math.max(0, oldest + rule.windowMs - this.clock().getTime()),
    };
  }

  /** Keeps memory bounded: drops keys whose attempts have all expired. */
  private sweep(rule: RateLimitRule) {
    if (this.attempts.size < 10_000) return;
    const since = this.clock().getTime() - rule.windowMs;
    for (const [key, times] of this.attempts) {
      if (times.every((t) => t <= since)) this.attempts.delete(key);
    }
  }
}
