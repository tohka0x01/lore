import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(pluginRoot);

const englishFiles = [
  'README.md',
  'docs/website/content/documents/installation/install-lore.mdx',
  'docs/website/content/documents/installation/manual-configuration.mdx',
  'docs/website/content/documents/installation/verify-the-install.mdx',
  'docs/website/content/documents/runtime-integrations/choose-runtimes.mdx',
  'docs/website/content/documents/runtime-integrations/connect-an-agent.mdx',
  'docs/website/content/documents/troubleshooting/agent-issues.mdx',
] as const;

const chineseFiles = [
  'README.zh-CN.md',
  'docs/website/content/documents/installation/install-lore.zh-cn.mdx',
  'docs/website/content/documents/installation/manual-configuration.zh-cn.mdx',
  'docs/website/content/documents/installation/verify-the-install.zh-cn.mdx',
  'docs/website/content/documents/runtime-integrations/choose-runtimes.zh-cn.mdx',
  'docs/website/content/documents/runtime-integrations/connect-an-agent.zh-cn.mdx',
  'docs/website/content/documents/troubleshooting/agent-issues.zh-cn.mdx',
] as const;

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

function corpus(paths: readonly string[]): string {
  return paths.map(read).join('\n\n');
}

describe('OpenCode prerelease documentation', () => {
  it.each([...englishFiles, ...chineseFiles])('%s explicitly documents OpenCode', (path) => {
    expect(read(path)).toContain('OpenCode');
  });

  it('covers the complete English prerelease contract', () => {
    const content = corpus(englishFiles);
    for (const required of [
      'v1.3.15-pre.4',
      'OpenCode 1.18.3',
      '--channels opencode',
      '~/.config/opencode/plugins/lore-memory.js',
      'lore-opencode.zip',
      'prerelease',
      'experimental.chat.system.transform',
      'chat.message',
      'lore_guidance',
      'lore_move_node',
      '--channels opencode -y',
      'manual fallback',
    ]) {
      expect(content).toContain(required);
    }
  });

  it('covers the complete Chinese prerelease contract', () => {
    const content = corpus(chineseFiles);
    for (const required of [
      'v1.3.15-pre.4',
      'OpenCode 1.18.3',
      '--channels opencode',
      '~/.config/opencode/plugins/lore-memory.js',
      'lore-opencode.zip',
      '预发布',
      'experimental.chat.system.transform',
      'chat.message',
      'lore_guidance',
      'lore_move_node',
      '--channels opencode -y',
      '手动兜底',
    ]) {
      expect(content).toContain(required);
    }
  });

  it('states that the standard OpenCode installer does not configure MCP', () => {
    const englishInstall = read('docs/website/content/documents/installation/install-lore.mdx');
    const chineseInstall = read('docs/website/content/documents/installation/install-lore.zh-cn.mdx');

    expect(englishInstall).toContain('The standard OpenCode installation does not configure MCP.');
    expect(chineseInstall).toContain('OpenCode 标准安装不会配置 MCP。');
    expect(englishInstall).not.toContain('/api/mcp?client_type=opencode');
    expect(chineseInstall).not.toContain('/api/mcp?client_type=opencode');
  });

  it('documents the manual compatibility-layer step when bypassing the installer', () => {
    const english = read('docs/website/content/documents/installation/manual-configuration.mdx');
    const chinese = read('docs/website/content/documents/installation/manual-configuration.zh-cn.mdx');

    expect(english).toContain('claude_code.plugins_override["lore@lore"] = false');
    expect(english).toContain('Manual ZIP installation does not apply this compatibility edit');
    expect(english).toContain('LORE_OPENCODE_ALLOW_MCP=1');
    expect(chinese).toContain('claude_code.plugins_override["lore@lore"] = false');
    expect(chinese).toContain('手动安装 ZIP 不会自动执行这个兼容修改');
    expect(chinese).toContain('LORE_OPENCODE_ALLOW_MCP=1');
  });

  it('documents two-layer duplicate suppression and the reversible compatibility edit', () => {
    const english = [
      read('opencode-plugin/README.md'),
      read('docs/website/content/documents/installation/install-lore.mdx'),
      read('docs/website/content/documents/troubleshooting/agent-issues.mdx'),
    ].join('\n');
    const chinese = [
      read('docs/website/content/documents/installation/install-lore.zh-cn.mdx'),
      read('docs/website/content/documents/troubleshooting/agent-issues.zh-cn.mdx'),
    ].join('\n');

    for (const required of [
      'duplicate Lore MCP',
      'LORE_OPENCODE_ALLOW_MCP=1',
      'does not modify Claude Code files',
      'existing user-level',
      'claude_code.plugins_override["lore@lore"] = false',
      'warns and skips',
      'restores the previous value',
      'lore:lore',
      'multiple client types',
    ]) {
      expect(english).toContain(required);
    }
    for (const required of [
      '重复 Lore MCP',
      'LORE_OPENCODE_ALLOW_MCP=1',
      '不会修改 Claude Code 文件',
      '已有且可安全解析的用户级',
      'claude_code.plugins_override["lore@lore"] = false',
      '警告并跳过',
      '恢复原值',
      'lore:lore',
      '多个 client type',
    ]) {
      expect(chinese).toContain(required);
    }
  });
});
