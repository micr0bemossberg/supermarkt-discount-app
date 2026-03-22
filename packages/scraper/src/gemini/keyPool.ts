import { createLogger } from '../utils/logger';

const logger = createLogger('KeyPool');

type SlotStatus = 'free' | 'in_flight' | 'rate_limited';

interface KeySlot {
  key: string;
  model: string;
  status: SlotStatus;
  retryAt: number;
  backoffMs: number;
  consecutiveFails: number;
}

/**
 * Key pool with success cooldown, escalating backoff, and Lite-only model.
 *
 * CHANGES from previous version:
 * 1. SUCCESS COOLDOWN: After a successful request, the slot enters a 4.1s cooldown
 *    (15 RPM = 1 request per 4s per key). This prevents the same key from being
 *    reused immediately, which caused burst 429s.
 * 2. LITE-ONLY by default: Removed gemini-3-flash-preview as default second model.
 *    Flash has only 20 RPD (vs 500 for Lite) — it exhausted quickly and generated
 *    429 noise. Now 1 slot per key instead of 2.
 * 3. Escalating backoff on 429: 15s → 30s → 60s (unchanged).
 *
 * Slot states:
 *   FREE         — ready for a chunk
 *   IN_FLIGHT    — currently processing
 *   RATE_LIMITED — 429'd or in success cooldown, waiting until retryAt
 */
export class KeyPool {
  private slots: KeySlot[];
  private disabledKeys: Set<string>;
  /** Track consecutive fails per KEY (not per slot) — for RPD detection */
  private keyConsecutiveFails: Map<string, number>;

  private static INITIAL_BACKOFF = 15_000;
  private static MAX_BACKOFF = 60_000;
  /** After a successful request, wait 4.1s before reusing the same slot (15 RPM = 1 per 4s) */
  private static SUCCESS_COOLDOWN = 4_100;
  /** If a key fails this many times in a row without any success, assume RPD exhausted and disable */
  private static MAX_CONSECUTIVE_KEY_FAILS = 5;

  constructor(apiKeys: string[], models: string[] = ['gemini-3.1-flash-lite-preview']) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.disabledKeys = new Set();
    this.keyConsecutiveFails = new Map();

