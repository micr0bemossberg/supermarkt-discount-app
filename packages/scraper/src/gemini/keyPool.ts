import type { KeyState } from './types';

/**
 * Rate-limited key pool with per-key usage tracking.
 *
 * Each key has:
 * - `cooldownUntil`: hard cooldown from errors (429, auth failure)
 * - `lastUsedAt`: timestamp of last successful dispatch
 *
 * `acquireKey()` returns a key that is both off cooldown AND hasn't been
 * used within the RPM interval. If no key is available, it returns the
 * wait time until the next key frees up.
 */
export class KeyPool {
  private keys: (KeyState & { lastUsedAt: number; disabled: boolean })[];
  private rpmIntervalMs: number; // Min ms between uses of the same key

  constructor(apiKeys: string[], rpmPerKey: number = 15) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.rpmIntervalMs = Math.ceil(60000 / rpmPerKey); // 15 RPM → 4000ms
    this.keys = apiKeys.map((key) => ({
      key,
      cooldownUntil: 0,
      lastUsedAt: 0,
      disabled: false,
    }));
  }

  static fromEnv(rpmPerKey: number = 15): KeyPool {
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
    return new KeyPool(keys, rpmPerKey);
  }

  /**
   * Acquire a key that is ready to use right now.
   * Returns { key } if available, or { waitMs } if all keys are busy.
   */
  acquireKey(): { key: string } | { waitMs: number } {
    const now = Date.now();
    let earliestAvailable = Infinity;

    for (const k of this.keys) {
      if (k.disabled) continue;
      if (k.cooldownUntil > now) {
        earliestAvailable = Math.min(earliestAvailable, k.cooldownUntil - now);
        continue;
      }

      const readyAt = k.lastUsedAt + this.rpmIntervalMs;
      if (readyAt <= now) {
        // Key is available — mark as used and return
        k.lastUsedAt = now;
        return { key: k.key };
      }

      earliestAvailable = Math.min(earliestAvailable, readyAt - now);
    }

    return { waitMs: earliestAvailable === Infinity ? 10000 : earliestAvailable };
  }

  /**
   * Convenience: wait until a key is available, then return it.
   */
  async waitForKey(): Promise<string> {
    while (true) {
      const result = this.acquireKey();
      if ('key' in result) return result.key;
      await new Promise((r) => setTimeout(r, result.waitMs));
    }
  }

  /** Hard cooldown from rate limit error */
  cooldownKey(key: string, durationMs: number): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) k.cooldownUntil = Date.now() + durationMs;
  }

  /** Permanently disable a key (auth failure) */
  disableKey(key: string): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) k.disabled = true;
  }

  /** How many keys are available right now */
  availableCount(): number {
    const now = Date.now();
    return this.keys.filter((k) =>
      !k.disabled && k.cooldownUntil <= now && k.lastUsedAt + this.rpmIntervalMs <= now
    ).length;
  }

  /** Total non-disabled keys */
  totalActiveKeys(): number {
    return this.keys.filter((k) => !k.disabled).length;
  }

  // Legacy compatibility
  getNextKey(): string | null {
    const result = this.acquireKey();
    return 'key' in result ? result.key : null;
  }
}
