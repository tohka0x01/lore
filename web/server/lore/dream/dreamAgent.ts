import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContractError, getErrorStatus } from '../contracts';
import { resolveViewLlmConfig, type ResolvedViewLlmConfig } from '../llm/config';
import { generateTextWithTools, type ProviderMessage, type ProviderToolDefinition } from '../llm/provider';
import { parseUri } from '../core/utils';
import {
  buildProtectedBootBlockedResult,
  getProtectedBootOperation,
} from './dreamToolBootGuard';
import { dispatchDreamTool } from './dreamToolDispatch';
import { processDreamToolCalls } from './dreamLoopToolCalls';
import type { DreamToolEventContext } from './dreamToolPolicy';

export { parseUri };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmConfig = ResolvedViewLlmConfig;

export interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result_preview: string;
}

export interface DreamAgentResult {
  narrative: string;
  toolCalls: ToolCallLogEntry[];
  turns: number;
}

export interface DreamAgentEventCallback {
  (eventType: string, payload?: Record<string, unknown>): void | Promise<void>;
}

export interface DreamAgentRunOptions {
  onEvent?: DreamAgentEventCallback;
  eventContext?: DreamToolEventContext;
}

interface ChatMessage extends ProviderMessage {}

interface ToolDefinition extends ProviderToolDefinition {}

export interface DreamBootBaselineEntry {
  uri: string;
  role_label: string;
  purpose: string;
  scope?: 'global' | 'client';
  client_type?: string | null;
  state: 'missing' | 'empty' | 'initialized';
  content: string;
}

export interface RecentDiary {
  started_at: string | null;
  status: string;
  narrative: string | null;
  tool_calls: Array<{ tool: string; args: Record<string, unknown> }>;
}

export interface DreamInitialContext {
  bootBaseline: DreamBootBaselineEntry[];
  guidance: string;
  recallReview: Record<string, unknown>;
  recallStats: Record<string, unknown>;
  writeActivity: Record<string, unknown>;
  recentDiaries: RecentDiary[];
}

// ---------------------------------------------------------------------------
// LLM chat with tool_calls support
// ---------------------------------------------------------------------------

export const DREAM_EVENT_CONTEXT = { source: 'dream:auto' } as const satisfies DreamToolEventContext;

function buildDreamEventContext(base: DreamToolEventContext | undefined): DreamToolEventContext {
  return {
    ...DREAM_EVENT_CONTEXT,
    ...(base || {}),
    source: base?.source || DREAM_EVENT_CONTEXT.source,
  };
}

export async function loadLlmConfig(): Promise<LlmConfig | null> {
  return resolveViewLlmConfig();
}

