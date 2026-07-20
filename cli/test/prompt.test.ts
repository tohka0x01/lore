import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { createTTYPrompt } from '../src/ui/prompt.ts';
import type { InstallSnapshot } from '../src/core/snapshot.ts';

function mockIO(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let i = 0;
  const pushNext = () => {
    if (i < answers.length) {
      input.write(`${answers[i++]}\n`);
    }
  };
  output.on('data', () => {
    setImmediate(pushNext);
  });
  setImmediate(pushNext);
  return { input, output };
}

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

test('TTY prompt pickLanguage zh on 2', async () => {
  const io = mockIO(['2']);
  const prompt = createTTYPrompt({ lang: 'en', io });
  const lang = await prompt.pickLanguage('en');
  assert.equal(lang, 'zh');
});

test('TTY prompt first-run SaaS is option 1', async () => {
  const io = mockIO(['1']);
  const prompt = createTTYPrompt({ lang: 'en', io });
  const action = await prompt.pickFirstRunAction();
  assert.equal(action, 'saas');
});

test('TTY prompt pickChannels parses list', async () => {
  const io = mockIO(['pi,opencode']);
  const prompt = createTTYPrompt({ lang: 'en', io });
  const channels = await prompt.pickChannels({
    defaults: ['pi'],
    snapshot: emptySnapshot,
    purpose: 'install',
  });
  assert.deepEqual(channels, ['pi', 'opencode']);
});

test('TTY prompt confirm no aborts', async () => {
  const io = mockIO(['n']);
  const prompt = createTTYPrompt({ lang: 'en', io });
  const ok = await prompt.confirm('summary');
  assert.equal(ok, false);
});
