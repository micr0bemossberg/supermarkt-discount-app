import type { KeyState } from './types';

export class KeyPool {
  private keys: KeyState[];
  private currentIndex: number = 0;

  constructor(apiKeys: string[]) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.keys = apiKeys.map((key) => ({ key, cooldownUntil: 0 }));
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

  getNextKey(): string | null {
    const now = Date.now();
    const totalKeys = this.keys.length;

    for (let i = 0; i < totalKeys; i++) {
      const index = (this.currentIndex + i) % totalKeys;
      const keyState = this.keys[index];

      if (keyState.cooldownUntil <= now) {
        this.currentIndex = (index + 1) % totalKeys;
        return keyState.key;
      }
    }

    return null; // All keys on cooldown
  }

  cooldownKey(key: string, durationMs: number): void {
    const keyState = this.keys.find((k) => k.key === key);
    if (keyState) {
      keyState.cooldownUntil = Date.now() + durationMs;
    }
  }

  availableCount(): number {
    const now = Date.now();
    return this.keys.filter((k) => k.cooldownUntil <= now).length;
  }
}
