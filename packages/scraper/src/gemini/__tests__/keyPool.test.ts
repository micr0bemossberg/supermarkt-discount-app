import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('acquires first available key with keyIndex', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    const r1 = pool.acquireKey();
    expect(r1).not.toBeNull();
    expect(r1!.key).toBe('key1');
    expect(r1!.keyIndex).toBe(1);
  });

  it('marks acquired key as in-flight — not available until released', () => {
    const pool = new KeyPool(['key1']);
    const r1 = pool.acquireKey();
    expect(r1).not.toBeNull();
    // key1 is in-flight, no keys available
    expect(pool.acquireKey()).toBeNull();
    // Release it
    pool.releaseKey('key1');
    // Now available again
    expect(pool.acquireKey()).not.toBeNull();
  });

  it('rotates to next key when first is in-flight', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.acquireKey(); // key1 in-flight
    const r2 = pool.acquireKey();
    expect(r2).not.toBeNull();
    expect(r2!.key).toBe('key2');
  });

  it('skips keys on cooldown', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.cooldownKey('key1', 5000);
    const r = pool.acquireKey();
    expect(r).not.toBeNull();
    expect(r!.key).toBe('key2');
  });

  it('returns null when all keys busy', () => {
    const pool = new KeyPool(['key1']);
    pool.acquireKey(); // in-flight
    expect(pool.acquireKey()).toBeNull();
  });

  it('disableKey permanently removes a key', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.disableKey('key1');
    const r = pool.acquireKey();
    expect(r).not.toBeNull();
    expect(r!.key).toBe('key2');
    expect(pool.totalActiveKeys()).toBe(1);
  });

  it('waitForKey resolves with key and keyIndex', async () => {
    const pool = new KeyPool(['key1']);
    const { key, keyIndex } = await pool.waitForKey();
    expect(key).toBe('key1');
    expect(keyIndex).toBe(1);
  });

  it('waitForKey waits until a key is released', async () => {
    const pool = new KeyPool(['key1']);
    pool.acquireKey(); // key1 in-flight

    // Release after 200ms
    setTimeout(() => pool.releaseKey('key1'), 200);

    const start = Date.now();
    const { key } = await pool.waitForKey();
    const elapsed = Date.now() - start;

    expect(key).toBe('key1');
    expect(elapsed).toBeGreaterThanOrEqual(100); // waited for release
  });

  it('cooldownKey releases in-flight and sets cooldown', () => {
    const pool = new KeyPool(['key1', 'key2']);
    pool.acquireKey(); // key1 in-flight
    pool.cooldownKey('key1', 5000); // cooldown releases in-flight
    // key1 is on cooldown, key2 is free
    expect(pool.availableCount()).toBe(1);
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv();
    const r = pool.acquireKey();
    expect(r).not.toBeNull();
    expect(r!.key).toBe('testkey1');
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
    // key1 is now in-flight
    expect(pool.getNextKey()).toBeNull();
  });
});
