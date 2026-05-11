/**
 * Claude Code UserPromptSubmit hook: injects <recall> context before each prompt.
 *
 * Receives JSON on stdin: { prompt, session_id, ... }
 * Outputs recall block text to stdout (Claude Code appends it as context).
 * Exit code 0 = success, non-zero = skip silently.
 *
 * Config: base_url from ~/.lore/config.json; api_token from env var or config.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const LORE_CONFIG_FILE = path.join(os.homedir(), ".lore", "config.json");
const DEFAULT_BASE_URL = "http://127.0.0.1:18901";

interface HookInput {
  prompt?: string;
  session_id?: string;
  [key: string]: any;
}

interface LoreConfig {
  base_url?: string;
  api_token?: string;
}

function readLoreConfig(): LoreConfig {
  try {
    return JSON.parse(fs.readFileSync(LORE_CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function loadConfig() {
  const config = readLoreConfig();
  return {
    baseUrl: (config.base_url || DEFAULT_BASE_URL).replace(/\/$/, ""),
    apiToken: config.api_token || "",
    timeoutMs: 10000,
    recallEnabled: true,
  };
}

function readCueList(item: any): string[] {
  const cues = Array.isArray(item?.cues) ? item.cues : [];
  return cues.map((x: any) => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 3);
}

function formatRecallBlock(items: any[], sessionId?: string, queryId?: string): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  const attrs = [sessionId && `session_id="${sessionId}"`, queryId && `query_id="${queryId}"`].filter(Boolean).join(" ");
  const lines = [attrs ? `<recall ${attrs}>` : "<recall>"];
  for (const item of items) {
    const score = Number.isFinite(item?.score_display) ? Number(item.score_display).toFixed(2) : String(item?.score ?? "");
    const cues = readCueList(item);
    const cueText = `${item?.read ? "read · " : ""}${cues.join(" · ")}`.trim();
    lines.push(`${score} | ${item?.uri || ""}${cueText ? ` | ${cueText}` : ""}`);
  }
  lines.push("</recall>");
  return lines.join("\n");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.recallEnabled) process.exit(0);

  let input: HookInput;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }

  const prompt = String(input.prompt || "").trim();
  if (!prompt) process.exit(0);

  const sessionId = input.session_id || "claude-code";

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.apiToken) headers.authorization = `Bearer ${cfg.apiToken}`;

    // Only send query + session_id; all display params come from server settings
    const response = await fetch(`${cfg.baseUrl}/api/browse/recall?client_type=claudecode`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: prompt,
        session_id: sessionId,
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });

    if (!response.ok) process.exit(0);

    const data = await response.json();
    const queryId = data?.event_log?.query_id || "";
    const block = formatRecallBlock(data?.items || [], sessionId, queryId);
    if (block) {
      process.stdout.write(block);
    }
  } catch {
    // Recall is best-effort; fail silently
  }
}

main();
