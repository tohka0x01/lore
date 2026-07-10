import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import { fetchJson, hasRecallConfig } from './api';

// ---- Message text extraction helpers ----

export function extractMessageText(message: any) {
  if (!message || typeof message !== 'object') return '';
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// ---- Project context detection ----

interface ProjectInfo {
  dir_name: string;
  repo_name: string | null;
}

function detectProjectInfo(): ProjectInfo {
  const dir_name = basename(process.cwd());

  let repo_name: string | null = null;
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

// ---- Lifecycle helpers ----

async function fetchLifecycleEvent(pluginCfg: any, body: Record<string, unknown>) {
  return fetchJson(pluginCfg, '/lifecycle/event', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function fetchStartupLifecycle(pluginCfg: any, sessionId: string | undefined) {
  return fetchLifecycleEvent(pluginCfg, {
    protocol_version: 'lore.lifecycle.v1',
    runtime: { runtime_id: 'pi', runtime_family: 'pi' },
    event: { name: 'session.start', native_name: 'session_start' },
    normalized: { session_id: sessionId },
    project: detectProjectInfo(),
  });
}

async function fetchPromptLifecycle(pluginCfg: any, prompt: string, sessionId: string | undefined) {
  if (!hasRecallConfig(pluginCfg)) return null;
  return fetchLifecycleEvent(pluginCfg, {
    protocol_version: 'lore.lifecycle.v1',
    runtime: { runtime_id: 'pi', runtime_family: 'pi' },
    event: { name: 'prompt.submit', native_name: 'before_agent_start' },
    normalized: { session_id: sessionId, prompt },
  });
}

function readReturnValue(response: any): any {
  return response?.host_output?.mode === 'return_value' && response.host_output.value
    ? response.host_output.value
    : null;
}

// ---- Session ID helper ----

function getSessionId(ctx: any): string | undefined {
  const manager = ctx?.sessionManager;
  if (manager && typeof manager.getSessionId === 'function') return manager.getSessionId();
  return typeof manager?.sessionId === 'string' ? manager.sessionId : undefined;
}

function sessionStartKey(sessionId: string | undefined): string {
  if (typeof sessionId === 'string' && sessionId.trim()) return sessionId.trim();
  return 'missing:default';
}

// ---- Hook registration ----

export function registerHooks(pi: any, pluginCfg: any) {
  // Prefer true session_start for boot; fall back to first before_agent_start once.
  const startedSessions = new Set<string>();

  pi.on('session_start', async (_event: any, ctx: any) => {
    if (pluginCfg.startupHealthcheck) {
      try {
        await fetchJson(pluginCfg, '/health', { method: 'GET' });
        ctx?.ui?.notify?.(`Lore connected: ${pluginCfg.baseUrl}`, 'info');
      } catch (error: any) {
        pi.logger?.warn?.(`lore: startup health check failed (${pluginCfg.baseUrl}): ${error.message}`);
      }
    }

    if (!pluginCfg.injectPromptGuidance) return;
    const sessionId = getSessionId(ctx);
    const key = sessionStartKey(sessionId);
    if (startedSessions.has(key)) return;
    try {
      // Fire session.start for boot/guidance; host may not consume return value here.
      await fetchStartupLifecycle(pluginCfg, sessionId);
      startedSessions.add(key);
    } catch (error: any) {
      pi.logger?.debug?.(`lore: lifecycle startup failed: ${error.message}`);
    }
  });

  pi.on('before_agent_start', async (event: any, ctx: any) => {
    const sessionId = getSessionId(ctx);
    const key = sessionStartKey(sessionId);
    const out: any = {};

    // Fallback: if session_start did not run (some embeds), start once here.
    if (pluginCfg.injectPromptGuidance && !startedSessions.has(key)) {
      try {
        const value = readReturnValue(await fetchStartupLifecycle(pluginCfg, sessionId));
        const systemContext = typeof value?.systemPromptAppend === 'string' ? value.systemPromptAppend.trim() : '';
        if (systemContext) {
          out.systemPrompt = [event?.systemPrompt || '', systemContext]
            .filter(Boolean)
            .join('\n\n');
        }
        startedSessions.add(key);
      } catch (error: any) {
        pi.logger?.debug?.(`lore: lifecycle startup failed: ${error.message}`);
      }
    }

    if (typeof event?.prompt === 'string' && event.prompt.trim()) {
      try {
        const value = readReturnValue(await fetchPromptLifecycle(pluginCfg, event.prompt, sessionId));
        if (value?.message) out.message = value.message;
      } catch (error: any) {
        pi.logger?.debug?.(`lore: lifecycle recall failed: ${error.message}`);
      }
    }

    return Object.keys(out).length > 0 ? out : undefined;
  });
}
