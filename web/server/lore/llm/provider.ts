import { generateText as generateSdkText, jsonSchema, stepCountIs, tool, type ModelMessage } from 'ai';
import type { EmbeddingConfig } from '../core/types';
import { createLanguageModel, type ResolvedViewLlmConfig } from './config';

export interface ProviderMessage {
  role: string;
  content?: string | null;
  tool_calls?: ProviderToolCall[];
  tool_call_id?: string;
}

export interface ProviderToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderToolResultMessage {
  tool_call_id: string;
  content: string;
}

export interface ProviderTextResponse {
  content: string;
  raw: unknown;
}

export interface ProviderToolResponse {
  content: string | null;
  tool_calls: ProviderToolCall[];
  raw: unknown;
}

function getJsonHeaders(apiKey: string, apiVersion = ''): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (apiVersion) headers['anthropic-version'] = apiVersion;
  return headers;
}

function buildPrompt(messages: ProviderMessage[], toolResults: ProviderToolResultMessage[] = []): {
  system: string | undefined;
  messages: ModelMessage[];
} {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content || '')
    .join('\n\n')
    .trim() || undefined;

  const modelMessages: ModelMessage[] = [];
  const toolNameById = new Map<string, string>();

  for (const message of messages) {
    if (message.role === 'system') continue;

    if (message.role === 'assistant') {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.tool_calls || []) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function?.arguments || '{}');
        } catch {}
        toolNameById.set(call.id, call.function?.name || '');
        content.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.function?.name || '',
          input,
        });
      }
      modelMessages.push({ role: 'assistant', content } as unknown as ModelMessage);
      continue;
    }

    if (message.role === 'tool') {
      modelMessages.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: message.tool_call_id || '',
          toolName: toolNameById.get(message.tool_call_id || '') || '',
          output: { type: 'text', value: message.content || '' },
        }],
      } as unknown as ModelMessage);
      continue;
    }

    modelMessages.push({
      role: message.role === 'user' ? 'user' : 'user',
      content: [{ type: 'text', text: message.content || '' }],
    } as unknown as ModelMessage);
  }

  if (toolResults.length > 0) {
    modelMessages.push({
      role: 'tool',
      content: toolResults.map((result) => ({
        type: 'tool-result',
        toolCallId: result.tool_call_id,
        toolName: toolNameById.get(result.tool_call_id) || '',
        output: { type: 'text', value: result.content },
      })),
    } as unknown as ModelMessage);
  }

  return { system, messages: modelMessages };
}

function buildTools(tools: ProviderToolDefinition[]): Record<string, ReturnType<typeof tool>> {
  return Object.fromEntries(tools.map((definition) => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.parameters),
    }),
  ]));
}

function toProviderToolCalls(toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>): ProviderToolCall[] {
  return toolCalls.map((call) => ({
    id: String(call.toolCallId || ''),
    function: {
      name: String(call.toolName || ''),
      arguments: JSON.stringify(call.input || {}),
    },
  }));
}

export function supportsTools(config: ResolvedViewLlmConfig): boolean {
  return config.provider === 'anthropic' || config.provider === 'openai_compatible' || config.provider === 'openai_responses';
}

export async function generateText(
  config: ResolvedViewLlmConfig,
  messages: ProviderMessage[],
): Promise<ProviderTextResponse> {
  const prompt = buildPrompt(messages);
  const result = await generateSdkText({
    model: createLanguageModel(config),
    system: prompt.system,
    messages: prompt.messages,
    temperature: config.temperature,
    maxOutputTokens: 4096,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(config.timeout_ms),
  });
  const content = result.text.trim();
  if (!content) throw new Error('View LLM response missing content');
  return {
    content,
    raw: {
      request: result.request,
      response: result.response,
      providerMetadata: result.providerMetadata,
      steps: result.steps,
    },
  };
}

export async function generateTextWithTools(
  config: ResolvedViewLlmConfig,
  messages: ProviderMessage[],
  tools: ProviderToolDefinition[],
  toolResults: ProviderToolResultMessage[] = [],
): Promise<ProviderToolResponse> {
  if (!supportsTools(config)) {
    throw new Error(`Configured provider does not support tools: ${config.provider}`);
  }

  const prompt = buildPrompt(messages, toolResults);
  const result = await generateSdkText({
    model: createLanguageModel(config),
    system: prompt.system,
    messages: prompt.messages,
    tools: buildTools(tools),
    toolChoice: 'auto',
    stopWhen: stepCountIs(1),
    temperature: config.temperature,
    maxOutputTokens: 4096,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(config.timeout_ms),
  });

  return {
    content: result.text.trim() || null,
    tool_calls: toProviderToolCalls(result.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
    }))),
    raw: {
      request: result.request,
      response: result.response,
      providerMetadata: result.providerMetadata,
      steps: result.steps,
      toolResults: result.toolResults,
    },
  };
}

export async function embedTexts(config: EmbeddingConfig, inputs: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of inputs) {
    const response = await fetch(`${String(config.base_url || '').replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: getJsonHeaders(config.api_key),
      body: JSON.stringify({ model: config.model, input: text }),
    });
    if (!response.ok) throw new Error(`Embedding request failed: ${response.status}`);
    const data = await response.json();
    const rows = [...(data.data || [])].sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.index || 0) - Number(b.index || 0));
    if (!rows[0]?.embedding) throw new Error('Embedding response missing data rows');
    results.push(rows[0].embedding as number[]);
  }
  return results;
}
