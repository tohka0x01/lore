import type { Config } from '@opencode-ai/plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import loreOpenCodePlugin from '../index.js';

const originalAllowMcp = process.env.LORE_OPENCODE_ALLOW_MCP;

function pluginInput() {
  return {
    client: {},
    project: {},
    directory: '/workspace/project',
    worktree: '/workspace',
    experimental_workspace: { register: vi.fn() },
    serverUrl: new URL('http://127.0.0.1:4096'),
    $: {},
  } as never;
}

function mergedConfig(mcp: Record<string, unknown>): Config {
  return { mcp } as Config;
}

afterEach(() => {
  if (originalAllowMcp === undefined) delete process.env.LORE_OPENCODE_ALLOW_MCP;
  else process.env.LORE_OPENCODE_ALLOW_MCP = originalAllowMcp;
});

describe('OpenCode plugin entrypoint', () => {
  it('exports an async OpenCode Plugin', async () => {
    expect(typeof loreOpenCodePlugin).toBe('function');
  });

  it('composes native tools and lifecycle hooks from PluginInput workspace identity', async () => {
    const hooks = await loreOpenCodePlugin(pluginInput());

    expect(hooks.tool).toBeDefined();
    expect(hooks.event).toBeTypeOf('function');
    expect(hooks.config).toBeTypeOf('function');
    expect(hooks['chat.message']).toBeTypeOf('function');
    expect(hooks['experimental.chat.system.transform']).toBeTypeOf('function');
    expect(hooks.dispose).toBeTypeOf('function');
  });

  it('suppresses imported Lore MCPs after OpenCode merges plugin and Claude compatibility config', async () => {
    const hooks = await loreOpenCodePlugin(pluginInput());
    const config = mergedConfig({
      lore: {
        type: 'remote',
        url: 'https://api.loremem.com/api/mcp?client_type=claudecode',
        enabled: true,
      },
      'lore:lore': {
        type: 'remote',
        url: 'http://127.0.0.1:18901/api/mcp?client_type=claudecode',
        enabled: true,
      },
      'project-memory': {
        type: 'remote',
        url: 'http://127.0.0.1:18901/api/mcp?client_type=claudecode',
        enabled: true,
      },
      context7: {
        type: 'remote',
        url: 'https://mcp.context7.com/mcp',
        enabled: true,
      },
    });

    await hooks.config?.(config);

    expect(config.mcp).toEqual({
      context7: {
        type: 'remote',
        url: 'https://mcp.context7.com/mcp',
        enabled: true,
      },
    });
  });

  it('preserves unrelated MCPs that only reuse the Lore name or generic MCP route', async () => {
    const hooks = await loreOpenCodePlugin(pluginInput());
    const config = mergedConfig({
      lore: {
        type: 'remote',
        url: 'https://example.test/not-lore',
        enabled: true,
      },
      'project-memory': {
        type: 'remote',
        url: 'https://example.test/api/mcp',
        enabled: true,
      },
      'lore-local-command': {
        type: 'local',
        command: ['node', 'server.js'],
        enabled: true,
      },
    });

    await hooks.config?.(config);

    expect(config.mcp).toEqual({
      lore: {
        type: 'remote',
        url: 'https://example.test/not-lore',
        enabled: true,
      },
      'project-memory': {
        type: 'remote',
        url: 'https://example.test/api/mcp',
        enabled: true,
      },
      'lore-local-command': {
        type: 'local',
        command: ['node', 'server.js'],
        enabled: true,
      },
    });
  });

  it('allows an explicit legacy MCP fallback escape hatch', async () => {
    process.env.LORE_OPENCODE_ALLOW_MCP = '1';
    const hooks = await loreOpenCodePlugin(pluginInput());
    const config = mergedConfig({
      lore: {
        type: 'remote',
        url: 'https://api.loremem.com/api/mcp?client_type=claudecode',
        enabled: true,
      },
    });

    await hooks.config?.(config);

    expect(config.mcp).toHaveProperty('lore');
  });
});
