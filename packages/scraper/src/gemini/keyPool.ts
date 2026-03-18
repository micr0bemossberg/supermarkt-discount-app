/**
 * Simplified key dispatcher — no intervals, just cooldowns on 429.
 *
 * Keys are either: in-flight (busy), on cooldown (429), disabled (auth), or free.
 * Dispatcher checks every 100ms for ANY free key and dispatches immediately.
 */
export class KeyPool {
  private keys: {
    key: string;
    inFlight: boolean;
    cooldownUntil: number;
    disabled: boolean;
  }[];

  constructor(apiKeys: string[]) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.keys = apiKeys.map((key) => ({
      key,
      inFlight: false,
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
   * Get a free key instantly, or null if none available.
   */
  acquireKey(): { key: string; keyIndex: number } | null {
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i];
      if (k.disabled || k.inFlight) continue;
      if (k.cooldownUntil > now) continue;
      k.inFlight = true;
      return { key: k.key, keyIndex: i + 1 };
    }
    return null;
  }

  /**
   * Poll every 100ms until a key is free, then return it.
   */
  async waitForKey(): Promise<{ key: string; keyIndex: number }> {
    while (true) {
      const result = this.acquireKey();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Mark key as done — available for next request */
  releaseKey(key: string): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) k.inFlight = false;
  }

  /** 429 → cooldown for the duration Google tells us, then auto-available. Dispatcher polls every 100ms. */
  cooldownKey(key: string, durationMs: number): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) {
      k.cooldownUntil = Date.now() + durationMs;
      k.inFlight = false;
    }
  }

  /** Permanently disable (auth failure) */
  disableKey(key: string): void {
    const k = this.keys.find((s) => s.key === key);
    if (k) {
      k.disabled = true;
      k.inFlight = false;
    }
  }

  availableCount(): number {
    const now = Date.now();
    return this.keys.filter((k) =>
      !k.disabled && !k.inFlight && k.cooldownUntil <= now
    ).length;
  }

  totalActiveKeys(): number {
    return this.keys.filter((k) => !k.disabled).length;
  }

  // Legacy compat
  getNextKey(): string | null {
    const result = this.acquireKey();
    return result ? result.key : null;
  }
}
