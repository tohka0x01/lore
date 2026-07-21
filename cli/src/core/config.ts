import { readJsonFile, writeJsonAtomic, ensureDir } from './fs.js';
import type { LoreConfig } from './types.js';
import path from 'node:path';

export async function readConfig(configPath: string): Promise<LoreConfig> {
  const data = await readJsonFile<LoreConfig>(configPath, {});
  return typeof data === 'object' && data ? data : {};
}

export async function writeConfig(
  configPath: string,
  patch: { base_url: string; api_token?: string },
  opts: {
    writeVersion?: boolean;
    releaseVersion?: string;
    dockerManaged?: boolean | null;
  } = {},
): Promise<LoreConfig> {
  await ensureDir(path.dirname(configPath));
  const current = await readConfig(configPath);
  const next: LoreConfig = { ...current, base_url: patch.base_url.replace(/\/$/, '') };
  if (patch.api_token) next.api_token = patch.api_token;
  if (opts.writeVersion && opts.releaseVersion) {
    next.installed_version = opts.releaseVersion;
  }
  if (opts.dockerManaged === true) next.docker_managed = true;
  else if (opts.dockerManaged === false) next.docker_managed = false;
  else if (next.docker_managed === undefined) next.docker_managed = false;
  await writeJsonAtomic(configPath, next);
  return next;
}
