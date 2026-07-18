import { describe, expect, it, vi } from 'vitest';
import loreOpenCodePlugin from '../index.js';

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

describe('OpenCode plugin entrypoint', () => {
  it('exports an async OpenCode Plugin', async () => {
    expect(typeof loreOpenCodePlugin).toBe('function');
  });

  it('composes native tools and lifecycle hooks from PluginInput workspace identity', async () => {
    const hooks = await loreOpenCodePlugin(pluginInput());

    expect(hooks.tool).toBeDefined();
    expect(hooks.event).toBeTypeOf('function');
    expect(hooks['chat.message']).toBeTypeOf('function');
    expect(hooks['experimental.chat.system.transform']).toBeTypeOf('function');
    expect(hooks.dispose).toBeTypeOf('function');
  });
});
