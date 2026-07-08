import { describe, expect, it } from 'vitest';

describe('settings schema defaults', () => {
  it('does not expose local storage paths as runtime settings', async () => {
    const { SCHEMA_BY_KEY } = await import('../settingsSchema');

    expect(SCHEMA_BY_KEY.has('review.local.path')).toBe(false);
    expect(SCHEMA_BY_KEY.has('backup.local.path')).toBe(false);
  });

  it('shows the local connection endpoint example for model service base URLs', async () => {
    const { SCHEMA_BY_KEY } = await import('../settingsSchema');

    expect(SCHEMA_BY_KEY.get('embedding.base_url')?.description).toContain('http://127.0.0.1:8090/v1');
    expect(SCHEMA_BY_KEY.get('view_llm.base_url')?.description).toContain('http://127.0.0.1:8090/v1');
  });

  it('ships server-side lifecycle guidance defaults for the settings UI', async () => {
    const { SCHEMA_BY_KEY } = await import('../settingsSchema');

    expect(SCHEMA_BY_KEY.get('lifecycle.guidance.global')?.type).toBe('text');
    expect(String(SCHEMA_BY_KEY.get('lifecycle.guidance.global')?.default)).toContain('Lore 使用规则');
    expect(String(SCHEMA_BY_KEY.get('lifecycle.startup_recall.preamble')?.default)).toContain('相关');
    expect(SCHEMA_BY_KEY.get('lifecycle.prompt_recall.preamble')?.default).toBe('');
  });
});