export async function chatWithTools(
  config: LlmConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
): Promise<Record<string, unknown>> {
  const response = await generateTextWithTools(config, messages, tools);
  return {
    content: response.content,
    tool_calls: response.tool_calls,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions for the dream agent
// ---------------------------------------------------------------------------

export function buildDreamTools(): ToolDefinition[] {
  return [
    { name: 'get_node', description: 'Read a memory node by URI', parameters: { type: 'object', properties: { uri: { type: 'string', description: 'Memory URI e.g. core://soul' } }, required: ['uri'] } },
    { name: 'search', description: 'Search memories by keyword', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] } },
    { name: 'list_domains', description: 'List all memory domains', parameters: { type: 'object', properties: {} } },
    { name: 'get_node_recall_detail', description: 'Inspect recall performance for one node: which queries/path/view types recall it, how often it is selected, and whether it is actually used', parameters: { type: 'object', properties: { uri: { type: 'string' }, days: { type: 'integer' }, limit: { type: 'integer' } }, required: ['uri'] } },
    { name: 'get_query_recall_detail', description: 'Inspect one problematic query by query_id or query_text to see merged nodes, selected nodes, usage, and path/view breakdowns', parameters: { type: 'object', properties: { query_id: { type: 'string' }, query_text: { type: 'string' }, days: { type: 'integer' }, limit: { type: 'integer' } } } },
    { name: 'get_node_write_history', description: 'Read a node\'s recent write history so you can see whether it was manually edited, repeatedly changed, or recently touched by dream', parameters: { type: 'object', properties: { uri: { type: 'string' }, limit: { type: 'integer' } }, required: ['uri'] } },
    { name: 'get_path_effectiveness_detail', description: 'Inspect retrieval path effectiveness metrics before blaming a node; use this to tell node problems apart from path-weight problems', parameters: { type: 'object', properties: { days: { type: 'integer' } } } },
    { name: 'inspect_neighbors', description: 'Inspect a node\'s parent, siblings, children, aliases, and breadcrumbs to understand structural context before editing', parameters: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] } },
    { name: 'inspect_views', description: 'Inspect generated memory views for one node/path, including gist/question content, metadata, and freshness', parameters: { type: 'object', properties: { uri: { type: 'string' }, limit: { type: 'integer' } }, required: ['uri'] } },
    { name: 'create_node', description: 'Create a new memory node', parameters: { type: 'object', properties: { uri: { type: 'string' }, content: { type: 'string' }, priority: { type: 'integer' }, disclosure: { type: 'string' }, glossary: { type: 'array', items: { type: 'string' } } }, required: ['content', 'priority'] } },
    { name: 'update_node', description: 'Update an existing memory node', parameters: { type: 'object', properties: { uri: { type: 'string' }, content: { type: 'string' }, priority: { type: 'integer' }, disclosure: { type: 'string' } }, required: ['uri'] } },
    { name: 'delete_node', description: 'Delete a memory node', parameters: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] } },
    { name: 'move_node', description: 'Move/rename a memory node to a new URI', parameters: { type: 'object', properties: { old_uri: { type: 'string' }, new_uri: { type: 'string' } }, required: ['old_uri', 'new_uri'] } },
    { name: 'add_glossary', description: 'Add a glossary keyword to a node', parameters: { type: 'object', properties: { keyword: { type: 'string' }, node_uuid: { type: 'string' } }, required: ['keyword', 'node_uuid'] } },
    { name: 'remove_glossary', description: 'Remove a glossary keyword from a node', parameters: { type: 'object', properties: { keyword: { type: 'string' }, node_uuid: { type: 'string' } }, required: ['keyword', 'node_uuid'] } },
    { name: 'manage_triggers', description: 'Batch add/remove glossary keywords', parameters: { type: 'object', properties: { uri: { type: 'string' }, add: { type: 'array', items: { type: 'string' } }, remove: { type: 'array', items: { type: 'string' } } }, required: ['uri'] } },
  ];
}

export async function executeDreamTool(
  name: string,
  args: Record<string, unknown>,
  eventContext: DreamToolEventContext = DREAM_EVENT_CONTEXT,
): Promise<unknown> {
  try {
    const context = buildDreamEventContext(eventContext);
    const protectedBootOp = getProtectedBootOperation(name, args);
    if (protectedBootOp) {
      return buildProtectedBootBlockedResult(protectedBootOp);
    }
    return await dispatchDreamTool(name, args, context);
  } catch (err: unknown) {
    const status = getErrorStatus(err);
    const envelope = buildContractError(err, 'Dream tool failed');
    return {
      error: envelope.detail,
      detail: envelope.detail,
      ...(envelope.code ? { code: envelope.code } : {}),
      status,
    };
  }
}

// ---------------------------------------------------------------------------
// System prompt for dream agent
// ---------------------------------------------------------------------------

export function loadGuidanceFile(): string {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    let content = fs.readFileSync(path.join(dir, '..', 'mcp-guidance.md'), 'utf-8').trim();
    content = content.replace(/lore_guidance/g, 'preloaded guidance')
      .replace(/lore_boot/g, 'preloaded boot baseline')
      .replace(/lore_get_node/g, 'get_node')
      .replace(/lore_search/g, 'search')
      .replace(/lore_create_node/g, 'create_node')
      .replace(/lore_update_node/g, 'update_node')
      .replace(/lore_delete_node/g, 'delete_node')
      .replace(/lore_move_node/g, 'move_node')
      .replace(/lore_list_domains/g, 'list_domains')
      .replace(/lore_list_session_reads/g, 'session reads')
      .replace(/lore_clear_session_reads/g, 'clear session');
    return content;
  } catch {
    return '';
  }
}

function buildRecentQueries(recallStats: Record<string, unknown>): Array<Record<string, unknown>> {
  const recentQueryItems = (recallStats as any)?.recent_queries?.items;
  if (!Array.isArray(recentQueryItems)) return [];
  return recentQueryItems.map((item: Record<string, unknown>) => ({
    query_id: item.query_id,
    query_text: item.query_text,
    merged: Number(item.merged_count ?? item.merged ?? 0),
    shown: Number(item.shown_count ?? item.shown ?? 0),
    used: Number(item.used_count ?? item.used ?? 0),
    client_type: item.client_type ?? null,
    created_at: item.created_at ?? null,
  }));
}

