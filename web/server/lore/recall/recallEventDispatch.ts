import crypto from 'crypto';
import type { ClientType } from '../../auth';
import type { RecallDisplayItem } from './recallDisplay';
import { logRecallEvents } from './recallEventLog';

export interface RecallEventLogState {
  query_id: string;
  enabled: boolean;
}

interface StartRecallEventLogArgs {
  queryText: string;
  durationMs?: number | null;
  exactRows: Record<string, unknown>[];
  glossarySemanticRows: Record<string, unknown>[];
  denseRows: Record<string, unknown>[];
  lexicalRows: Record<string, unknown>[];
  rankedCandidates: RecallDisplayItem[];
  displayedItems: RecallDisplayItem[];
  retrievalMeta: Record<string, unknown> | null;
  sessionId?: string | null;
  clientType?: ClientType | null;
  errorLabel: string;
}

export function startRecallEventLog({
  queryText,
  durationMs = null,
  exactRows,
  glossarySemanticRows,
  denseRows,
  lexicalRows,
  rankedCandidates,
  displayedItems,
  retrievalMeta,
  sessionId = null,
  clientType = null,
  errorLabel,
}: StartRecallEventLogArgs): RecallEventLogState {
  const eventLog = { query_id: crypto.randomUUID(), enabled: true };
  logRecallEvents({
    queryId: eventLog.query_id,
    queryText,
    durationMs,
    exactRows,
    glossarySemanticRows,
    denseRows,
    lexicalRows,
    rankedCandidates,
    displayedItems,
    retrievalMeta,
    sessionId,
    clientType,
  }).catch((error: unknown) => {
    console.error(errorLabel, error);
  });
  return eventLog;
}
