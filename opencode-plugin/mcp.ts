import type { Config } from '@opencode-ai/plugin';
import type { LorePluginConfig } from './config.js';

const DEFAULT_LOCAL_LORE_ORIGIN = 'http://127.0.0.1:18901';

function allowsLegacyLoreMcp(env: NodeJS.ProcessEnv): boolean {
  const value = env.LORE_OPENCODE_ALLOW_MCP?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

function parseRemoteMcpUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isLoreMcpName(name: string): boolean {
  return name === 'lore' || name.endsWith(':lore');
}

function isDuplicateLoreMcp(
  name: string,
  value: unknown,
  loreOrigins: ReadonlySet<string>,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as { type?: unknown; url?: unknown };
  if (entry.type !== 'remote') return false;

  const url = parseRemoteMcpUrl(entry.url);
  if (!url || url.pathname.replace(/\/+$/, '') !== '/api/mcp') return false;

  return isLoreMcpName(name) || loreOrigins.has(url.origin);
}

export function suppressDuplicateLoreMcp(
  mergedConfig: Config,
  loreConfig: LorePluginConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (allowsLegacyLoreMcp(env)) return;
  if (!mergedConfig.mcp || typeof mergedConfig.mcp !== 'object') return;

  const loreOrigins = new Set<string>([DEFAULT_LOCAL_LORE_ORIGIN]);
  const configuredOrigin = normalizeOrigin(loreConfig.baseUrl);
  if (configuredOrigin) loreOrigins.add(configuredOrigin);

  for (const [name, value] of Object.entries(mergedConfig.mcp)) {
    if (isDuplicateLoreMcp(name, value, loreOrigins)) delete mergedConfig.mcp[name];
  }
}
