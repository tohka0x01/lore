import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../src/commands/install.ts';
import { parseArgv } from '../src/core/args.ts';
import { getConfigPath } from '../src/core/paths.ts';
import { readConfig } from '../src/core/config.ts';
import type { PromptService } from '../src/ui/prompt.ts';

test('non-TTY bare argv exits 2', async () => {
  const args = parseArgv([]);
  const exit = await runInstall(args, {
    isTTY: false,
    env: { ...process.env, LORE_HOME: await fs.mkdtemp(path.join(os.tmpdir(), 'lore-ntty-')) },
  });
  assert.equal(exit, 2);
});

test('flag install with mocked deps writes config', async () => {
  const loreHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-inst-'));
  const args = parseArgv([
    'install',
    '--base-url',
    'https://core.example',
    '--api-token',
    'lm_test',
    '--channels',
    'hermes',
    '--skip-docker',
  ]);

  const runExec = async (argv: string[]) => {
    if (argv[0] === 'curl') {
      const out = argv[argv.indexOf('-o') + 1];
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, 'zip');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (argv[0] === 'unzip') {
      const dir = argv[argv.indexOf('-d') + 1];
      await fs.mkdir(path.join(dir, 'lore_memory'), { recursive: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };

  const exit = await runInstall(args, {
    isTTY: false,
    env: { ...process.env, LORE_HOME: loreHome, HOME: loreHome },
    run: runExec,
    fetchImpl: async (url) => {
      if (String(url).includes('api.github.com')) {
        return new Response(JSON.stringify({ tag_name: 'v1.3.15' }), { status: 200 });
      }
      return new Response('ok', { status: 200 });
    },
  });

  assert.equal(exit, 0);
  const cfg = await readConfig(getConfigPath(loreHome));
  assert.equal(cfg.base_url, 'https://core.example');
  assert.equal(cfg.api_token, 'lm_test');
  await fs.access(path.join(loreHome, 'hermes', 'lore_memory'));
});

test('interactive SaaS path never asks base URL and uses api.loremem.com', async () => {
  const loreHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-saas-'));
  let askedBaseUrl = false;
  const prompt: PromptService = {
    async pickLanguage() {
      return 'en';
    },
    showStatus() {},
    async pickFirstRunAction() {
      return 'saas';
    },
    async pickExistingAction() {
      return 'update';
    },
    async askBaseUrl() {
      askedBaseUrl = true;
      return 'should-not-be-used';
    },
    async askToken() {
      return 'lm_saas_token';
    },
    async pickChannels() {
      return ['hermes'];
    },
    async pickRelease() {
      return 'stable';
    },
    async confirm() {
      return true;
    },
    async askYesNo() {
      return false;
    },
  };

  const runExec = async (argv: string[]) => {
    if (argv[0] === 'curl') {
      const out = argv[argv.indexOf('-o') + 1];
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, 'zip');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (argv[0] === 'unzip') {
      const dir = argv[argv.indexOf('-d') + 1];
      await fs.mkdir(path.join(dir, 'lore_memory'), { recursive: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };

  const exit = await runInstall(parseArgv([]), {
    isTTY: true,
    prompt,
    env: { ...process.env, LORE_HOME: loreHome, HOME: loreHome },
    run: runExec,
    fetchImpl: async (url) => {
      if (String(url).includes('api.github.com')) {
        return new Response(JSON.stringify({ tag_name: 'v1.3.16' }), { status: 200 });
      }
      return new Response('ok', { status: 200 });
    },
    log: {
      info() {},
      ok() {},
      warn() {},
      err() {},
      section() {},
    },
  });

  assert.equal(exit, 0);
  assert.equal(askedBaseUrl, false);
  const cfg = await readConfig(getConfigPath(loreHome));
  assert.equal(cfg.base_url, 'https://api.loremem.com');
  assert.equal(cfg.api_token, 'lm_saas_token');
});
