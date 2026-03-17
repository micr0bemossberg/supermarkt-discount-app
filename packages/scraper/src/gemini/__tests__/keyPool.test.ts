import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('acquires first available key', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    const r1 = pool.acquireKey();
    expect('key' in r1 && r1.key).toBe('key1');
    // Without cooldown, same key is returned again (it's free)
    const r2 = pool.acquireKey();
    expect('key' in r2 && r2.key).toBe('key1');
  });

  it('skips keys on cooldown', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.cooldownKey('key1', 5000);
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('key2');
  });

  it('returns waitMs when all keys on cooldown', () => {
    const pool = new KeyPool(['key1']);
    pool.cooldownKey('key1', 5000);
    const r = pool.acquireKey();
    expect('waitMs' in r).toBe(true);
    if ('waitMs' in r) expect(r.waitMs).toBeGreaterThan(0);
  });

  it('disableKey permanently removes a key', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.disableKey('key1');
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('key2');
    expect(pool.totalActiveKeys()).toBe(1);
  });

  it('waitForKey resolves with a key', async () => {
    const pool = new KeyPool(['key1']);
    const key = await pool.waitForKey();
    expect(key).toBe('key1');
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv();
    const r = pool.acquireKey();
    expect('key' in r && r.key).toBe('testkey1');
    delete process.env.gemini_api_key1;
    delete process.env.gemini_api_key2;
  });

  it('reports counts correctly', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    expect(pool.availableCount()).toBe(3);
    expect(pool.totalActiveKeys()).toBe(3);
    pool.disableKey('key1');
    expect(pool.totalActiveKeys()).toBe(2);
    pool.cooldownKey('key2', 5000);
    expect(pool.availableCount()).toBe(1);
  });

  it('getNextKey legacy compat', () => {
    const pool = new KeyPool(['key1']);
    expect(pool.getNextKey()).toBe('key1');
    pool.cooldownKey('key1', 5000);
    expect(pool.getNextKey()).toBeNull();
  });
});
