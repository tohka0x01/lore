import type { ClientType } from '../../auth';
import { getPool, sql } from '../../db';
import type { UpdateMutationReceipt } from '../contracts';
import type { TransactionClient } from '../core/types';
import { getGlossaryKeywords, getMemoryByPath, type MemoryRow } from './browseNodeData';
import { normalizeGlossaryKeywords } from '../search/glossary';
import { buildWriteEventBase } from './writeEventPayload';
import { scheduleWriteArtifactsRefresh } from './writeArtifactScheduling';
import { getNodeWriteHistory, logMemoryEvent, type FormattedEvent } from './writeEvents';

export type HistoryDiffKind = 'text' | 'value' | 'keyword_add' | 'keyword_remove' | 'keyword_list';

export interface HistoryDiff {
  field: string;
  kind: HistoryDiffKind;
  before: unknown;
  after: unknown;
}

export interface NormalizedHistoryEvent extends FormattedEvent {
  diffs: HistoryDiff[];
  rollback_supported: boolean;
  is_rollback: boolean;
  summary: string;
}

export interface NodeHistoryPayload {
  uri: string;
  domain: string;
  path: string;
  node_uuid: string;
  content: string;
  disclosure: string | null;
  priority: number;
  glossary_keywords: string[];
  events: NormalizedHistoryEvent[];
}

interface EventContext {
  source?: string;
  session_id?: string | null;
  client_type?: ClientType | null;
}

interface GetNodeHistoryOptions {
  domain?: string;
  path: string;
  limit?: number;
}

interface RollbackNodeToEventOptions {
  domain?: string;
  path: string;
  eventId: number;
}

function snapshotValue(snapshot: Record<string, unknown> | null, field: string): unknown {
  return snapshot ? snapshot[field] ?? null : null;
}

function addChangedSnapshotDiff(
  diffs: HistoryDiff[],
  beforeSnapshot: Record<string, unknown> | null,
  afterSnapshot: Record<string, unknown> | null,
  field: 'content' | 'disclosure' | 'priority',
  kind: HistoryDiffKind,
) {
  const before = snapshotValue(beforeSnapshot, field);
  const after = snapshotValue(afterSnapshot, field);
  if (before !== after) {
    diffs.push({ field, kind, before, after });
  }
}

function snapshotKeywordArray(snapshot: Record<string, unknown> | null): string[] | undefined {
  if (!snapshot || !Array.isArray(snapshot.glossary_keywords)) return undefined;
  return normalizeGlossaryKeywords(snapshot.glossary_keywords, 64);
}

function keywordSetChanged(before: string[] | undefined, after: string[] | undefined): boolean {
  if (!before && !after) return false;
  const beforeSet = new Set(before || []);
  const afterSet = new Set(after || []);
  if (beforeSet.size !== afterSet.size) return true;
  for (const keyword of beforeSet) {
    if (!afterSet.has(keyword)) return true;
  }
  return false;
}

function addChangedGlossaryDiff(
  diffs: HistoryDiff[],
  beforeSnapshot: Record<string, unknown> | null,
  afterSnapshot: Record<string, unknown> | null,
) {
  const before = snapshotKeywordArray(beforeSnapshot);
  const after = snapshotKeywordArray(afterSnapshot);
  if (keywordSetChanged(before, after)) {
    diffs.push({
      field: 'glossary_keywords',
      kind: 'keyword_list',
      before: before || [],
      after: after || [],
    });
  }
}

