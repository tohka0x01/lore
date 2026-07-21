import assert from 'node:assert/strict';
import test from 'node:test';
import { createTTYPrompt } from '../src/ui/prompt.ts';
import type { InstallSnapshot } from '../src/core/snapshot.ts';

const emptySnapshot: InstallSnapshot = {
  loreHome: '/tmp/x',
  configPath: '/tmp/x/config.json',
  config: {},
  hasConfig: false,
  serverKind: 'unknown',
  agents: {
    claude: true,
    codex: false,
    pi: true,
    openclaw: false,
    opencode: false,
    hermes: false,
    docker: true,
  },
  channels: [
    { id: 'claudecode', state: 'missing', details: [] },
    { id: 'codex', state: 'missing', details: [] },
    { id: 'pi', state: 'installed', details: [] },
    { id: 'openclaw', state: 'missing', details: [] },
    { id: 'hermes', state: 'missing', details: [] },
    { id: 'opencode', state: 'missing', details: [] },
  ],
  detectedChannels: ['claudecode', 'pi'],
};

test('TTY prompt pickLanguage uses selectOne', async () => {
  const prompt = createTTYPrompt({
    selectOne: async (opts) => opts.options[1]!.value,
  });
  const lang = await prompt.pickLanguage('en');
  assert.equal(lang, 'zh');
});

test('TTY prompt first-run uses first option SaaS', async () => {
  const prompt = createTTYPrompt({
    lang: 'en',
    selectOne: async (opts) => opts.options[0]!.value,
  });
  const action = await prompt.pickFirstRunAction();
  assert.equal(action, 'saas');
});

test('TTY prompt pickChannels uses multiSelect', async () => {
  const prompt = createTTYPrompt({
    lang: 'en',
    multiSelect: async () => ['pi', 'opencode'] as never,
  });
  const channels = await prompt.pickChannels({
    defaults: ['pi'],
    snapshot: emptySnapshot,
    purpose: 'install',
  });
  assert.deepEqual(channels, ['pi', 'opencode']);
});

test('TTY prompt confirm false via confirmFn', async () => {
  const prompt = createTTYPrompt({
    lang: 'en',
    confirmFn: async () => false,
  });
  const ok = await prompt.confirm('summary');
  assert.equal(ok, false);
});
