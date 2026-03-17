import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('acquires different keys sequentially', () => {
    // Set RPM very high so interval is ~0ms — no wait between uses
    const pool = new KeyPool(['key1', 'key2', 'key3'], 10000);
    const r1 = pool.acquireKey();
    const r2 = pool.acquireKey();
    const r3 = pool.acquireKey();
    expect('key' in r1 && r1.key).toBe('key1');
    expect('key' in r2 && r2.key).toBe('key2');
    expect('key' in r3 && r3.key).toBe('key3');
  });

  it('returns waitMs when key RPM interval not elapsed', () => {
    // 1 key, 15 RPM = 4000ms interval
    const pool = new KeyPool(['key1'], 15);
    const r1 = pool.acquireKey();
    expect('key' in r1).toBe(true);
    // Immediately try again — should get waitMs
    const r2 = pool.acquireKey();
    expect('waitMs' in r2).toBe(true);
    if ('waitMs' in r2) {
      expect(r2.waitMs).toBeGreaterThan(0);
      expect(r2.waitMs).toBeLessThanOrEqual(4000);
    }
  });

  it('skips keys on cooldown', () => {
    const pool = new KeyPool(['key1', 'key2'], 10000);
    pool.cooldownKey('key1', 5000);
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('key2');
  });

  it('returns waitMs when all keys on cooldown', () => {
    const pool = new KeyPool(['key1'], 10000);
    pool.cooldownKey('key1', 5000);
    const r = pool.acquireKey();
    expect('waitMs' in r).toBe(true);
  });

  it('disableKey permanently removes a key', () => {
    const pool = new KeyPool(['key1', 'key2'], 10000);
    pool.disableKey('key1');
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('key2');
    expect(pool.totalActiveKeys()).toBe(1);
  });

  it('waitForKey resolves with a key', async () => {
    const pool = new KeyPool(['key1'], 10000);
    const key = await pool.waitForKey();
    expect(key).toBe('key1');
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv(10000);
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('testkey1');
    delete process.env.gemini_api_key1;
    delete process.env.gemini_api_key2;
  });

  it('reports available and total counts', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3'], 10000);
    expect(pool.availableCount()).toBe(3);
    expect(pool.totalActiveKeys()).toBe(3);
    pool.disableKey('key1');
    expect(pool.totalActiveKeys()).toBe(2);
    pool.cooldownKey('key2', 5000);
    expect(pool.availableCount()).toBe(1);
  });

  it('getNextKey legacy compat returns key or null', () => {
    const pool = new KeyPool(['key1'], 10000);
    expect(pool.getNextKey()).toBe('key1');
    pool.cooldownKey('key1', 5000);
    expect(pool.getNextKey()).toBeNull();
  });
});
