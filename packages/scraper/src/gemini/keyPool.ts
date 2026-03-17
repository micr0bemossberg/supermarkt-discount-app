import type { KeyState } from './types';

/**
 * Simple key pool — no artificial intervals.
 *
 * Keys are either: available, on cooldown (from 429), or disabled (auth error).
 * The dispatcher grabs any available key. If all are on cooldown,
 * it waits until the earliest one frees up.
 */
export class KeyPool {
  private keys: (KeyState & { disabled: boolean })[];

  constructor(apiKeys: string[]) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.keys = apiKeys.map((key) => ({
      key,
      cooldownUntil: 0,
      disabled: false,
    }));
  }

  static fromEnv(): KeyPool {
    const keys: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const key = process.env[`gemini_api_key${i}`];
      if (key) keys.push(key);
      else break;
    }
    if (keys.length === 0) {
      throw new Error(
        'No Gemini API keys found. Set gemini_api_key1, gemini_api_key2, ... in .env'
      );
    }
    return new KeyPool(keys);
  }

  /**
   * Get a key that's available right now, or wait time until one is.
   */
  acquireKey(): { key: string } | { waitMs: number } {
    const now = Date.now();
    let earliestAvailable = Infinity;

    for (const k of this.keys) {
      if (k.disabled) continue;
      if (k.cooldownUntil <= now) {
        return { key: k.key };
      }
      earliestAvailable = Math.min(earliestAvailable, k.cooldownUntil - now);
    }

    return { waitMs: earliestAvailable === Infinity ? 10000 : earliestAvailable };
  }

  /** Wait until a key is free, then return it. */
  async waitForKey(): Promise<string> {
    while (true) {
      const result = this.acquireKey();
      if ('key' in result) return result.key;
      await new Promise((r) => setTimeout(r, result.waitMs));
    }
  }

  /** Cooldown from rate limit — uses Google's retry delay if available */
  cooldownKey(key: string, durationMs: number): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) k.cooldownUntil = Date.now() + durationMs;
  }

  /** Permanently disable (auth failure) */
  disableKey(key: string): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) k.disabled = true;
  }

  availableCount(): number {
    const now = Date.now();
    return this.keys.filter((k) => !k.disabled && k.cooldownUntil <= now).length;
  }

  totalActiveKeys(): number {
    return this.keys.filter((k) => !k.disabled).length;
  }

  // Legacy compat
  getNextKey(): string | null {
    const result = this.acquireKey();
    return 'key' in result ? result.key : null;
  }
}
