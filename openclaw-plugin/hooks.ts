import { execSync } from "node:child_process";
import { basename } from "node:path";
import { fetchJson, hasRecallConfig } from "./api";

// ---- Message text extraction helpers ----

export function extractMessageText(message: any) {
  if (!message || typeof message !== "object") return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: any) => block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function extractAssistantText(messages: any) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const lastAssistant = [...messages].reverse().find((message: any) => message?.role === "assistant");
  return extractMessageText(lastAssistant);
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
    const remote = execSync("git remote", { encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n")[0];
    const remoteUrl = execSync(`git remote get-url ${remote}`, {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = remoteUrl.match(/\/([^/.]+?)(?:\.git)?$/);
    if (match?.[1]) repo_name = match[1];
  } catch {}

  return { dir_name, repo_name };
}

// ---- Lifecycle helpers ----

async function fetchLifecycleEvent(pluginCfg: any, body: Record<string, unknown>) {
  return fetchJson(pluginCfg, "/lifecycle/event", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fetchStartupLifecycle(pluginCfg: any, sessionId: string | undefined) {
  return fetchLifecycleEvent(pluginCfg, {
    protocol_version: "lore.lifecycle.v1",
    runtime: { runtime_id: "openclaw", runtime_family: "openclaw" },
    event: { name: "session.start", native_name: "before_prompt_build" },
    normalized: { session_id: sessionId },
    project: detectProjectInfo(),
  });
}

async function fetchPromptLifecycle(pluginCfg: any, prompt: string, sessionId: string | undefined) {
  if (!hasRecallConfig(pluginCfg)) return null;
  return fetchLifecycleEvent(pluginCfg, {
    protocol_version: "lore.lifecycle.v1",
    runtime: { runtime_id: "openclaw", runtime_family: "openclaw" },
    event: { name: "prompt.submit", native_name: "before_prompt_build" },
    normalized: { session_id: sessionId, prompt },
  });
}

function readReturnValue(response: any): any {
  return response?.host_output?.mode === "return_value" && response.host_output.value
    ? response.host_output.value
    : null;
}

function sessionStartKey(sessionId: string | undefined): string {
  if (typeof sessionId === "string" && sessionId.trim()) return sessionId.trim();
  return "missing:default";
}

// ---- Hook registration ----

export function registerHooks(api: any, pluginCfg: any) {
  // Once-per-session gate: session.start must not re-fire on every prompt build.
  const startedSessions = new Set<string>();

  api.registerGatewayMethod("lore.status", async ({ respond }: any) => {
    try {
      const data = await fetchJson(pluginCfg, "/health", { method: "GET" });
      respond(true, { ok: true, baseUrl: pluginCfg.baseUrl, health: data });
    } catch (error: any) {
      respond(false, { ok: false, baseUrl: pluginCfg.baseUrl }, { code: "LORE_STATUS_FAILED", message: error.message });
    }
  });

  api.on(
    "gateway_start",
    async () => {
      if (!pluginCfg.startupHealthcheck) return;
      try {
        await fetchJson(pluginCfg, "/health", { method: "GET" });
        api.logger.info(`lore: startup health check ok (${pluginCfg.baseUrl})`);
      } catch (error: any) {
        api.logger.warn(`lore: startup health check failed (${pluginCfg.baseUrl}): ${error.message}`);
      }
    },
    { priority: 50 },
  );

  api.on("before_prompt_build", async (event: any) => {
    const ctx = event?.context;
    const sessionId = ctx?.sessionId;
    const startKey = sessionStartKey(sessionId);
    const out: any = {};

    if (pluginCfg.injectPromptGuidance && !startedSessions.has(startKey)) {
      try {
        const value = readReturnValue(await fetchStartupLifecycle(pluginCfg, sessionId));
        if (typeof value?.appendSystemContext === "string" && value.appendSystemContext.trim()) {
          out.appendSystemContext = value.appendSystemContext.trim();
        }
        // Mark started even on empty host_output to avoid startup recall storms.
        startedSessions.add(startKey);
      } catch (error: any) {
        api.logger.debug?.(`lore: lifecycle startup failed: ${error.message}`);
      }
    }

    if (typeof event?.prompt === "string" && event.prompt.trim()) {
      try {
        const value = readReturnValue(await fetchPromptLifecycle(pluginCfg, event.prompt, sessionId));
        if (typeof value?.prependContext === "string" && value.prependContext.trim()) {
          out.prependContext = value.prependContext.trim();
        }
      } catch (error: any) {
        api.logger.debug?.(`lore: lifecycle recall failed: ${error.message}`);
      }
    }

    return Object.keys(out).length > 0 ? out : undefined;
  });
}
