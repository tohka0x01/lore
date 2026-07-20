import { ALL_CHANNELS, type ChannelId, type ChannelStatus, type LoreConfig } from './types.js';
import { detectAgents } from './detect.js';
import { getInstaller } from '../channels/registry.js';
import { classifyServerKind, type ServerKind } from './saas.js';

export type AgentsMap = Awaited<ReturnType<typeof detectAgents>>;

export type InstallSnapshot = {
  loreHome: string;
  configPath: string;
  config: LoreConfig;
  hasConfig: boolean;
  serverKind: ServerKind;
  agents: AgentsMap;
  channels: ChannelStatus[];
  detectedChannels: ChannelId[];
};

export async function collectInstallSnapshot(opts: {
  loreHome: string;
  configPath: string;
  config: LoreConfig;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<InstallSnapshot> {
  const env = opts.env ?? process.env;
  const agents = await detectAgents();
  const detectedChannels: ChannelId[] = (
    [
      ['claudecode', agents.claude],
      ['codex', agents.codex],
      ['pi', agents.pi],
      ['openclaw', agents.openclaw],
      ['opencode', agents.opencode],
      ['hermes', agents.hermes],
    ] as Array<[ChannelId, boolean]>
  )
    .filter(([, on]) => on)
    .map(([id]) => id);

  const channels: ChannelStatus[] = [];
  for (const id of ALL_CHANNELS) {
    try {
      channels.push(await getInstaller(id).status({ loreHome: opts.loreHome, homeDir: opts.homeDir }));
    } catch {
      channels.push({ id, state: 'unknown', details: [] });
    }
  }

  const hasConfig = Boolean(
    opts.config.base_url || opts.config.api_token || opts.config.installed_version || opts.config.docker_managed,
  );

  return {
    loreHome: opts.loreHome,
    configPath: opts.configPath,
    config: opts.config,
    hasConfig,
    serverKind: classifyServerKind({
      baseUrl: opts.config.base_url,
      dockerManaged: opts.config.docker_managed,
      env,
    }),
    agents,
    channels,
    detectedChannels,
  };
}

export function formatSnapshot(snapshot: InstallSnapshot, lang: 'en' | 'zh'): string {
  const lines: string[] = [];
  const yes = lang === 'zh' ? '是' : 'yes';
  const no = lang === 'zh' ? '否' : 'no';
  const set = lang === 'zh' ? '已设置' : 'set';
  const absent = lang === 'zh' ? '未设置' : 'absent';

  lines.push(lang === 'zh' ? '当前状态' : 'Current status');
  lines.push(`  ${lang === 'zh' ? '配置' : 'Config'}:     ${snapshot.hasConfig ? (lang === 'zh' ? '存在' : 'present') : lang === 'zh' ? '无' : 'missing'}`);
  lines.push(
    `  ${lang === 'zh' ? '服务' : 'Server'}:     ${snapshot.config.base_url ?? '(unset)'} (${snapshot.serverKind})`,
  );
  lines.push(`  Token:      ${snapshot.config.api_token ? set : absent}`);
  lines.push(`  ${lang === 'zh' ? '版本' : 'Version'}:    ${snapshot.config.installed_version ?? '(unset)'}`);
  lines.push(
    `  Docker:     ${snapshot.config.docker_managed ? (lang === 'zh' ? '托管' : 'managed') : lang === 'zh' ? '非托管' : 'not managed'}`,
  );
  lines.push('');
  lines.push(`  CLIs:`);
  for (const [name, present] of Object.entries(snapshot.agents)) {
    lines.push(`    ${name.padEnd(10)} ${present ? yes : no}`);
  }
  lines.push('');
  lines.push(`  ${lang === 'zh' ? '插件' : 'Channels'}:`);
  for (const ch of snapshot.channels) {
    lines.push(`    ${ch.id.padEnd(12)} ${ch.state}`);
  }
  return lines.join('\n');
}
