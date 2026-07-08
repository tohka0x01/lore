import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeClientType, type ClientType } from '../../auth';
import { bootView } from '../memory/boot';
import { recallMemories } from '../recall/recall';
import {
  buildStartupQueries,
  extractNodeUris,
  formatLifecycleBootSection,
  formatLifecycleRecallBlock,
  joinLifecycleContext,
  normalizeLifecycleProject,
  type LifecycleProject,
} from './format';

export const LIFECYCLE_PROTOCOL_VERSION = 'lore.lifecycle.v1';

export type LifecycleEventName = 'session.start' | 'prompt.submit';
export type HostOutputMode = 'none' | 'stdout_json' | 'stdout_text' | 'return_value';
const LIFECYCLE_RUNTIME_FAMILIES: ReadonlySet<ClientType> = new Set(['claudecode', 'codex', 'openclaw', 'hermes', 'pi']);

export interface LifecycleEventInput {
  protocol_version?: string;
  runtime?: {
    runtime_id?: string;
    runtime_family?: string;
    client_type?: string;
  };
  event?: {
    name?: string;
    native_name?: string;
  };
  normalized?: {
    session_id?: string;
    prompt?: string;
  };
  project?: unknown;
  native_input_snapshot?: Record<string, unknown>;
}

export interface HostOutput {
  mode: HostOutputMode;
  value: unknown;
}

