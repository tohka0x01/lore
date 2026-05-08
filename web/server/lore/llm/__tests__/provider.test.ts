import { describe, expect, it } from 'vitest';
import { buildProviderPrompt, type ProviderMessage } from '../provider';

describe('buildProviderPrompt', () => {
  it('preserves assistant thinking blocks as reasoning content during tool replay', () => {
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'private chain summary', signature: 'sig-1' },
          { type: 'text', text: 'calling tool' },
        ],
        tool_calls: [{ id: 'call-1', function: { name: 'list_domains', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
    ];

    const prompt = buildProviderPrompt(messages);

    expect(prompt.system).toBe('system rules');
    expect(prompt.messages[1]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'private chain summary',
          providerOptions: { anthropic: { signature: 'sig-1' } },
        },
        { type: 'text', text: 'calling tool' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'list_domains',
        },
      ],
    });
    expect(JSON.stringify(prompt.messages)).toContain('calling tool');
    expect(JSON.stringify(prompt.messages)).toContain('tool-result');
  });

  it('keeps unsigned thinking blocks replayable for non-signing Anthropic-compatible endpoints', () => {
    const messages: ProviderMessage[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'unsigned thinking from DeepSeek' },
          { type: 'reasoning', text: 'unsigned reasoning from SDK response' },
          { type: 'text', text: 'calling tool' },
        ],
        tool_calls: [{ id: 'call-1', function: { name: 'list_domains', arguments: '{}' } }],
      },
    ];

    const prompt = buildProviderPrompt(messages, [], { preserveUnsignedThinking: true });

    expect(prompt.messages[1]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'unsigned thinking from DeepSeek',
          providerOptions: { anthropic: { signature: '' } },
        },
        {
          type: 'reasoning',
          text: 'unsigned reasoning from SDK response',
          providerOptions: { anthropic: { signature: '' } },
        },
        { type: 'text', text: 'calling tool' },
        { type: 'tool-call', toolCallId: 'call-1' },
      ],
    });
  });
});
