import type { Hooks } from '@opencode-ai/plugin';
import type { Part, UserMessage } from '@opencode-ai/sdk';
import { describe, expect, it } from 'vitest';
import { classifyDirectUserPrompt, LORE_RECALL_MARKER } from '../lifecycle.js';

type ChatMessageHook = NonNullable<Hooks['chat.message']>;
type ChatMessageInput = Parameters<ChatMessageHook>[0];
type ChatMessageOutput = Parameters<ChatMessageHook>[1];

function message(overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    id: 'msg-1',
    sessionID: 'ses-1',
    role: 'user',
    time: { created: 1 },
    agent: 'build',
    model: { providerID: 'anthropic', modelID: 'claude-sonnet' },
    ...overrides,
  };
}

function textPart(id: string, text: string, overrides: Record<string, unknown> = {}): Part {
  return {
    id,
    sessionID: 'ses-1',
    messageID: 'msg-1',
    type: 'text',
    text,
    ...overrides,
  } as Part;
}

function fixture(
  parts: Part[] = [textPart('prt-1', 'First'), textPart('prt-2', 'Second')],
  inputOverrides: Partial<ChatMessageInput> = {},
  messageOverrides: Partial<UserMessage> = {},
): [ChatMessageInput, ChatMessageOutput] {
  return [
    {
      sessionID: 'ses-1',
      messageID: 'msg-1',
      agent: 'build',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet' },
      ...inputOverrides,
    },
    { message: message(messageOverrides), parts },
  ];
}

describe('classifies genuine OpenCode direct-user prompts', () => {
  it('preserves original text order and returns host identity metadata', () => {
    const [input, output] = fixture();

    expect(classifyDirectUserPrompt(input, output)).toEqual({
      sessionID: 'ses-1',
      messageID: 'msg-1',
      prompt: 'First\n\nSecond',
      agent: 'build',
      model: 'anthropic/claude-sonnet',
    });
  });

  it('excludes Lore-injected text when original text remains', () => {
    const [input, output] = fixture([
      textPart('prt-1', 'Original prompt'),
      textPart('prt-lore', '<recall>old</recall>', {
        synthetic: true,
        metadata: { lore_injected: true, marker: LORE_RECALL_MARKER },
      }),
    ]);

    expect(classifyDirectUserPrompt(input, output)?.prompt).toBe('Original prompt');
  });

  it.each([
    ['empty text', [textPart('prt-1', '   ')]],
    ['synthetic-only text', [textPart('prt-1', 'synthetic', { synthetic: true })]],
    ['ignored-only text', [textPart('prt-1', 'ignored', { ignored: true })]],
    ['injected-only text', [textPart('prt-1', 'injected', { metadata: { lore_injected: true } })]],
    ['all non-text parts', [{
      id: 'prt-agent', sessionID: 'ses-1', messageID: 'msg-1', type: 'agent', name: 'build', source: {},
    } as unknown as Part]],
  ])('rejects %s', (_label, parts) => {
    const [input, output] = fixture(parts);
    expect(classifyDirectUserPrompt(input, output)).toBeNull();
  });

  it('rejects compaction and subtask callbacks even when text is also present', () => {
    const compaction = {
      id: 'prt-c', sessionID: 'ses-1', messageID: 'msg-1', type: 'compaction', auto: true,
    } as Part;
    const subtask = {
      id: 'prt-s', sessionID: 'ses-1', messageID: 'msg-1', type: 'subtask', prompt: 'delegate', description: 'work', agent: 'build',
    } as Part;

    for (const special of [compaction, subtask]) {
      const [input, output] = fixture([textPart('prt-1', 'Original'), special]);
      expect(classifyDirectUserPrompt(input, output)).toBeNull();
    }
  });

  it('rejects summarized/internal, missing, mismatched, and unknown identities', () => {
    const cases: Array<[ChatMessageInput, ChatMessageOutput]> = [
      fixture(undefined, {}, { summary: { title: 'Summary', diffs: [] } }),
      fixture(undefined, { messageID: undefined }),
      fixture(undefined, { sessionID: '' }),
      fixture(undefined, { messageID: 'msg-other' }),
      fixture(undefined, {}, { sessionID: 'ses-other' }),
      fixture([textPart('prt-1', 'Original', { messageID: 'msg-other' })]),
      fixture([textPart('prt-1', 'Original'), { unexpected: true } as unknown as Part]),
    ];

    for (const [input, output] of cases) {
      expect(classifyDirectUserPrompt(input, output)).toBeNull();
    }
  });
});
