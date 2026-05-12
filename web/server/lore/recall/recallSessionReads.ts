import { cached } from '../../cache/cacheAside';
import { cacheKey } from '../../cache/key';
import { CACHE_TTL, sessionTag } from '../../cache/policies';
import { sql } from '../../db';

export async function getSessionReadUris(sessionId: string | null | undefined): Promise<Set<string>> {
  if (!sessionId) return new Set<string>();
  const uris = await cached({
    key: cacheKey('session', [sessionId, 'read-uris']),
    ttlMs: CACHE_TTL.sessionReads,
    tags: [sessionTag(sessionId)],
  }, async () => getSessionReadUriList(sessionId));
  return new Set(uris);
}

async function getSessionReadUriList(sessionId: string): Promise<string[]> {
  const readUris = new Set<string>();
  const readResult = await sql(`SELECT uri FROM session_read_nodes WHERE session_id = $1`, [sessionId]);
  for (const row of readResult.rows) readUris.add(row.uri as string);
  return [...readUris];
}
