import { describe, expect, it } from 'vitest';
import { buildProviderPrompt, type ProviderMessage } from '../provider';

describe('buildProviderPrompt', () => {
  it('preserves assistant thinking blocks as text-safe content during tool replay', () => {
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'private chain summary' },
          { type: 'text', text: 'calling tool' },
        ],
        tool_calls: [{ id: 'call-1', function: { name: 'list_domains', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
    ];

    const prompt = buildProviderPrompt(messages);

    expect(prompt.system).toBe('system rules');
    expect(JSON.stringify(prompt.messages)).toContain('private chain summary');
    expect(JSON.stringify(prompt.messages)).toContain('calling tool');
    expect(JSON.stringify(prompt.messages)).toContain('tool-result');
  });
});
