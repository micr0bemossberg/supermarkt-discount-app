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
 * Key pool with model fallback and escalating backoff.
 *
 * Each API key gets multiple "slots" — one per model.
 * Rate limits are per-project per-model, so if model A is 429'd,
 * model B on the same key may still be available.
 *
 * Slot states:
 *   FREE         — ready for a chunk
 *   IN_FLIGHT    — currently processing
 *   RATE_LIMITED — 429'd, waiting with escalating backoff
 *
 * Keys can also be globally disabled (auth error affects all models).
 */
export class KeyPool {
  private slots: KeySlot[];
  private disabledKeys: Set<string>;

  private static INITIAL_BACKOFF = 15_000;
  private static MAX_BACKOFF = 60_000;

  constructor(apiKeys: string[], models: string[] = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview']) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.disabledKeys = new Set();

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
   * Get all slots that are ready:
   * - FREE slots on non-disabled keys
   * - RATE_LIMITED slots whose backoff expired (auto-promoted)
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

  /** Mark slot as free (success) — resets backoff */
  markFree(slotIndex: number): void {
    const s = this.slots[slotIndex];
    s.status = 'free';
    s.backoffMs = KeyPool.INITIAL_BACKOFF;
    s.consecutiveFails = 0;
  }

  /** Mark slot as rate-limited (429) — escalating backoff */
  markRateLimited(slotIndex: number): void {
    const s = this.slots[slotIndex];
    s.consecutiveFails++;
    s.status = 'rate_limited';
    s.retryAt = Date.now() + s.backoffMs;
    const keyIndex = this.getKeyIndex(s.key);
    logger.info(`key${keyIndex}/${s.model.split('-').slice(1, 3).join('-')}: 429 → wait ${Math.round(s.backoffMs / 1000)}s (fail #${s.consecutiveFails})`);
    s.backoffMs = Math.min(s.backoffMs * 2, KeyPool.MAX_BACKOFF);
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
        const mLabel = s.model.includes('3.1') ? 'L' : 'F'; // Lite vs Flash
        if (s.status === 'free') return `${mLabel}:ok`;
        if (s.status === 'in_flight') return `${mLabel}:fly`;
        const secs = Math.max(0, Math.round((s.retryAt - now) / 1000));
        return `${mLabel}:${secs}s`;
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
