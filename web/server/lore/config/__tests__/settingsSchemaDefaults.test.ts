import { describe, expect, it } from 'vitest';

describe('settings schema path defaults', () => {
  it('does not expose local storage paths as runtime settings', async () => {
    const { SCHEMA_BY_KEY } = await import('../settingsSchema');

    expect(SCHEMA_BY_KEY.has('review.local.path')).toBe(false);
    expect(SCHEMA_BY_KEY.has('backup.local.path')).toBe(false);
  });
});
