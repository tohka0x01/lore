import { cacheTag } from './key';

export const CACHE_TTL = {
  settings: 300_000,
  boot: 300_000,
  domains: 600_000,
  node: 300_000,
  glossary: 600_000,
  embeddingRedis: 2_592_000_000,
  embeddingLocal: 604_800_000,
  recallRetrieval: 60_000,
  queryTokens: 300_000,
  recallAnalytics: 300_000,
  feedbackAnalytics: 600_000,
  writeAnalytics: 600_000,
  sessionReads: 300_000,
} as const;

export const CACHE_TAG = {
  settings: cacheTag('settings'),
  boot: cacheTag('boot'),
  memory: cacheTag('memory'),
  domains: cacheTag('domains'),
  node: cacheTag('node'),
  glossary: cacheTag('glossary'),
  embedding: cacheTag('embedding'),
  recallRetrieval: cacheTag('recall:retrieval'),
  queryTokens: cacheTag('query:tokens'),
  recallAnalytics: cacheTag('analytics:recall'),
  feedbackAnalytics: cacheTag('analytics:feedback'),
  writeAnalytics: cacheTag('analytics:write'),
  session: cacheTag('session'),
  maintenance: cacheTag('maintenance'),
};

export function nodeTag(domain: string, path: string): string {
  return cacheTag('node', `${domain}://${path}`);
}

export function sessionTag(sessionId: string): string {
  return cacheTag('session', sessionId);
}
