import { describe, expect, it } from 'vitest';
import loreOpenCodePlugin from '../index.js';

describe('OpenCode plugin entrypoint', () => {
  it('exports an async OpenCode Plugin', async () => {
    expect(typeof loreOpenCodePlugin).toBe('function');
  });
});
