export const SETUP_STATUS_CHANGED_EVENT = 'lore:setup-status-changed';
export const BOOT_STATUS_CHANGED_EVENT = SETUP_STATUS_CHANGED_EVENT;

export type BootNodeRole = 'agent' | 'soul' | 'user';
export type BootNodeState = 'missing' | 'empty' | 'initialized';
export type BootOverallState = 'uninitialized' | 'partial' | 'complete';
export type BootNodeScope = 'global' | 'client';
export type BootClientType = 'claudecode' | 'openclaw' | 'hermes' | 'codex' | 'pi';
export type BootSaveStatus = 'created' | 'updated' | 'unchanged' | 'failed';
export type BootDraftStatus = 'generated' | 'failed';
export type SetupStepId = string;

export const CHANNEL_AGENTS_SETUP_STEP_ID = 'channel_agents';
export const CHANNEL_AGENTS_SETUP_PATH = '/setup/channels';

const STATIC_SETUP_STEP_PATHS = {
  embedding: '/setup/embedding',
  [CHANNEL_AGENTS_SETUP_STEP_ID]: CHANNEL_AGENTS_SETUP_PATH,
} as const;

export const GLOBAL_BOOT_URIS = [
  'core://agent',
  'core://soul',
  'preferences://user',
] as const;

export const CLIENT_BOOT_URIS = [
  'core://agent/claudecode',
  'core://agent/openclaw',
  'core://agent/hermes',
  'core://agent/codex',
  'core://agent/pi',
] as const;

export const DEFAULT_BOOT_CONTENT: Record<string, string> = {
  'core://agent': `# 工作流约束

开始行动前先遵守当前仓库和运行环境的指令。先读相关文件，再做最小安全改动，最后用最小有效检查验证结果。

涉及删除、凭证、外部副作用、大范围重写或难以回滚的操作时，先向用户确认。保护用户已有状态、生成产物和无关代码。

编码任务优先使用项目已有脚本和约定。交付时说明改动文件、验证结果和真实阻塞。`,
  'core://soul': `# 人格基线

表达直接、简洁、有用。先给答案，再补充真正帮助决策的背景。

保持冷静的工程专家风格。根据任务复杂度控制细节，去掉客套和填充，结尾落到明确结果或下一步动作。`,
  'preferences://user': `# 稳定用户画像

用户偏好高效率、低摩擦的协作。简单任务直接完成，回复短而清楚。

复杂工作只同步关键阻塞、重要取舍、验证结果和最终产出。影响安全、范围或不可逆状态的决策需要先问清楚。`,
  'core://agent/claudecode': `# Claude Code 运行时约束

Claude Code 会把这个节点与 core://agent 一起加载。以本地项目指令和当前可用工具为准。

编辑前先读文件，做外科手术式改动，代码变更后运行相关项目检查。Claude Code 专属 hooks、slash commands、MCP 行为和本地工作流约定都记录在这里。`,
  'core://agent/openclaw': `# OpenClaw 运行时约束

OpenClaw 会把这个节点与 core://agent 一起加载。这里记录 OpenClaw 专属工具路由、插件行为和运行时约定。

共享工作流规则放在 core://agent。这个节点只记录 OpenClaw 的运行环境差异。`,
  'core://agent/hermes': `# Hermes 运行时约束

Hermes 会把这个节点与 core://agent 一起加载。这里记录 Hermes 专属 memory provider 行为、可用工具、传输细节和运行时约定。

宿主环境指引要具体到启动时可以直接执行。`,
  'core://agent/codex': `# Codex 运行时约束

Codex 会把这个节点与 core://agent 一起加载。这里记录 Codex 专属插件行为、hooks、MCP 使用方式和本地编码工作流预期。

通过 Codex 使用 Lore 工具时，boot、recall 和 memory writes 都保留 client_type=codex 归因。`,
  'core://agent/pi': `# Pi 运行时约束

Pi 会把这个节点与 core://agent 一起加载。Pi extensions 位于 ~/.pi/agent/extensions 或项目本地扩展目录，本地扩展修改后需要 reload 生效。

Lore Pi extension 通过 pi.registerTool 注册工具，通过启动 hooks 注入 boot 和 recall context，并用 client_type=pi 标记 Lore API 活动。`,
};

export function getDefaultBootContent(uri: string | null | undefined): string {
  return DEFAULT_BOOT_CONTENT[String(uri || '').trim()] || '';
}

export function isClientBootUri(uri: string | null | undefined): boolean {
  return CLIENT_BOOT_URIS.includes(String(uri || '').trim() as (typeof CLIENT_BOOT_URIS)[number]);
}

export function isGlobalBootUri(uri: string | null | undefined): boolean {
  return GLOBAL_BOOT_URIS.includes(String(uri || '').trim() as (typeof GLOBAL_BOOT_URIS)[number]);
}

export interface BootMemory {
  id?: string;
  uri: string;
  content: string;
  priority: number;
  disclosure: string | null;
  node_uuid: string;
  role?: BootNodeRole;
  boot_role?: BootNodeRole;
  boot_role_label?: string;
  boot_purpose?: string;
  purpose?: string;
  scope?: BootNodeScope;
  client_type?: BootClientType | null;
  setup_slug?: string;
  setup_title?: string;
  setup_description?: string;
}

export interface BootRecentMemory {
  uri: string;
  priority: number;
  disclosure: string | null;
  created_at: string | null;
}