    // Create one slot per key × model combination
    this.slots = [];
    for (const key of apiKeys) {
      for (const model of models) {
        this.slots.push({
          key,
          model,
          status: 'free',
          retryAt: 0,
          backoffMs: KeyPool.INITIAL_BACKOFF,
          consecutiveFails: 0,
        });
      }
    }
    logger.info(`Initialized ${apiKeys.length} keys × ${models.length} models = ${this.slots.length} slots`);
  }

  static fromEnv(): KeyPool {
    const keys: string[] = [];
    for (let i = 1; i <= 100; i++) {
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
   * Get all slots that are ready:
   * - FREE slots on non-disabled keys
   * - RATE_LIMITED slots whose backoff/cooldown expired (auto-promoted)
   */
  getFreeSlots(): { key: string; model: string; slotIndex: number }[] {
    const now = Date.now();
    const result: { key: string; model: string; slotIndex: number }[] = [];

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (this.disabledKeys.has(s.key)) continue;
      if (s.status === 'in_flight') continue;

      if (s.status === 'free') {
        result.push({ key: s.key, model: s.model, slotIndex: i });
      } else if (s.status === 'rate_limited' && now >= s.retryAt) {
        s.status = 'free';
        result.push({ key: s.key, model: s.model, slotIndex: i });
      }
    }
    return result;
  }

  /** Mark slot as in-flight */
  markInFlight(slotIndex: number): void {
    this.slots[slotIndex].status = 'in_flight';
  }

  /**
   * Mark slot as succeeded — applies SUCCESS_COOLDOWN (4.1s) before it can be reused.
   * Resets per-key consecutive fail counter (this key is NOT RPD-exhausted).
   */
  markFree(slotIndex: number): void {
    const s = this.slots[slotIndex];
    s.status = 'rate_limited'; // Reuse rate_limited state with short cooldown
    s.retryAt = Date.now() + KeyPool.SUCCESS_COOLDOWN;
    s.backoffMs = KeyPool.INITIAL_BACKOFF;
    s.consecutiveFails = 0;
    this.keyConsecutiveFails.set(s.key, 0); // Reset per-key counter on ANY success
  }

  /**
   * Mark slot as rate-limited (429) — escalating backoff.
   * Also tracks per-key consecutive fails. If a key fails MAX_CONSECUTIVE_KEY_FAILS
   * times in a row without a single success, it's assumed RPD-exhausted and disabled.
   * Returns true if the key was auto-disabled (RPD), false if just rate-limited (WAF).
   */
  markRateLimited(slotIndex: number): boolean {
    const s = this.slots[slotIndex];
    s.consecutiveFails++;
    s.status = 'rate_limited';
    s.retryAt = Date.now() + s.backoffMs;
    const keyIndex = this.getKeyIndex(s.key);

    // Track per-KEY consecutive fails (shared across all model slots for this key)
    const keyFails = (this.keyConsecutiveFails.get(s.key) || 0) + 1;
    this.keyConsecutiveFails.set(s.key, keyFails);

    if (keyFails >= KeyPool.MAX_CONSECUTIVE_KEY_FAILS) {
      // 5+ consecutive fails on this key → likely RPD exhausted, disable it
      logger.warning(`key${keyIndex}: ${keyFails} consecutive fails → RPD exhausted, disabling`);
      this.disableKey(s.key);
      return true; // RPD — caller should NOT punish AIMD concurrency
    }

    logger.info(`key${keyIndex}: 429 → wait ${Math.round(s.backoffMs / 1000)}s (fail #${s.consecutiveFails}, key-fails: ${keyFails})`);
    s.backoffMs = Math.min(s.backoffMs * 2, KeyPool.MAX_BACKOFF);
    return false; // WAF — caller should halve AIMD concurrency
  }

  /** Disable a key entirely (auth error — affects all model slots) */
  disableKey(key: string): void {
    this.disabledKeys.add(key);
    const keyIndex = this.getKeyIndex(key);
    logger.warning(`key${keyIndex} disabled (all models)`);
  }

  private getKeyIndex(key: string): number {
    const uniqueKeys = [...new Set(this.slots.map(s => s.key))];
    return uniqueKeys.indexOf(key) + 1;
  }

  /** Log status of all slots */
  logStatus(): void {
    const now = Date.now();
    const uniqueKeys = [...new Set(this.slots.map(s => s.key))];
    const statuses: string[] = [];

    for (let ki = 0; ki < uniqueKeys.length; ki++) {
      const key = uniqueKeys[ki];
      if (this.disabledKeys.has(key)) {
        statuses.push(`k${ki + 1}:OFF`);
        continue;
      }
      const keySlots = this.slots.filter(s => s.key === key);
      const modelStatuses = keySlots.map(s => {
        if (s.status === 'free') return 'ok';
        if (s.status === 'in_flight') return 'fly';
        const secs = Math.max(0, Math.round((s.retryAt - now) / 1000));
        return `${secs}s`;
      });
      statuses.push(`k${ki + 1}[${modelStatuses.join('|')}]`);
    }

    const freeCount = this.getFreeSlots().length;
    const flyCount = this.slots.filter(s => s.status === 'in_flight' && !this.disabledKeys.has(s.key)).length;
    const waitCount = this.slots.filter(s => s.status === 'rate_limited' && !this.disabledKeys.has(s.key) && s.retryAt > now).length;
    const offCount = this.disabledKeys.size;
    logger.info(`[POLL] ${freeCount} free, ${flyCount} fly, ${waitCount} wait, ${offCount} off | ${statuses.join(' ')}`);
  }

  availableCount(): number {
    return this.getFreeSlots().length;
  }

  totalActiveKeys(): number {
    const uniqueKeys = [...new Set(this.slots.map(s => s.key))];
    return uniqueKeys.filter(k => !this.disabledKeys.has(k)).length;
  }

  hasInFlight(): boolean {
    return this.slots.some(s => s.status === 'in_flight' && !this.disabledKeys.has(s.key));
  }

  /** Count how many slots are currently processing a Gemini call */
  getInFlightCount(): number {
    return this.slots.filter(s => s.status === 'in_flight' && !this.disabledKeys.has(s.key)).length;
  }

  hasWaiting(): boolean {
    return this.slots.some(s => s.status === 'rate_limited' && !this.disabledKeys.has(s.key));
  }

  // Legacy compat
  acquireKey(): { key: string; keyIndex: number } | null {
    const free = this.getFreeSlots();
    if (free.length === 0) return null;
    this.markInFlight(free[0].slotIndex);
    return { key: free[0].key, keyIndex: free[0].slotIndex };
  }

  getNextKey(): string | null {
    const r = this.acquireKey();
    return r ? r.key : null;
  }

  releaseKey(key: string): void {
    const slot = this.slots.find(s => s.key === key && s.status === 'in_flight');
    if (slot) this.markFree(this.slots.indexOf(slot));
  }

  cooldownKey(key: string, _ms: number): void {
    const slot = this.slots.find(s => s.key === key && s.status === 'in_flight');
    if (slot) this.markRateLimited(this.slots.indexOf(slot));
  }
}