function eventTimeMs(event: FormattedEvent): number | null {
  if (!event.created_at) return null;
  const ms = new Date(event.created_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function compareHistoryEventsByNewest(left: NormalizedHistoryEvent, right: NormalizedHistoryEvent): number {
  const leftTime = eventTimeMs(left);
  const rightTime = eventTimeMs(right);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
  if (leftTime !== null && rightTime === null) return -1;
  if (leftTime === null && rightTime !== null) return 1;
  return right.id - left.id;
}

function sameWriteContext(base: FormattedEvent, event: FormattedEvent): boolean {
  return base.node_uuid === event.node_uuid
    && base.node_uri === event.node_uri
    && base.source === event.source
    && (base.session_id || null) === (event.session_id || null)
    && (base.client_type || null) === (event.client_type || null);
}

function isLegacyGlossaryEvent(event: FormattedEvent): boolean {
  return event.event_type === 'glossary_add' || event.event_type === 'glossary_remove';
}

function glossaryKeywordFromEvent(event: FormattedEvent): string {
  const snapshot = event.event_type === 'glossary_remove' ? event.before_snapshot : event.after_snapshot;
  const keyword = snapshot?.keyword;
  return typeof keyword === 'string' ? keyword.trim() : '';
}

function canGroupLegacyGlossary(base: FormattedEvent, event: FormattedEvent): boolean {
  if (!['create', 'update'].includes(base.event_type) || !isLegacyGlossaryEvent(event)) return false;
  if (!sameWriteContext(base, event)) return false;
  const baseTime = eventTimeMs(base);
  const eventTime = eventTimeMs(event);
  if (baseTime === null || eventTime === null) return false;
  return eventTime >= baseTime && eventTime - baseTime <= 2000;
}

function applyLegacyGlossaryEvent(keywords: string[], event: FormattedEvent): string[] {
  const keyword = glossaryKeywordFromEvent(event);
  if (!keyword) return keywords;
  if (event.event_type === 'glossary_add') {
    return keywords.includes(keyword) ? keywords : [...keywords, keyword];
  }
  return keywords.filter((item) => item !== keyword);
}

function groupLegacyGlossaryEvents(events: FormattedEvent[]): FormattedEvent[] {
  const grouped: FormattedEvent[] = [];
  for (const event of events) {
    const previous = grouped[grouped.length - 1];
    if (previous && canGroupLegacyGlossary(previous, event)) {
      const beforeSnapshot = previous.before_snapshot ? { ...previous.before_snapshot } : null;
      const afterSnapshot = previous.after_snapshot ? { ...previous.after_snapshot } : {};
      const beforeKeywords = snapshotKeywordArray(beforeSnapshot) || [];
      const currentAfterKeywords = snapshotKeywordArray(afterSnapshot) || beforeKeywords;
      const keyword = glossaryKeywordFromEvent(event);
      const nextAfterKeywords = applyLegacyGlossaryEvent(currentAfterKeywords, event);
      if (
        event.event_type === 'glossary_remove'
        && keyword
        && beforeSnapshot
        && !beforeKeywords.includes(keyword)
        && !currentAfterKeywords.includes(keyword)
      ) {
        beforeSnapshot.glossary_keywords = [...beforeKeywords, keyword];
      }
      afterSnapshot.glossary_keywords = nextAfterKeywords;
      previous.before_snapshot = beforeSnapshot;
      previous.after_snapshot = afterSnapshot;
      previous.details = {
        ...previous.details,
        legacy_glossary_grouped: true,
        merged_glossary_event_ids: [
          ...(
            Array.isArray(previous.details.merged_glossary_event_ids)
              ? previous.details.merged_glossary_event_ids
              : []
          ),
          event.id,
        ],
      };
      continue;
    }
    grouped.push({ ...event, details: { ...event.details } });
  }
  return grouped;
}

function numericRollbackId(details: Record<string, unknown>): number | null {
  const value = details.rollback_from_event_id;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { status: 422 });
}

function normalizePath(path: string): string {
  return String(path || '').replace(/^\/+|\/+$/g, '');
}

async function resolveCurrentNode(domain: string, path: string): Promise<MemoryRow> {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    throw notFound(`Path not found: ${domain}://${path}`);
  }

  const node = await getMemoryByPath(domain, normalizedPath);
  if (!node) {
    throw notFound(`Path not found: ${domain}://${normalizedPath}`);
  }
  return node;
}

function formatEventRow(row: Record<string, unknown>): FormattedEvent {
  const details = (row.details as Record<string, unknown>) || {};
  return {
    id: Number(row.id),
    event_type: row.event_type as string,
    node_uri: row.node_uri as string,
    node_uuid: (row.node_uuid as string | null) || null,
    source: row.source as string,
    session_id: (row.session_id as string | null) || null,
    client_type: null,
    before_snapshot: (row.before_snapshot as Record<string, unknown> | null) || null,
    after_snapshot: (row.after_snapshot as Record<string, unknown> | null) || null,
    details,
    created_at: row.created_at ? new Date(row.created_at as string).toISOString() : null,
  };
}

