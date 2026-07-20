import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChannelId, NeedInstall } from './types.js';
import type { ExecFn } from './exec.js';
import { createExec } from './exec.js';

const DEFAULT_REPO = 'FFatTiger/lore';

const ARTIFACT_MAP: Record<ChannelId, string> = {
  claudecode: 'lore-claudecode.zip',
  codex: 'lore-codex.zip',
  pi: 'lore-pi.zip',
  openclaw: 'lore-openclaw.zip',
  hermes: 'lore-hermes.zip',
  opencode: 'lore-opencode.zip',
};

export function artifactName(id: ChannelId): string {
  return ARTIFACT_MAP[id];
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Port of scripts/install.sh download_artifact + download_or_skip.
 *
 * needInstall:
 * - 0 → always download
 * - 2 (and other non-0) → reuse dest if it exists as a directory; else download
 *   when releaseVersion is set, else fail
 */
export async function downloadOrSkip(opts: {
  channel: ChannelId;
  dest: string;
  releaseVersion?: string;
  needInstall: NeedInstall;
  repo?: string;
  run?: ExecFn;
}): Promise<boolean> {
  const { channel, dest, needInstall } = opts;
  const releaseVersion = opts.releaseVersion?.trim() || '';

  if (needInstall !== 0) {
    if (await isDirectory(dest)) {
      return true;
    }
    if (!releaseVersion) {
      return false;
    }
    // fall through to download
  }

  return downloadArtifact({
    channel,
    dest,
    releaseVersion,
    repo: opts.repo,
    run: opts.run,
  });
}

async function downloadArtifact(opts: {
  channel: ChannelId;
  dest: string;
  releaseVersion: string;
  repo?: string;
  run?: ExecFn;
}): Promise<boolean> {
  const artifact = artifactName(opts.channel);
  if (!artifact) return false;
  if (!opts.releaseVersion) return false;

  const repo = opts.repo || DEFAULT_REPO;
  const url = `https://github.com/${repo}/releases/download/${opts.releaseVersion}/${artifact}`;
  const run = opts.run ?? createExec();

  const tmpRoot = `${opts.dest}.tmp`;
  const zipPath = path.join(tmpRoot, artifact);
  const extracted = path.join(tmpRoot, 'extracted');

  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.mkdir(tmpRoot, { recursive: true });

    const curlRes = await run(['curl', '-fsSL', url, '-o', zipPath]);
    if (curlRes.code !== 0) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      return false;
    }

    const unzipRes = await run(['unzip', '-qo', zipPath, '-d', extracted]);
    if (unzipRes.code !== 0) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      return false;
    }

    await fs.rm(opts.dest, { recursive: true, force: true });
    await fs.rename(extracted, opts.dest);
    await fs.rm(tmpRoot, { recursive: true, force: true });
    return true;
  } catch {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    return false;
  }
}