export interface LifecycleEventResponse {
  ok: true;
  protocol_version: typeof LIFECYCLE_PROTOCOL_VERSION;
  event_name: string;
  runtime: {
    runtime_id: string;
    runtime_family: ClientType | null;
  };
  host_output: HostOutput;
  query_id: string;
  node_uris: string[];
  has_output: boolean;
  meta: Record<string, unknown>;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function loadGuidance(): string {
  try {
    return readFileSync(join(process.cwd(), 'server', 'lore', 'guidance-reference.md'), 'utf8').trim();
  } catch {
    try {
      return readFileSync(join(process.cwd(), 'web', 'server', 'lore', 'guidance-reference.md'), 'utf8').trim();
    } catch {
      return '';
    }
  }
}

function runtimeFamily(input: LifecycleEventInput): ClientType | null {
  return normalizeClientType(input.runtime?.runtime_family || input.runtime?.client_type || null);
}

function runtimeId(input: LifecycleEventInput, family: ClientType | null): string {
  return cleanText(input.runtime?.runtime_id) || family || 'unknown';
}

function supportsLifecycleFamily(family: ClientType): boolean {
  return LIFECYCLE_RUNTIME_FAMILIES.has(family);
}

function noOutput(input: LifecycleEventInput, reason: string): LifecycleEventResponse {
  const family = runtimeFamily(input);
  return {
    ok: true,
    protocol_version: LIFECYCLE_PROTOCOL_VERSION,
    event_name: cleanText(input.event?.name),
    runtime: { runtime_id: runtimeId(input, family), runtime_family: family },
    host_output: { mode: 'none', value: null },
    query_id: '',
    node_uris: [],
    has_output: false,
    meta: { reason },
  };
}

function nativeEventName(eventName: string, fallback: string): string {
  return cleanText(eventName) || fallback;
}

function codexJson(nativeName: string, additionalContext: string): HostOutput {
  if (!additionalContext.trim()) return { mode: 'none', value: null };
  return {
    mode: 'stdout_json',
    value: {
      hookSpecificOutput: {
        hookEventName: nativeName,
        additionalContext,
      },
    },
  };
}

function claudeStartupJson(additionalContext: string): HostOutput {
  return codexJson('SessionStart', additionalContext);
}

function renderHostOutput(args: {
  family: ClientType;
  eventName: LifecycleEventName;
  nativeName: string;
  context: string;
  sessionId: string;
}): HostOutput {
  const context = args.context.trim();
  if (!context) return { mode: 'none', value: null };

  if (args.family === 'codex') {
    const fallback = args.eventName === 'session.start' ? 'SessionStart' : 'UserPromptSubmit';
    return codexJson(nativeEventName(args.nativeName, fallback), context);
  }

  if (args.family === 'claudecode') {
    if (args.eventName === 'session.start') return claudeStartupJson(context);
    return { mode: 'stdout_text', value: context };
  }

  if (args.family === 'openclaw') {
    return {
      mode: 'return_value',
      value: args.eventName === 'session.start'
        ? { appendSystemContext: context }
        : { prependContext: context },
    };
  }

  if (args.family === 'pi') {
    return {
      mode: 'return_value',
      value: args.eventName === 'session.start'
        ? { systemPromptAppend: context }
        : {
            message: {
              customType: 'lore-recall',
              content: context,
              display: false,
              details: { source: 'lore', session_id: args.sessionId || undefined },
            },
          },
    };
  }

  if (args.family === 'hermes') {
    return {
      mode: 'return_value',
      value: args.eventName === 'session.start'
        ? { system_context: context }
        : { context },
    };
  }

  return { mode: 'none', value: null };
}

async function buildStartupRecallContext(queries: string[], clientType: ClientType | null): Promise<string> {
  const blocks: string[] = [];
  for (const query of queries) {
    try {
      const data = await recallMemories({ query, session_id: 'boot' }, { clientType });
      const queryId = typeof data?.event_log?.query_id === 'string' ? data.event_log.query_id : '';
      const block = formatLifecycleRecallBlock(data?.items || [], 'boot', queryId);
      if (block) blocks.push(block);
    } catch {
      // Startup recall is best effort.
    }
  }
  return blocks.length > 0 ? `以下记忆节点与当前环境高度相关,建议提前读取。\n\n${blocks.join('\n\n')}` : '';
}

async function buildSessionStart(input: LifecycleEventInput, family: ClientType, runtime: string): Promise<LifecycleEventResponse> {
  const sessionId = cleanText(input.normalized?.session_id);
  const channel = runtime || family;
  const project: LifecycleProject = normalizeLifecycleProject(input.project);
  const queries = buildStartupQueries(channel, project);
  const [bootData, startupRecallContext] = await Promise.all([
    bootView({ client_type: family }),
    buildStartupRecallContext(queries, family),
  ]);
  const context = joinLifecycleContext([
    loadGuidance(),
    formatLifecycleBootSection(bootData, family),
    startupRecallContext,
  ]);
  const hostOutput = renderHostOutput({
    family,
    eventName: 'session.start',
    nativeName: cleanText(input.event?.native_name),
    context,
    sessionId,
  });
  return {
    ok: true,
    protocol_version: LIFECYCLE_PROTOCOL_VERSION,
    event_name: 'session.start',
    runtime: { runtime_id: runtime, runtime_family: family },
    host_output: hostOutput,
    query_id: '',
    node_uris: [],
    has_output: hostOutput.mode !== 'none',
    meta: { session_id: sessionId, queries },
  };
}

async function buildPromptSubmit(input: LifecycleEventInput, family: ClientType, runtime: string): Promise<LifecycleEventResponse> {
  const prompt = cleanText(input.normalized?.prompt);
  const sessionId = cleanText(input.normalized?.session_id);
  if (!prompt) return noOutput(input, 'empty_prompt');

  const data = await recallMemories({ query: prompt, session_id: sessionId }, { clientType: family });
  const queryId = typeof data?.event_log?.query_id === 'string' ? data.event_log.query_id : '';
  const items = data?.items || [];
  const context = formatLifecycleRecallBlock(items, sessionId, queryId);
  const nodeUris = extractNodeUris(items);
  const hostOutput = renderHostOutput({
    family,
    eventName: 'prompt.submit',
    nativeName: cleanText(input.event?.native_name),
    context,
    sessionId,
  });
  return {
    ok: true,
    protocol_version: LIFECYCLE_PROTOCOL_VERSION,
    event_name: 'prompt.submit',
    runtime: { runtime_id: runtime, runtime_family: family },
    host_output: hostOutput,
    query_id: queryId,
    node_uris: nodeUris,
    has_output: hostOutput.mode !== 'none',
    meta: { session_id: sessionId },
  };
}

export async function buildLifecycleEvent(input: LifecycleEventInput): Promise<LifecycleEventResponse> {
  const family = runtimeFamily(input);
  const runtime = runtimeId(input, family);
  const eventName = cleanText(input.event?.name) as LifecycleEventName;

  if (!family) return noOutput(input, 'unknown_runtime_family');
  if (!supportsLifecycleFamily(family)) return noOutput(input, 'unsupported_runtime_family');
  if (eventName === 'session.start') return buildSessionStart(input, family, runtime);
  if (eventName === 'prompt.submit') return buildPromptSubmit(input, family, runtime);
  return noOutput(input, 'unsupported_event');
}
