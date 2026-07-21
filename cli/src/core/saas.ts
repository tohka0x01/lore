/** Default Loremem SaaS API base. Override with LORE_SAAS_BASE_URL. */
export function defaultSaasBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.LORE_SAAS_BASE_URL?.trim();
  return (fromEnv || 'https://api.loremem.com').replace(/\/$/, '');
}

export function isSaasBaseUrl(url: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!url) return false;
  const normalized = url.replace(/\/$/, '').toLowerCase();
  return normalized === defaultSaasBaseUrl(env).toLowerCase();
}

export type ServerKind = 'saas' | 'external' | 'docker' | 'unknown';

export function classifyServerKind(opts: {
  baseUrl?: string;
  dockerManaged?: boolean;
  env?: NodeJS.ProcessEnv;
}): ServerKind {
  if (opts.dockerManaged) return 'docker';
  if (!opts.baseUrl) return 'unknown';
  if (isSaasBaseUrl(opts.baseUrl, opts.env)) return 'saas';
  return 'external';
}