async function loadTargetEvent(eventId: number): Promise<FormattedEvent> {
  const result = await sql(
    `SELECT id, event_type, node_uri, node_uuid, source, session_id,
      before_snapshot, after_snapshot, details, created_at
     FROM memory_events
     WHERE id = $1
     LIMIT 1`,
    [eventId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound(`History event not found: ${eventId}`);
  }
  return formatEventRow(row);
}

function snapshotString(snapshot: Record<string, unknown>, field: 'content' | 'disclosure'): string | null | undefined {
  if (!(field in snapshot)) return undefined;
  const value = snapshot[field];
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function snapshotPriority(snapshot: Record<string, unknown>): number | undefined {
  if (!('priority' in snapshot)) return undefined;
  const value = Number(snapshot.priority);
  return Number.isFinite(value) ? value : undefined;
}

async function replaceGlossaryKeywords(
  client: TransactionClient,
  nodeUuid: string,
  keywords: unknown[],
): Promise<void> {
  await client.query(`DELETE FROM glossary_keywords WHERE node_uuid = $1`, [nodeUuid]);
  for (const keyword of normalizeGlossaryKeywords(keywords, 64)) {
    await client.query(
      `INSERT INTO glossary_keywords (keyword, node_uuid, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
      [keyword, nodeUuid],
    );
  }
}

export function normalizeHistoryEvent(event: FormattedEvent): NormalizedHistoryEvent {
  const diffs: HistoryDiff[] = [];
  const beforeSnapshot = event.before_snapshot;
  const afterSnapshot = event.after_snapshot;

  if (event.event_type === 'glossary_add') {
    diffs.push({
      field: 'glossary_keywords',
      kind: 'keyword_add',
      before: null,
      after: snapshotValue(afterSnapshot, 'keyword'),
    });
  } else if (event.event_type === 'glossary_remove') {
    diffs.push({
      field: 'glossary_keywords',
      kind: 'keyword_remove',
      before: snapshotValue(beforeSnapshot, 'keyword'),
      after: null,
    });
  } else if (event.event_type === 'move') {
    diffs.push({
      field: 'uri',
      kind: 'value',
      before: event.details.old_uri ?? snapshotValue(beforeSnapshot, 'uri'),
      after: event.details.new_uri ?? snapshotValue(afterSnapshot, 'uri'),
    });
  } else if (['update', 'create', 'delete'].includes(event.event_type)) {
    addChangedSnapshotDiff(diffs, beforeSnapshot, afterSnapshot, 'content', 'text');
    addChangedSnapshotDiff(diffs, beforeSnapshot, afterSnapshot, 'disclosure', 'text');
    addChangedSnapshotDiff(diffs, beforeSnapshot, afterSnapshot, 'priority', 'value');
    addChangedGlossaryDiff(diffs, beforeSnapshot, afterSnapshot);
  }

  const rollbackId = numericRollbackId(event.details);

  return {
    ...event,
    diffs,
    rollback_supported: event.event_type === 'update' || event.event_type === 'create',
    is_rollback: rollbackId !== null,
    summary: rollbackId !== null ? `rollback from #${rollbackId}` : event.event_type,
  };
}

export async function getNodeHistory({
  domain = 'core',
  path,
  limit = 50,
}: GetNodeHistoryOptions): Promise<NodeHistoryPayload> {
  const node = await resolveCurrentNode(domain, path);
  const [glossaryKeywords, history] = await Promise.all([
    getGlossaryKeywords(node.node_uuid),
    getNodeWriteHistory({ nodeUuid: node.node_uuid, limit }),
  ]);

  return {
    uri: `${node.domain}://${node.path}`,
    domain: node.domain,
    path: node.path,
    node_uuid: node.node_uuid,
    content: node.content,
    disclosure: node.disclosure,
    priority: node.priority,
    glossary_keywords: glossaryKeywords,
    events: groupLegacyGlossaryEvents(history.events)
      .map((historyEvent) => normalizeHistoryEvent(historyEvent))
      .sort(compareHistoryEventsByNewest),
  };
}

export async function rollbackNodeToEvent(
  { domain = 'core', path, eventId }: RollbackNodeToEventOptions,
  eventContext: EventContext = {},
): Promise<UpdateMutationReceipt> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw validationError('Invalid history event id');
  }

  const node = await resolveCurrentNode(domain, path);
  const targetEvent = await loadTargetEvent(eventId);
  if (targetEvent.node_uuid !== node.node_uuid) {
    throw validationError('History event belongs to a different node');
  }
  if (targetEvent.event_type !== 'create' && targetEvent.event_type !== 'update') {
    throw validationError(`Unsupported rollback event type: ${targetEvent.event_type}`);
  }

  const targetSnapshot = targetEvent.after_snapshot;
  if (!targetSnapshot || typeof targetSnapshot !== 'object') {
    throw validationError('History event has no usable after snapshot');
  }

  const targetContent = snapshotString(targetSnapshot, 'content');
  const hasTargetContent = typeof targetContent === 'string';
  const targetDisclosure = snapshotString(targetSnapshot, 'disclosure');
  const targetPriority = snapshotPriority(targetSnapshot);
  const hasGlossaryKeywords = Array.isArray(targetSnapshot.glossary_keywords);
  const normalizedPath = normalizePath(path);
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    if (hasTargetContent) {
      const currentMemoryResult = await client.query(
        `SELECT id, content
         FROM memories
         WHERE node_uuid = $1 AND deprecated = FALSE
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [node.node_uuid],
      );
      const currentMemory = currentMemoryResult.rows[0] as { id: number; content: string } | undefined;
      if (currentMemory) {
        await client.query(
          `UPDATE memories
           SET deprecated = TRUE
           WHERE id = $1`,
          [currentMemory.id],
        );
      }
      const newMemoryResult = await client.query(
        `INSERT INTO memories (node_uuid, content, deprecated, migrated_to, created_at)
         VALUES ($1, $2, FALSE, NULL, NOW())
         RETURNING id`,
        [node.node_uuid, targetContent],
      );
      const newMemoryId = (newMemoryResult.rows[0] as { id?: number } | undefined)?.id;
      if (currentMemory) {
        await client.query(
          `UPDATE memories
           SET migrated_to = $2
           WHERE id = $1`,
          [currentMemory.id, newMemoryId],
        );
      }
    }

    if (targetPriority !== undefined || targetDisclosure !== undefined) {
      await client.query(
        `UPDATE edges
         SET priority = COALESCE($3, priority),
             disclosure = CASE WHEN $5::boolean THEN $4 ELSE disclosure END
         FROM paths
         WHERE paths.edge_id = edges.id AND paths.domain = $1 AND paths.path = $2`,
        [domain, normalizedPath, targetPriority ?? null, targetDisclosure ?? null, targetDisclosure !== undefined],
      );
    }

    if (hasGlossaryKeywords) {
      await replaceGlossaryKeywords(client, node.node_uuid, targetSnapshot.glossary_keywords as unknown[]);
    }

    const afterContent = hasTargetContent ? targetContent : node.content;
    const afterDisclosure = targetDisclosure !== undefined ? targetDisclosure : node.disclosure;
    const afterPriority = targetPriority !== undefined ? targetPriority : node.priority;

    await logMemoryEvent({
      client,
      event_type: 'update',
      ...buildWriteEventBase({
        node_uri: `${domain}://${normalizedPath}`,
        node_uuid: node.node_uuid,
        domain,
        path: normalizedPath,
        eventContext,
      }),
      before_snapshot: {
        content: node.content,
        disclosure: node.disclosure,
        priority: node.priority,
      },
      after_snapshot: {
        content: afterContent,
        disclosure: afterDisclosure,
        priority: afterPriority,
      },
      details: {
        rollback_from_event_id: targetEvent.id,
        rollback_from_created_at: targetEvent.created_at,
        rollback_from_node_uri: targetEvent.node_uri,
      },
    });

    await client.query('COMMIT');
    scheduleWriteArtifactsRefresh({ domain, path: normalizedPath });

    return {
      success: true,
      operation: 'update',
      uri: `${domain}://${normalizedPath}`,
      path: normalizedPath,
      node_uuid: node.node_uuid,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
