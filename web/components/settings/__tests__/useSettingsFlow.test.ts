import { describe, expect, it } from 'vitest';
import { hasConfiguredEmbedding } from '../useSettingsFlow';
import type { SettingsData } from '../SettingsSectionEditor';

function makeSettingsData(overrides: Partial<SettingsData> = {}): SettingsData {
  return {
    schema: [],
    sections: [],
    values: {
      'embedding.base_url': '',
      'embedding.api_key': '',
      'embedding.model': '',
    },
    defaults: {},
    sources: {},
    secret_configured: {},
    ...overrides,
  };
}

describe('hasConfiguredEmbedding', () => {
  it('returns false for first-run empty embedding settings', () => {
    expect(hasConfiguredEmbedding(makeSettingsData())).toBe(false);
  });

  it('uses secret_configured for embedding API key', () => {
    expect(hasConfiguredEmbedding(makeSettingsData({
      values: {
        'embedding.base_url': 'http://embed.local/v1',
        'embedding.api_key': '',
        'embedding.model': 'embed-model',
      },
      secret_configured: {
        'embedding.api_key': true,
      },
    }))).toBe(true);
  });
});
