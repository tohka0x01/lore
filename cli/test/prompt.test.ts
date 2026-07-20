import assert from 'node:assert/strict';
import test from 'node:test';
import { createTTYPrompt } from '../src/ui/prompt.ts';
import type { InstallSnapshot } from '../src/core/snapshot.ts';
import type { Choice } from '../src/ui/select.ts';

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
    lang: 'en',
    selectOne: async <T,>(opts: { choices: Choice<T>[]; initialIndex?: number }) =>
      opts.choices[opts.initialIndex === 1 ? 1 : 1]!.value,
  });
  // force choose zh by returning choices[1]
  const lang = await createTTYPrompt({
    selectOne: async <T,>(opts: { choices: Choice<T>[] }) => opts.choices[1]!.value,
  }).pickLanguage('en');
  assert.equal(lang, 'zh');
  void prompt;
});

test('TTY prompt first-run uses selectOne first choice SaaS', async () => {
  const prompt = createTTYPrompt({
    lang: 'en',
    selectOne: async <T,>(opts: { choices: Choice<T>[] }) => opts.choices[0]!.value,
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

test('TTY prompt confirm false via selectOne', async () => {
  const prompt = createTTYPrompt({
    lang: 'en',
    selectOne: async <T,>(opts: { choices: Choice<T>[] }) => opts.choices[1]!.value,
  });
  const ok = await prompt.confirm('summary');
  assert.equal(ok, false);
});
