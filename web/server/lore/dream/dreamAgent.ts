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

export interface HealthData {
  health: Record<string, unknown>;
  deadWrites: Record<string, unknown>;
  pathEffectiveness: Record<string, unknown>;
  recallStats: Record<string, unknown>;
  recallReview: Record<string, unknown>;
  writeStats: Record<string, unknown>;
  orphanCount: number;
}

interface RecentDiary {
  started_at: string | null;
  status: string;
  narrative: string | null;
  tool_calls: Array<{ tool: string; args: Record<string, unknown> }>;
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

export function buildDreamSystemPrompt(healthData: HealthData, recentDiaries: RecentDiary[] = []): string {
  const guidanceAvailable = Boolean(loadGuidanceFile());

  const recentQueries = Array.isArray((healthData.recallStats as any)?.recent_queries?.items)
    ? (healthData.recallStats as any).recent_queries.items.map((item: Record<string, unknown>) => ({
        query_text: item.query_text,
        merged: Number(item.merged_count ?? item.merged ?? 0),
        shown: Number(item.shown_count ?? item.shown ?? 0),
        used: Number(item.used_count ?? item.used ?? 0),
      }))
    : [];

  const reviewedQueries = Array.isArray((healthData.recallReview as any)?.reviewed_queries)
    ? (healthData.recallReview as any).reviewed_queries.map((item: Record<string, unknown>) => ({
        query_text: item.query_text,
        merged: Number(item.merged_count ?? 0),
        shown: Number(item.shown_count ?? 0),
        used: Number(item.used_count ?? 0),
        flags: Array.isArray(item.flags) ? item.flags : [],
        missed_recall_signals: Array.isArray(item.missed_recall_signals) ? item.missed_recall_signals : [],
      }))
    : [];

  const baselineLine = guidanceAvailable
    ? 'Judge everything against the fixed baseline: core://agent, core://soul, preferences://user, and guidance.'
    : 'Judge everything against the fixed baseline: core://agent, core://soul, and preferences://user.';

  const rules = `You are running a daily dream review.

Your priorities for today, in order:
1. Identify the strongest missed recall candidates
2. Extract or strengthen durable memory
3. Do only necessary maintenance

${baselineLine}

## Workflow

### 1. Review today's recall evidence
Start with recall_review, then use recall_stats for supporting context.

Focus first on the most suspicious items in reviewed_queries.
Pay special attention to these signals:
- zero_use
- high_merge_low_use
- retrieved_not_selected
- never_retrieved
- manual_read_after_weak_recall_proxy

Answer this first:
Which queries from today most likely failed to recall something that should have been recalled?

### 2. Build evidence before acting
For each suspicious query, gather evidence first, then decide whether to act.

Prefer these tools:
- get_query_recall_detail
- get_node_recall_detail
- get_node
- inspect_neighbors
- inspect_views
- get_path_effectiveness_detail
- get_node_write_history

First decide whether each candidate is:
- a recall path / ranking problem
- a memory node problem
- a durable extraction opportunity
- not actionable

Then classify every candidate into exactly one outcome:
- missed recall
- durable extraction
- maintenance
- no action

Do not modify anything when evidence is weak.

### 3. Handle missed recall first
Treat something as a main problem only when the evidence supports a real missed recall.
Noisy recall is not a problem by itself.
Only act on noise when it directly causes missed recall or blocks durable extraction.

### 4. Prefer durable extraction when it is real
Prefer create_node or update_node when one of these is true:
- the same conclusion appears repeatedly across multiple queries
- the conclusion is clearly reusable across sessions
- the conclusion fills an important gap not covered by the fixed baseline
- a user preference, stable fact, or collaboration rule has become durable enough to store

Do not create durable memory just to produce output.

### 5. Make the smallest useful change
Before any write, read the target node in full.

Preferred change order:
1. structure / node boundary
2. disclosure / glossary
3. priority
4. content

Every write must have a clear reason:
- it reduces missed recall
- or it captures durable memory
- or it supports necessary maintenance

### 6. Execution constraints
- Do not update, delete, or move core://agent, core://soul, or preferences://user
- Do not move other nodes onto those paths
- Do not change anything without sufficient evidence
- Do not do cleanup just to make the graph look tidy
- Do not lower priority only because something is frequently recalled but unused
- Prefer structure and boundary fixes before content edits
- Read more nodes than you modify

### 7. Write the diary
Write the final diary in natural Chinese.

Use exactly five sections with Chinese titles corresponding to:
1. reviewed recall requests
2. likely missed recalls and evidence
3. durable memory creation or reinforcement
4. maintenance-only changes
5. deferred issues and why

Requirements:
- Every change must map back to the evidence gathered earlier
- If no credible missed recall was found, explicitly say so in Chinese
- If no credible durable extraction opportunity was found, explicitly say so in Chinese
- Do not force changes just to appear productive`;

  const recentDiariesSection = recentDiaries.length
    ? `\n\n## Recent diaries\n${JSON.stringify(recentDiaries, null, 2)}`
    : '';

  return `${rules}\n\n## Health report\n${JSON.stringify({
    health_summary: healthData.health,
    dead_writes: healthData.deadWrites,
    path_effectiveness: healthData.pathEffectiveness,
    recall_stats: {
      ...(healthData.recallStats || {}),
      recent_queries: recentQueries,
    },
    recall_review: {
      ...(healthData.recallReview || {}),
      reviewed_queries: reviewedQueries,
    },
    write_stats: healthData.writeStats,
    orphan_count: healthData.orphanCount,
  }, null, 2)}${recentDiariesSection}`;
}

export async function runDreamAgentLoop(
  config: LlmConfig,
  healthData: HealthData,
  recentDiaries: RecentDiary[] = [],
  options: DreamAgentRunOptions = {},
): Promise<DreamAgentResult> {
  const onEvent = options.onEvent;
  const eventContext = buildDreamEventContext(options.eventContext);
  const systemPrompt = buildDreamSystemPrompt(healthData, recentDiaries);
  const tools = buildDreamTools();
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
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
