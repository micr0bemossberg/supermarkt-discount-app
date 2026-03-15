import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('rotates keys round-robin', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    expect(pool.getNextKey()).toBe('key1');
    expect(pool.getNextKey()).toBe('key2');
    expect(pool.getNextKey()).toBe('key3');
    expect(pool.getNextKey()).toBe('key1'); // wraps around
  });

  it('skips keys that are on cooldown', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    pool.getNextKey(); // key1
    pool.cooldownKey('key1', 5000); // 5s cooldown
    expect(pool.getNextKey()).toBe('key2');
    expect(pool.getNextKey()).toBe('key3');
    expect(pool.getNextKey()).toBe('key2'); // skips key1
  });

  it('returns null when all keys are on cooldown', () => {
    const pool = new KeyPool(['key1']);
    pool.cooldownKey('key1', 5000);
    expect(pool.getNextKey()).toBeNull();
  });

  it('re-enables keys after cooldown expires', () => {
    const pool = new KeyPool(['key1']);
    pool.cooldownKey('key1', 0); // expired cooldown
    expect(pool.getNextKey()).toBe('key1');
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv();
    expect(pool.getNextKey()).toBe('testkey1');
    expect(pool.getNextKey()).toBe('testkey2');
    delete process.env.gemini_api_key1;
    delete process.env.gemini_api_key2;
  });

  it('reports available key count', () => {
    const pool = new KeyPool(['key1', 'key2']);
    expect(pool.availableCount()).toBe(2);
    pool.cooldownKey('key1', 5000);
    expect(pool.availableCount()).toBe(1);
  });
});