function buildReviewedQueries(recallReview: Record<string, unknown>): Array<Record<string, unknown>> {
  const reviewItems = (recallReview as any)?.reviewed_queries;
  if (!Array.isArray(reviewItems)) return [];
  return reviewItems.map((item: Record<string, unknown>) => ({
    query_id: item.query_id,
    query_text: item.query_text,
    merged: Number(item.merged_count ?? 0),
    shown: Number(item.shown_count ?? 0),
    used: Number(item.used_count ?? 0),
    flags: Array.isArray(item.flags) ? item.flags : [],
    selected_uris: Array.isArray(item.selected_uris) ? item.selected_uris : [],
    used_uris: Array.isArray(item.used_uris) ? item.used_uris : [],
    unrecalled_session_reads: Array.isArray(item.unrecalled_session_reads) ? item.unrecalled_session_reads : [],
    unshown_session_reads: Array.isArray(item.unshown_session_reads) ? item.unshown_session_reads : [],
    missed_recall_signals: Array.isArray(item.missed_recall_signals) ? item.missed_recall_signals : [],
  }));
}

function buildWriteDigest(writeActivity: Record<string, unknown>): Record<string, unknown> {
  const summary = (writeActivity.summary as Record<string, unknown>) || {};
  const hotNodes = Array.isArray(writeActivity.hot_nodes)
    ? writeActivity.hot_nodes.map((item: Record<string, unknown>) => ({
        node_uri: item.node_uri,
        total: Number(item.total ?? 0),
        creates: Number(item.creates ?? 0),
        updates: Number(item.updates ?? 0),
        deletes: Number(item.deletes ?? 0),
        last_event_at: item.last_event_at ?? null,
      }))
    : [];
  const recentEvents = Array.isArray(writeActivity.recent_events)
    ? writeActivity.recent_events.map((item: Record<string, unknown>) => ({
        event_type: item.event_type,
        node_uri: item.node_uri,
        source: item.source,
        created_at: item.created_at ?? null,
      }))
    : [];
  return {
    summary,
    hot_nodes: hotNodes,
    recent_events: recentEvents,
  };
}

