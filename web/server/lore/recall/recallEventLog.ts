import crypto from 'crypto';
import { getPool, sql } from '../../db';
import type { ClientType } from '../../auth';
import { clampLimit } from '../core/utils';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function intervalDaysSql(days: unknown): number {
  return clampLimit(days, 1, 90, 7);
}

export function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function normalizeUriList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function truncateText(value: unknown, maxChars = 280): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}\u2026` : text;
}

function addValues(values: unknown[], row: unknown[], trailingSql: string[] = []): string {
  const start = values.length + 1;
  values.push(...row);
  const placeholders = row.map((_, index) => `$${start + index}`);
  return `(${[...placeholders, ...trailingSql].join(', ')})`;
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

interface SignalRow {
  uri?: string;
  view_type?: string;
  exact_score?: number;
  weight?: number;
  glossary_semantic_score?: number;
  semantic_score?: number;
  lexical_score?: number;
  keyword?: string;
  path_exact_hit?: boolean;
  glossary_exact_hit?: boolean;
  glossary_text_hit?: boolean;
  query_contains_glossary_hit?: boolean;
  fts_hit?: boolean;
  text_hit?: boolean;
  uri_hit?: boolean;
  metadata?: Record<string, unknown>;
}

interface RankedCandidate {
  uri?: string;
  score?: number;
  matched_on?: string[];
  score_breakdown?: Record<string, unknown> | null;
}

interface DisplayedItem {
  uri?: string;
}

interface RecallEventInsertRow {
  query_text: string;
  node_uri: string;
  retrieval_path: string;
  view_type: string | null;
  pre_rank_score: number | null;
  final_rank_score: number | null;
  selected: boolean;
  metadata: Record<string, unknown>;
  query_id: string;
  session_id: string | null;
  client_type: ClientType | null;
  ranked_position: number | null;
  displayed_position: number | null;
}

interface RecallCandidateInsertRow {
  query_id: string;
  node_uri: string;
  client_type: ClientType | null;
  final_rank_score: number | null;
  selected: boolean;
  ranked_position: number | null;
  displayed_position: number | null;
}

interface LogRecallEventsArgs {
  queryId?: string | null;
  queryText: string;
  durationMs?: number | null;
  exactRows?: SignalRow[];
  glossarySemanticRows?: SignalRow[];
  denseRows?: SignalRow[];
  lexicalRows?: SignalRow[];
  rankedCandidates?: RankedCandidate[];
  displayedItems?: DisplayedItem[];
  retrievalMeta?: Record<string, unknown> | null;
  sessionId?: string | null;
  clientType?: ClientType | null;
}

export async function logRecallEvents({
  queryId = null,
  queryText,
  durationMs = null,
  exactRows = [],
  glossarySemanticRows = [],
  denseRows = [],
  lexicalRows = [],
  rankedCandidates = [],
  displayedItems = [],
  retrievalMeta = null,
  sessionId = null,
  clientType = null,
}: LogRecallEventsArgs): Promise<{ inserted_count: number; query_id?: string }> {
  const query = String(queryText || '').trim();
  if (!query) return { inserted_count: 0 };

  const effectiveQueryId = String(queryId || '').trim() || crypto.randomUUID();
  const safeDurationMs = Number.isFinite(Number(durationMs)) ? Math.max(0, Math.round(Number(durationMs))) : null;
  const rankedMap = new Map(
    rankedCandidates.map((item, index) => [
      String(item.uri || '').trim(),
      { ...item, rank: index + 1 },
    ]),
  );
  const displayedMap = new Map(
    displayedItems.map((item, index) => [
      String(item.uri || '').trim(),
      { ...item, display_rank: index + 1 },
    ]),
  );

  const candidateRows: RecallCandidateInsertRow[] = [];
  const seenCandidateUris = new Set<string>();
  for (const item of rankedCandidates) {
    const uri = String(item?.uri || '').trim();
    if (!uri || seenCandidateUris.has(uri)) continue;
    seenCandidateUris.add(uri);
    const ranked = rankedMap.get(uri) || null;
    const displayed = displayedMap.get(uri) || null;
    candidateRows.push({
      query_id: effectiveQueryId,
      node_uri: uri,
      client_type: clientType,
      final_rank_score: asNumber(ranked?.score),
      selected: Boolean(displayed),
      ranked_position: ranked?.rank || null,
      displayed_position: displayed?.display_rank || null,
    });
  }

  const shownCount = candidateRows.filter((row) => row.selected).length;
  const rows: RecallEventInsertRow[] = [];

  for (const row of exactRows) {
    const uri = String(row?.uri || '').trim();
    if (!uri) continue;
    const ranked = rankedMap.get(uri) || null;
    const displayed = displayedMap.get(uri) || null;
    rows.push({
      query_text: query,
      node_uri: uri,
      retrieval_path: 'exact',
      view_type: row?.view_type || null,
      pre_rank_score: asNumber(Number(row?.exact_score || 0) * Number(row?.weight || 1)),
      final_rank_score: asNumber(ranked?.score),
      selected: Boolean(displayed),
      query_id: effectiveQueryId,
      session_id: sessionId || null,
      client_type: clientType,
      ranked_position: ranked?.rank || null,
      displayed_position: displayed?.display_rank || null,
      metadata: {
        query_id: effectiveQueryId,
        session_id: sessionId || null,
        raw_score: asNumber(row?.exact_score),
        source_weight: asNumber(row?.weight),
        ranked_position: ranked?.rank || null,
        displayed_position: (displayed as Record<string, unknown>)?.display_rank || null,
        retrieval_meta: retrievalMeta || null,
        client_type: clientType,
        cue_terms: asObject(row?.metadata).cue_terms || [],
        glossary_terms: asObject(row?.metadata).glossary_terms || [],
        matched_on: ranked?.matched_on || ['exact'],
        score_breakdown: ranked?.score_breakdown || null,
        exact_flags: {
          path_exact_hit: row?.path_exact_hit === true,
          glossary_exact_hit: row?.glossary_exact_hit === true,
          glossary_text_hit: row?.glossary_text_hit === true,
          query_contains_glossary_hit: row?.query_contains_glossary_hit === true,
        },
      },
    });
  }

  for (const row of glossarySemanticRows) {
    const uri = String(row?.uri || '').trim();
    if (!uri) continue;
    const ranked = rankedMap.get(uri) || null;
    const displayed = displayedMap.get(uri) || null;
    rows.push({
      query_text: query,
      node_uri: uri,
      retrieval_path: 'glossary_semantic',
      view_type: null,
      pre_rank_score: asNumber(row?.glossary_semantic_score),
      final_rank_score: asNumber(ranked?.score),
      selected: Boolean(displayed),
      query_id: effectiveQueryId,
      session_id: sessionId || null,
      client_type: clientType,
      ranked_position: ranked?.rank || null,
      displayed_position: displayed?.display_rank || null,
      metadata: {
        query_id: effectiveQueryId,
        session_id: sessionId || null,
        raw_score: asNumber(row?.glossary_semantic_score),
        source_weight: 1,
        ranked_position: ranked?.rank || null,
        displayed_position: (displayed as Record<string, unknown>)?.display_rank || null,
        retrieval_meta: retrievalMeta || null,
        client_type: clientType,
        cue_terms: [String(row?.keyword || '').trim()].filter(Boolean),
        glossary_terms: [String(row?.keyword || '').trim()].filter(Boolean),
        matched_on: ranked?.matched_on || ['glossary_semantic'],
        score_breakdown: ranked?.score_breakdown || null,
      },
    });
  }

  for (const row of denseRows) {
    const uri = String(row?.uri || '').trim();
    if (!uri) continue;
    const ranked = rankedMap.get(uri) || null;
    const displayed = displayedMap.get(uri) || null;
    rows.push({
      query_text: query,
      node_uri: uri,
      retrieval_path: 'dense',
      view_type: row?.view_type || null,
      pre_rank_score: asNumber(Number(row?.semantic_score || 0) * Number(row?.weight || 1)),
      final_rank_score: asNumber(ranked?.score),
      selected: Boolean(displayed),
      query_id: effectiveQueryId,
      session_id: sessionId || null,
      client_type: clientType,
      ranked_position: ranked?.rank || null,
      displayed_position: displayed?.display_rank || null,
      metadata: {
        query_id: effectiveQueryId,
        session_id: sessionId || null,
        raw_score: asNumber(row?.semantic_score),
        source_weight: asNumber(row?.weight),
        ranked_position: ranked?.rank || null,
        displayed_position: (displayed as Record<string, unknown>)?.display_rank || null,
        retrieval_meta: retrievalMeta || null,
        client_type: clientType,
        cue_terms: asObject(row?.metadata).cue_terms || [],
        llm_refined: asObject(row?.metadata).llm_refined === true,
        matched_on: ranked?.matched_on || ['dense'],
        score_breakdown: ranked?.score_breakdown || null,
      },
    });
  }

  for (const row of lexicalRows) {
    const uri = String(row?.uri || '').trim();
    if (!uri) continue;
    const ranked = rankedMap.get(uri) || null;
    const displayed = displayedMap.get(uri) || null;
    rows.push({
      query_text: query,
      node_uri: uri,
      retrieval_path: 'lexical',
      view_type: row?.view_type || null,
      pre_rank_score: asNumber(Number(row?.lexical_score || 0) * Number(row?.weight || 1)),
      final_rank_score: asNumber(ranked?.score),
      selected: Boolean(displayed),
      query_id: effectiveQueryId,
      session_id: sessionId || null,
      client_type: clientType,
      ranked_position: ranked?.rank || null,
      displayed_position: displayed?.display_rank || null,
      metadata: {
        query_id: effectiveQueryId,
        session_id: sessionId || null,
        raw_score: asNumber(row?.lexical_score),
        source_weight: asNumber(row?.weight),
        ranked_position: ranked?.rank || null,
        displayed_position: (displayed as Record<string, unknown>)?.display_rank || null,
        retrieval_meta: retrievalMeta || null,
        client_type: clientType,
        cue_terms: asObject(row?.metadata).cue_terms || [],
        llm_refined: asObject(row?.metadata).llm_refined === true,
        matched_on: ranked?.matched_on || ['lexical'],
        score_breakdown: ranked?.score_breakdown || null,
        lexical_flags: {
          fts_hit: row?.fts_hit === true,
          text_hit: row?.text_hit === true,
          uri_hit: row?.uri_hit === true,
        },
      },
    });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO recall_queries (
          query_id,
          query_text,
          session_id,
          client_type,
          merged_count,
          shown_count,
          used_count,
          duration_ms,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 0, $7, NOW()
        )
        ON CONFLICT (query_id) DO UPDATE SET
          query_text = EXCLUDED.query_text,
          session_id = EXCLUDED.session_id,
          client_type = EXCLUDED.client_type,
          merged_count = EXCLUDED.merged_count,
          shown_count = EXCLUDED.shown_count,
          duration_ms = EXCLUDED.duration_ms
      `,
      [
        effectiveQueryId,
        query,
        sessionId || null,
        clientType,
        candidateRows.length,
        shownCount,
        safeDurationMs,
      ],
    );

    if (candidateRows.length > 0) {
      const values: unknown[] = [];
      const placeholders = candidateRows.map((row) => addValues(values, [
        row.query_id,
        row.node_uri,
        row.client_type,
        row.final_rank_score,
        row.selected,
        false,
        row.ranked_position,
        row.displayed_position,
      ], ['NOW()']));

      await client.query(
        `
          INSERT INTO recall_query_candidates (
            query_id,
            node_uri,
            client_type,
            final_rank_score,
            selected,
            used_in_answer,
            ranked_position,
            displayed_position,
            created_at
          ) VALUES ${placeholders.join(', ')}
          ON CONFLICT (query_id, node_uri) DO UPDATE SET
            client_type = EXCLUDED.client_type,
            final_rank_score = EXCLUDED.final_rank_score,
            selected = EXCLUDED.selected,
            ranked_position = EXCLUDED.ranked_position,
            displayed_position = EXCLUDED.displayed_position
        `,
        values,
      );
    }

    if (rows.length > 0) {
      const values: unknown[] = [];
      const placeholders = rows.map((row) => addValues(values, [
        row.query_text,
        row.node_uri,
        row.retrieval_path,
        row.view_type,
        row.pre_rank_score,
        row.final_rank_score,
        row.selected,
        false,
        JSON.stringify(row.metadata || {}),
        row.query_id,
        row.session_id,
        row.client_type,
        row.ranked_position,
        row.displayed_position,
      ], ['NOW()']));

      await client.query(
      `
        INSERT INTO recall_events (
          query_text,
          node_uri,
          retrieval_path,
          view_type,
          pre_rank_score,
          final_rank_score,
          selected,
          used_in_answer,
          metadata,
          query_id,
          session_id,
          client_type,
          ranked_position,
          displayed_position,
          created_at
        ) VALUES ${placeholders.join(', ')}
      `,
        values,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { inserted_count: rows.length, query_id: effectiveQueryId };
}

// ---------------------------------------------------------------------------
// Mark events used in answer
// ---------------------------------------------------------------------------

interface MarkUsedArgs {
  queryId?: string;
  sessionId?: string | null;
  nodeUris?: string[];
  assistantText?: string;
  source?: string;
  success?: boolean;
  clientType?: ClientType | null;
}

export async function markRecallEventsUsedInAnswer({
  queryId,
  sessionId = null,
  nodeUris = [],
  assistantText = '',
  source = 'agent_end',
  success = true,
  clientType = null,
}: MarkUsedArgs = {}): Promise<{ updated_count: number; query_id: string | null; node_uris?: string[] }> {
  const safeQueryId = String(queryId || '').trim();
  if (!safeQueryId || success !== true) return { updated_count: 0, query_id: safeQueryId || null };

  const safeUris = normalizeUriList(nodeUris);
  const metadataPatch: Record<string, unknown> = {
    answer_signal_source: source,
    answer_session_id: sessionId || null,
    answer_marked_at: new Date().toISOString(),
    answer_client_type: clientType,
  };
  const preview = truncateText(assistantText, 280);
  if (preview) metadataPatch.answer_preview = preview;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const candidateResult = await client.query(
      `
        UPDATE recall_query_candidates
        SET used_in_answer = TRUE
        WHERE query_id = $1
          AND selected = TRUE
          AND used_in_answer = FALSE
          AND ($2::text[] IS NULL OR node_uri = ANY($2::text[]))
        RETURNING node_uri
      `,
      [safeQueryId, safeUris.length > 0 ? safeUris : null],
    );

    await client.query(
      `
        UPDATE recall_queries
        SET used_count = (
          SELECT COUNT(*)::integer
          FROM recall_query_candidates
          WHERE query_id = $1
            AND used_in_answer = TRUE
        )
        WHERE query_id = $1
      `,
      [safeQueryId],
    );

    await client.query(
      `
        UPDATE recall_events
        SET
          used_in_answer = TRUE,
          metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
        WHERE query_id = $1
          AND selected = TRUE
          AND ($2::text[] IS NULL OR node_uri = ANY($2::text[]))
      `,
      [
        safeQueryId,
        safeUris.length > 0 ? safeUris : null,
        JSON.stringify(metadataPatch),
      ],
    );

    await client.query('COMMIT');

    return {
      updated_count: Number(candidateResult.rowCount || 0),
      query_id: safeQueryId,
      node_uris: safeUris,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
