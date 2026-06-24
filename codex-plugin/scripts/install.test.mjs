import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const installScript = path.join(pluginRoot, 'scripts', 'install.sh');

test('install defaults to plugin hooks and removes legacy Lore user hooks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lore-codex-install-'));
  const codexHome = path.join(root, 'codex-home');
  const fakeBin = path.join(root, 'bin');
  const fakeCodex = path.join(fakeBin, 'codex');
  execFileSync('mkdir', ['-p', codexHome, fakeBin]);
  writeFileSync(fakeCodex, '#!/usr/bin/env bash\nset -euo pipefail\necho "$@" >> "$CODEX_FAKE_LOG"\n');
  chmodSync(fakeCodex, 0o755);
  writeFileSync(path.join(codexHome, 'hooks.json'), JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'LORE_CODEX_PLUGIN_ROOT="/tmp/old" npx tsx "/tmp/old/hooks/recall-inject.ts"',
              timeout: 10,
            },
          ],
        },
        {
          matcher: '',
          hooks: [{ type: 'command', command: 'echo keep-me', timeout: 1 }],
        },
      ],
      SessionStart: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'LORE_CODEX_PLUGIN_ROOT="/tmp/old" npx tsx "/tmp/old/hooks/rules-inject.ts"',
              timeout: 10,
            },
          ],
        },
      ],
    },
  }, null, 2));

  execFileSync('bash', [installScript], {
    cwd: pluginRoot,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CODEX_FAKE_LOG: path.join(root, 'codex.log'),
      PATH: `${fakeBin}:${process.env.PATH}`,
      LORE_BASE_URL: 'http://core.local',
      LORE_API_TOKEN: 'test-token',
    },
    stdio: 'pipe',
  });

  const installedHooksPath = path.join(codexHome, 'plugins', 'cache', 'lore', 'lore', 'local', 'hooks', 'hooks.json');
  assert.equal(existsSync(installedHooksPath), true);
  const installedHooks = readFileSync(installedHooksPath, 'utf8');
  assert.match(installedHooks, /node /);
  assert.match(installedHooks, /recall-inject\.mjs/);
  assert.doesNotMatch(installedHooks, /npx tsx/);

  const userHooks = JSON.parse(readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'));
  assert.deepEqual(userHooks.hooks.SessionStart, []);
  assert.equal(userHooks.hooks.UserPromptSubmit.length, 1);
  assert.equal(userHooks.hooks.UserPromptSubmit[0].hooks[0].command, 'echo keep-me');
});