export interface BootStatusNode {
  id: string;
  uri: string;
  role: BootNodeRole;
  role_label: string;
  purpose: string;
  dream_protection: 'protected';
  scope: BootNodeScope;
  client_type: BootClientType | null;
  setup_slug: string;
  setup_title: string;
  setup_description: string;
  state: BootNodeState;
  content: string;
  content_length: number;
  priority: number | null;
  disclosure: string | null;
  node_uuid: string | null;
}

export interface BootViewData {
  loaded: number;
  total: number;
  failed: string[];
  core_memories: BootMemory[];
  recent_memories: BootRecentMemory[];
  nodes: BootStatusNode[];
  overall_state: BootOverallState;
  remaining_count: number;
  draft_generation_available: boolean;
  draft_generation_reason: string | null;
  selected_client_type: string | null;
  includes_all_clients: boolean;
}

export interface SaveBootNodeResult {
  uri: string;
  status: BootSaveStatus;
  node_uuid: string | null;
  detail: string | null;
}

export interface SaveBootNodesResponse {
  results: SaveBootNodeResult[];
}

export interface BootDraftResult {
  uri: string;
  status: BootDraftStatus;
  content: string | null;
  detail: string | null;
}

export interface GenerateBootDraftsResponse {
  model: string;
  results: BootDraftResult[];
}

export interface BootSetupDecision {
  kind: 'none' | 'prompt' | 'redirect';
  target: string | null;
}

export interface SetupRuntimeStatus {
  configured: boolean;
  runtime_ready: boolean;
}

export interface SetupFlowStep {
  id: SetupStepId;
  path: string;
  label: string;
  description?: string;
  complete: boolean;
  role?: BootNodeRole;
  uri?: string;
  scope?: BootNodeScope;
  client_type?: BootClientType | null;
  setup_slug?: string;
}

export interface SetupFlowStatus {
  complete: boolean;
  next_step: string | null;
  steps: SetupFlowStep[];
  embedding: SetupRuntimeStatus;
  llm: SetupRuntimeStatus;
  boot: {
    overall_state: BootOverallState;
    nodes: BootStatusNode[];
    loaded: number;
    total: number;
    remaining_count: number;
    draft_generation_available: boolean;
    draft_generation_reason: string | null;
    includes_all_clients: boolean;
  };
}

export function makeBootSetupStepId(setupSlug: string): SetupStepId {
  return `boot:${String(setupSlug || '').trim()}`;
}

export function extractBootSetupSlug(stepId: string): string | null {
  const value = String(stepId || '').trim();
  return value.startsWith('boot:') ? value.slice('boot:'.length) : null;
}

export function isBootSetupStepId(stepId: string): boolean {
  return extractBootSetupSlug(stepId) !== null;
}

export function getSetupStepPath(stepId: SetupStepId): string {
  if (stepId in STATIC_SETUP_STEP_PATHS) {
    return STATIC_SETUP_STEP_PATHS[stepId as keyof typeof STATIC_SETUP_STEP_PATHS];
  }

  const bootSlug = extractBootSetupSlug(stepId);
  if (bootSlug) return `/setup/boot/${bootSlug}`;
  return '/setup';
}

export function isSetupPath(pathname: string | null | undefined): boolean {
  const value = String(pathname || '');
  return value === '/setup' || value.startsWith('/setup/');
}

export function isSettingsPath(pathname: string | null | undefined): boolean {
  const value = String(pathname || '');
  return value === '/settings' || value.startsWith('/settings/');
}

export function getSetupFlowDecision(
  pathname: string | null | undefined,
  setupStatus: SetupFlowStatus | null | undefined,
  hasAcknowledgedPrompt = false,
): BootSetupDecision {
  if (!setupStatus) return { kind: 'none', target: null };

  if (!setupStatus.complete) {
    if (isSetupPath(pathname) || isSettingsPath(pathname)) {
      return { kind: 'none', target: null };
    }
    const target = setupStatus.next_step || getSetupStepPath('embedding');
    if (!hasAcknowledgedPrompt) {
      return { kind: 'prompt', target };
    }
    return { kind: 'redirect', target };
  }

  if (isSetupPath(pathname) || pathname === '/') {
    return { kind: 'redirect', target: '/memory' };
  }

  return { kind: 'none', target: null };
}

export function getSetupFlowRedirect(
  pathname: string | null | undefined,
  setupStatus: SetupFlowStatus | null | undefined,
): string | null {
  const decision = getSetupFlowDecision(pathname, setupStatus, true);
  return decision.kind === 'redirect' ? decision.target : null;
}

export function getBootSetupDecision(
  pathname: string | null | undefined,
  overallState: BootOverallState | null | undefined,
  hasAcknowledgedPrompt = false,
): BootSetupDecision {
  if (!overallState) return { kind: 'none', target: null };

  if (overallState !== 'complete') {
    if (isSetupPath(pathname) || isSettingsPath(pathname)) {
      return { kind: 'none', target: null };
    }
    if (!hasAcknowledgedPrompt) {
      return { kind: 'prompt', target: '/setup' };
    }
    return { kind: 'redirect', target: '/setup' };
  }

  if (isSetupPath(pathname) || pathname === '/') {
    return { kind: 'redirect', target: '/memory' };
  }

  return { kind: 'none', target: null };
}

export function getBootSetupRedirect(
  pathname: string | null | undefined,
  overallState: BootOverallState | null | undefined,
): string | null {
  const decision = getBootSetupDecision(pathname, overallState, true);
  return decision.kind === 'redirect' ? decision.target : null;
}

export function dispatchSetupStatusChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SETUP_STATUS_CHANGED_EVENT));
}

export function dispatchBootStatusChanged(): void {
  dispatchSetupStatusChanged();
}
