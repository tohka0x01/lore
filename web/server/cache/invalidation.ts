import { clearApplicationCache, invalidateCacheTags } from './cacheAside';
import { CACHE_TAG, nodeTag, sessionTag } from './policies';

export async function invalidateMemoryCaches(domain?: string, path?: string): Promise<void> {
  const tags = [
    CACHE_TAG.memory,
    CACHE_TAG.domains,
    CACHE_TAG.node,
    CACHE_TAG.glossary,
    CACHE_TAG.boot,
    CACHE_TAG.recallAnalytics,
    CACHE_TAG.feedbackAnalytics,
    CACHE_TAG.writeAnalytics,
  ];
  if (domain && path) tags.push(nodeTag(domain, path));
  await invalidateCacheTags(tags);
}

export async function invalidateSettingsCaches(): Promise<void> {
  await invalidateCacheTags([CACHE_TAG.settings, CACHE_TAG.boot]);
}

export async function invalidateSessionCaches(sessionId: string): Promise<void> {
  await invalidateCacheTags([sessionTag(sessionId)]);
}

export async function clearAllCachesAfterRestore(): Promise<void> {
  await clearApplicationCache();
}
