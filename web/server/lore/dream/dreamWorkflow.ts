import { sql } from '../../db';

export interface DreamWorkflowEvent {
  id: number;
  diary_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string | null;
}

type DreamWorkflowListener = (event: DreamWorkflowEvent) => void;

const listeners = new Map<number, Set<DreamWorkflowListener>>();

function normalizeWorkflowRow(row: Record<string, unknown>): DreamWorkflowEvent {
  return {
    id: Number(row.id || 0),
    diary_id: Number(row.diary_id || 0),
    event_type: String(row.event_type || '').trim(),
    payload: (row.payload as Record<string, unknown>) || {},
    created_at: row.created_at ? new Date(row.created_at as string).toISOString() : null,
  };
}

export async function appendDreamWorkflowEvent(
  diaryId: number,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<DreamWorkflowEvent> {
  const result = await sql(
    `INSERT INTO dream_workflow_events (diary_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, diary_id, event_type, payload, created_at`,
    [diaryId, eventType, JSON.stringify(payload)],
  );
  const event = normalizeWorkflowRow(result.rows[0] as Record<string, unknown>);
  const diaryListeners = listeners.get(diaryId);
  if (diaryListeners) {
    for (const listener of diaryListeners) listener(event);
  }
  return event;
}

export async function listDreamWorkflowEvents(
  diaryId: number | string,
  sinceId = 0,
): Promise<DreamWorkflowEvent[]> {
  const result = await sql(
    `SELECT id, diary_id, event_type, payload, created_at
     FROM dream_workflow_events
     WHERE diary_id = $1 AND id > $2
     ORDER BY id ASC`,
    [Number(diaryId), Math.max(0, Number(sinceId) || 0)],
  );
  return result.rows.map((row) => normalizeWorkflowRow(row as Record<string, unknown>));
}

export function subscribeDreamWorkflow(
  diaryId: number,
  listener: DreamWorkflowListener,
): () => void {
  const diaryListeners = listeners.get(diaryId) || new Set<DreamWorkflowListener>();
  diaryListeners.add(listener);
  listeners.set(diaryId, diaryListeners);
  return () => {
    const next = listeners.get(diaryId);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) listeners.delete(diaryId);
  };
}

export function isDreamWorkflowTerminalEvent(eventType: string): boolean {
  return eventType === 'run_completed' || eventType === 'run_failed';
}