export function buildDreamSystemPrompt(initialContext: DreamInitialContext): string {
  const guidanceAvailable = Boolean(initialContext.guidance.trim());
  const recentQueries = buildRecentQueries(initialContext.recallStats);
  const reviewedQueries = buildReviewedQueries(initialContext.recallReview);
  const bootBaselineLines = initialContext.bootBaseline.length > 0
    ? initialContext.bootBaseline.map((entry) => `- ${entry.uri} — ${entry.role_label}`)
    : ['- (no boot memories loaded)'];
  const hasClientBoot = initialContext.bootBaseline.some((entry) => entry.scope === 'client');

  const bootContextLine = guidanceAvailable
    ? 'Read the guidance first and apply it to every write decision and to the final diary. Use the loaded boot baseline as always-available key memories throughout the review.'
    : 'Use the loaded boot baseline as always-available key memories throughout the review.';

  const rules = `You are running a daily dream review.

Your job today:
1. Inspect today's real recall traffic and identify the strongest missed recall candidates
2. Strengthen durable memory when today's evidence justifies it
3. Make the smallest useful changes that improve recall or capture durable memory
4. Record the work in natural Chinese using guidance-level evidence and reasoning

${bootContextLine}
Use the following protected boot nodes as fixed reference memories while you judge recall problems, choose write scope, and explain decisions in the diary:
${bootBaselineLines.join('\n')}
${hasClientBoot ? 'This baseline includes both global boot nodes and client-specific agent boot nodes. Treat core://agent as the shared agent rule layer and core://agent/<client_type> nodes as runtime-specific rule layers.' : 'Treat the boot baseline as the fixed rule layer for the system before you touch any other memory.'}

## Workflow

### 1. Review today's recall evidence
Start with reviewed_queries. These are the primary evidence for today's review.
Use recent_queries and write_activity only to choose where to investigate next.
Focus on the most suspicious reviewed queries first, especially ones showing:
- zero_use
- high_merge_low_use
- retrieved_not_selected
- never_retrieved
- manual_read_after_weak_recall_proxy

For each top candidate, state what was likely missing and why that matters.

### 2. Investigate each candidate just enough
Gather only the evidence needed to explain the candidate and support a decision.
Prefer these tools:
- get_query_recall_detail
- get_node_recall_detail
- get_node
- inspect_neighbors
- inspect_views
- get_path_effectiveness_detail
- get_node_write_history

For each candidate, decide whether it is:
- a recall path / ranking problem
- a memory node problem
- a durable extraction opportunity from today's queries
- not actionable

Then classify every candidate into exactly one outcome:
- missed recall
- durable extraction
- maintenance
- no action

Act only when the evidence is strong enough to justify the classification.

### 3. Resolve the highest-value missed recalls
Handle the strongest missed recall candidates first.
Use the boot memories and the guidance body to judge whether the right improvement is about structure, boundary, disclosure, priority, content, or no write at all.
Treat noisy recall as a clue only when it supports a concrete missed-recall diagnosis.
When maintenance helps, do the maintenance that directly supports this diagnosis or fix.

### 4. Extract durable memory from today's real usage
Start durable extraction from:
- today's recall query texts
- today's suspicious reviewed queries
- nodes implicated by those queries
- today's queried nodes
- today's newly written or repeatedly touched nodes

Use search, list_domains, get_node, inspect_neighbors, and get_node_write_history to locate the right target and gather the context required by guidance.
Let guidance determine whether the right result is a new node, an update to an existing node, a structure-first change, or a deferral.
Make scope, boundary, disclosure, priority, structure, and diary-treatment decisions at guidance quality rather than as a quick create-versus-merge shortcut.
Stay local to today's evidence instead of roaming across the whole graph.

### 5. Make the smallest useful write
Before any write, read the target node in full.

Prefer this improvement order:
1. structure / node boundary
2. disclosure / glossary
3. priority
4. content

Each write should do one of three things:
- reduce a missed recall
- capture durable memory
- support necessary, evidence-backed maintenance

Read more nodes than you modify.
Keep every boot node listed above intact and use them as fixed key memories, not routine write targets or move destinations.

### 6. Write the diary
Write the final diary in natural Chinese.
Follow guidance for diary structure, evidence standard, and how to justify actions and deferrals.
Use exactly five sections with Chinese titles corresponding to:
1. reviewed recall requests
2. likely missed recalls and evidence
3. durable memory creation or reinforcement
4. maintenance-only changes
5. deferred issues and why

Within those sections, explain:
- which recall requests you reviewed
- which missed recalls look credible and why
- what durable memory you created or strengthened
- what maintenance you performed and why it helped
- what you deferred and why

If no credible missed recall was found, say so clearly in Chinese.
If no credible durable extraction opportunity was found, say so clearly in Chinese.`;

  return `${rules}

## Key boot memories
${JSON.stringify(initialContext.bootBaseline, null, 2)}

## Guidance
${initialContext.guidance || '(guidance unavailable)'}

## Today's working context
${JSON.stringify({
    recall_review: {
      ...initialContext.recallReview,
      reviewed_queries: reviewedQueries,
    },
    recall_stats: {
      summary: (initialContext.recallStats.summary as Record<string, unknown>) || {},
      recent_queries: recentQueries,
    },
    write_activity: buildWriteDigest(initialContext.writeActivity),
    recent_diaries: initialContext.recentDiaries,
  }, null, 2)}`;
}

export async function runDreamAgentLoop(
  config: LlmConfig,
  initialContext: DreamInitialContext,
  options: DreamAgentRunOptions = {},
): Promise<DreamAgentResult> {
  const onEvent = options.onEvent;
  const eventContext = buildDreamEventContext(options.eventContext);
  const systemPrompt = buildDreamSystemPrompt(initialContext);
  const tools = buildDreamTools();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: 'Begin the dream review. Inspect today\'s recall evidence first, gather evidence before acting, and only then decide whether any durable extraction or maintenance is justified.',
    },
  ];
  const toolCalls: ToolCallLogEntry[] = [];

  for (let turn = 0; turn < 12; turn += 1) {
    await onEvent?.('llm_turn_started', { turn: turn + 1 });
    const response = await chatWithTools(config, messages, tools);
    const content = String(response.content || '');
    const rawToolCalls = Array.isArray(response.tool_calls) ? response.tool_calls : [];

    if (rawToolCalls.length === 0) {
      if (content.trim()) {
        await onEvent?.('assistant_note', { turn: turn + 1, message: content.trim() });
      }
      return {
        narrative: content.trim(),
        toolCalls,
        turns: turn + 1,
      };
    }

    await processDreamToolCalls({
      turn: turn + 1,
      content,
      rawToolCalls,
      messages,
      toolCalls,
      onEvent,
      executeTool: (name, args) => executeDreamTool(name, args, eventContext),
    });
  }

  return {
    narrative: 'Dream agent stopped after reaching the turn limit.',
    toolCalls,
    turns: 12,
  };
}
