/**
 * Codex SessionStart hook: forwards the lifecycle event to Lore.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

const LORE_CONFIG_FILE = path.join(os.homedir(), '.lore', 'config.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:18901';
const BOOT_TIMEOUT_MS = 8000;
const RUNTIME_FAMILY = 'codex';

function readLoreConfig() {
  try {
    return JSON.parse(fs.readFileSync(LORE_CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function pickString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function loadConfig() {
  const config = readLoreConfig();
  const baseUrl = pickString(process.env.LORE_CODEX_HOOK_BASE_URL)
    || pickString(config.base_url)
    || pickString(process.env.LORE_BASE_URL)
    || DEFAULT_BASE_URL;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiToken: pickString(config.api_token)
      || pickString(process.env.LORE_API_TOKEN)
      || pickString(process.env.API_TOKEN),
  };
}

function detectProjectInfo() {
  const dir_name = path.basename(process.cwd());
  let repo_name = null;
  try {
    const remote = execSync('git remote', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0];
    const remoteUrl = execSync(`git remote get-url ${remote}`, {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const match = remoteUrl.match(/\/([^/.]+?)(?:\.git)?$/);
    if (match?.[1]) repo_name = match[1];
  } catch {}
  return { dir_name, repo_name };
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function postLifecycle(body, timeoutMs) {
  const cfg = loadConfig();
  const headers = { 'content-type': 'application/json' };
  if (cfg.apiToken) headers.authorization = `Bearer ${cfg.apiToken}`;
  const response = await fetch(`${cfg.baseUrl}/api/lifecycle/event`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return response.json();
}

function writeHostOutput(response) {
  const output = response?.host_output;
  if (!output || output.mode === 'none' || output.value == null) return;
  if (output.mode === 'stdout_json') process.stdout.write(JSON.stringify(output.value));
  if (output.mode === 'stdout_text') process.stdout.write(String(output.value));
}

async function main() {
  let input = {};
  try {
    const raw = await readStdin();
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {}

  const sessionId = input.session_id || input.conversation_id || '';
  const lifecycle = await postLifecycle({
    protocol_version: 'lore.lifecycle.v1',
    runtime: { runtime_id: RUNTIME_FAMILY, runtime_family: RUNTIME_FAMILY },
    event: { name: 'session.start', native_name: 'SessionStart' },
    normalized: sessionId ? { session_id: sessionId } : {},
    project: detectProjectInfo(),
  }, BOOT_TIMEOUT_MS).catch(() => null);

  writeHostOutput(lifecycle);
}

main();
