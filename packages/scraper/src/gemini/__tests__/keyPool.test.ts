import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('creates slots for each key × model combination', () => {
    const pool = new KeyPool(['key1', 'key2'], ['modelA', 'modelB']);
    // 2 keys × 2 models = 4 free slots
    expect(pool.getFreeSlots()).toHaveLength(4);
  });

  it('getFreeSlots returns all slots initially', () => {
    const pool = new KeyPool(['key1']);
    // Default 2 models
    expect(pool.getFreeSlots()).toHaveLength(2);
  });

  it('markInFlight removes slot from free list', () => {
    const pool = new KeyPool(['key1'], ['modelA']);
    const slots = pool.getFreeSlots();
    pool.markInFlight(slots[0].slotIndex);
    expect(pool.getFreeSlots()).toHaveLength(0);
  });

  it('markFree makes slot available again', () => {
    const pool = new KeyPool(['key1'], ['modelA']);
    const slots = pool.getFreeSlots();
    pool.markInFlight(slots[0].slotIndex);
    expect(pool.getFreeSlots()).toHaveLength(0);
    pool.markFree(slots[0].slotIndex);
    expect(pool.getFreeSlots()).toHaveLength(1);
  });

  it('markRateLimited puts slot in waiting state', () => {
    const pool = new KeyPool(['key1'], ['modelA', 'modelB']);
    const slots = pool.getFreeSlots();
    // Rate-limit modelA slot
    pool.markRateLimited(slots[0].slotIndex);
    // modelB slot still free
    const free = pool.getFreeSlots();
    expect(free).toHaveLength(1);
    expect(free[0].model).toBe('modelB');
  });

  it('disableKey removes all slots for that key', () => {
    const pool = new KeyPool(['key1', 'key2'], ['modelA', 'modelB']);
    pool.disableKey('key1');
    // Only key2's 2 slots remain
    expect(pool.getFreeSlots()).toHaveLength(2);
    expect(pool.totalActiveKeys()).toBe(1);
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv();
    expect(pool.getFreeSlots().length).toBeGreaterThan(0);
    delete process.env.gemini_api_key1;
    delete process.env.gemini_api_key2;
  });

  it('hasInFlight and hasWaiting track correctly', () => {
    const pool = new KeyPool(['key1'], ['modelA']);
    expect(pool.hasInFlight()).toBe(false);
    expect(pool.hasWaiting()).toBe(false);

    const slots = pool.getFreeSlots();
    pool.markInFlight(slots[0].slotIndex);
    expect(pool.hasInFlight()).toBe(true);

    pool.markRateLimited(slots[0].slotIndex);
    expect(pool.hasInFlight()).toBe(false);
    expect(pool.hasWaiting()).toBe(true);
  });
});
