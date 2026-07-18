import type { Hooks } from '@opencode-ai/plugin';
import type { Part } from '@opencode-ai/sdk';

export const LORE_RECALL_MARKER = 'lore:prompt-context';

export interface ClassifiedPrompt {
  sessionID: string;
  messageID: string;
  prompt: string;
  agent?: string;
  model?: string;
}

type ChatMessageHook = NonNullable<Hooks['chat.message']>;
export type ChatMessageInput = Parameters<ChatMessageHook>[0];
export type ChatMessageOutput = Parameters<ChatMessageHook>[1];

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validPartIdentity(part: Part, sessionID: string, messageID: string): boolean {
  return nonEmpty(part.id)
    && part.sessionID === sessionID
    && part.messageID === messageID;
}

function loreInjected(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.lore_injected === true || record.marker === LORE_RECALL_MARKER;
}

export function classifyDirectUserPrompt(
  input: ChatMessageInput,
  output: ChatMessageOutput,
): ClassifiedPrompt | null {
  if (!nonEmpty(input.sessionID) || !nonEmpty(input.messageID)) return null;
  if (!output || !output.message || output.message.role !== 'user') return null;
  if (output.message.sessionID !== input.sessionID || output.message.id !== input.messageID) return null;
  if (output.message.summary) return null;
  if (!Array.isArray(output.parts) || output.parts.length === 0) return null;

  const originalText: string[] = [];
  for (const part of output.parts) {
    if (!part || typeof part !== 'object' || !('type' in part)) return null;
    if (!validPartIdentity(part, input.sessionID, input.messageID)) return null;
    if (part.type === 'compaction' || part.type === 'subtask') return null;
    if (part.type !== 'text') {
      const supportedNonTextTypes = new Set([
        'reasoning', 'file', 'tool', 'step-start', 'step-finish', 'snapshot', 'patch', 'agent', 'retry',
      ]);
      if (!supportedNonTextTypes.has(part.type)) return null;
      continue;
    }
    if (part.synthetic === true || part.ignored === true || loreInjected(part.metadata)) continue;
    const value = part.text.trim();
    if (value) originalText.push(value);
  }

  if (originalText.length === 0) return null;
  const providerID = input.model?.providerID?.trim();
  const modelID = input.model?.modelID?.trim();

  return {
    sessionID: input.sessionID,
    messageID: input.messageID,
    prompt: originalText.join('\n\n'),
    ...(nonEmpty(input.agent) ? { agent: input.agent.trim() } : {}),
    ...(providerID && modelID ? { model: `${providerID}/${modelID}` } : {}),
  };
}
