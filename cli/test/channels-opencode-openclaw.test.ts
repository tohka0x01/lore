import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { opencodeInstaller } from '../src/channels/opencode.ts';
import { openclawInstaller } from '../src/channels/openclaw.ts';
import type { ChannelContext } from '../src/channels/types.ts';
import type { ExecFn } from '../src/core/exec.ts';

async function tempHome() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-oc-'));
  const loreHome = path.join(home, '.lore');
  await fs.mkdir(loreHome, { recursive: true });
  return { home, loreHome };
}

function ctx(partial: Partial<ChannelContext> & { loreHome: string; homeDir: string }): ChannelContext {
  return {
    baseUrl: 'http://127.0.0.1:18901',
    needInstall: 2,
    force: false,
    lang: 'en',
    releaseVersion: 'v1.3.15',
    ...partial,
  };
}

async function withBin(home: string, name: string, fn: () => Promise<void>) {
  const bin = path.join(home, 'bin');
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, name), '#!/bin/bash\nexit 0\n');
  await fs.chmod(path.join(bin, name), 0o755);
  const orig = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${orig ?? ''}`;
  try {
    await fn();
  } finally {
    process.env.PATH = orig;
  }
}

test('opencode skips unmanaged plugin file', async () => {
  const { home, loreHome } = await tempHome();
  const dest = path.join(loreHome, 'opencode');
  await fs.mkdir(dest, { recursive: true });
  await fs.writeFile(
    path.join(dest, 'lore-memory.js'),
    '// @lore-managed-opencode-plugin version=1.0.0\nexport default {}\n',
  );
  const target = path.join(home, '.config', 'opencode', 'plugins', 'lore-memory.js');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, '/* custom plugin */\n');

  await withBin(home, 'opencode', async () => {
    const result = await opencodeInstaller.install(ctx({ loreHome, homeDir: home }));
    assert.equal(result.status, 'skipped');
    const body = await fs.readFile(target, 'utf8');
    assert.match(body, /custom plugin/);
  });
});

test('opencode installs managed plugin', async () => {
  const { home, loreHome } = await tempHome();
  const dest = path.join(loreHome, 'opencode');
  await fs.mkdir(dest, { recursive: true });
  await fs.writeFile(
    path.join(dest, 'lore-memory.js'),
    '// @lore-managed-opencode-plugin version=1.3.15\nexport default {}\n',
  );

  const run: ExecFn = async () => ({ code: 0, stdout: '', stderr: '' });

  await withBin(home, 'opencode', async () => {
    // python3 may or may not exist; inject run so compat helper curl fails soft
    const result = await opencodeInstaller.install(ctx({ loreHome, homeDir: home, run }));
    assert.equal(result.status, 'ok');
    const target = path.join(home, '.config', 'opencode', 'plugins', 'lore-memory.js');
    const body = await fs.readFile(target, 'utf8');
    assert.match(body, /@lore-managed-opencode-plugin version=1.3.15/);
  });
});

test('opencode uninstall removes only managed plugin', async () => {
  const { home, loreHome } = await tempHome();
  const target = path.join(home, '.config', 'opencode', 'plugins', 'lore-memory.js');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, '// @lore-managed-opencode-plugin version=1\n');
  await fs.mkdir(path.join(loreHome, 'opencode'), { recursive: true });

  const result = await opencodeInstaller.uninstall({
    loreHome,
    homeDir: home,
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
  });
  assert.equal(result.status, 'ok');
  await assert.rejects(fs.access(target));
});

test('openclaw install patches config and runs plugin install', async () => {
  const { home, loreHome } = await tempHome();
  const dest = path.join(loreHome, 'openclaw');
  await fs.mkdir(dest, { recursive: true });
  await fs.writeFile(path.join(dest, 'package.json'), '{"name":"@local/lore"}\n');

  const cfg = path.join(home, '.openclaw', 'openclaw.json');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  await fs.writeFile(cfg, JSON.stringify({ plugins: { entries: {} } }, null, 2));

  const calls: string[] = [];
  const run: ExecFn = async (argv) => {
    calls.push(argv.join(' '));
    return { code: 0, stdout: '', stderr: '' };
  };

  await withBin(home, 'openclaw', async () => {
    const result = await openclawInstaller.install(
      ctx({ loreHome, homeDir: home, apiToken: 'lm_x', run }),
    );
    assert.equal(result.status, 'ok');
    assert.ok(calls.some((c) => c.includes('openclaw plugins install')));
    assert.ok(calls.some((c) => c.includes('openclaw plugins enable lore')));
    const data = JSON.parse(await fs.readFile(cfg, 'utf8')) as {
      plugins: { entries: { lore: { config: { baseUrl: string; apiToken: string }; enabled: boolean } } };
    };
    assert.equal(data.plugins.entries.lore.config.baseUrl, 'http://127.0.0.1:18901');
    assert.equal(data.plugins.entries.lore.config.apiToken, 'lm_x');
    assert.equal(data.plugins.entries.lore.enabled, true);
  });
});

test('openclaw uninstall removes lore entry', async () => {
  const { home, loreHome } = await tempHome();
  await fs.mkdir(path.join(loreHome, 'openclaw'), { recursive: true });
  const cfg = path.join(home, '.openclaw', 'openclaw.json');
  await fs.mkdir(path.dirname(cfg), { recursive: true });
  await fs.writeFile(
    cfg,
    JSON.stringify({ plugins: { entries: { lore: { enabled: true, config: {} } } } }, null, 2),
  );

  await withBin(home, 'openclaw', async () => {
    const result = await openclawInstaller.uninstall({
      loreHome,
      homeDir: home,
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
    });
    assert.equal(result.status, 'ok');
    const data = JSON.parse(await fs.readFile(cfg, 'utf8')) as {
      plugins: { entries: Record<string, unknown> };
    };
    assert.equal(data.plugins.entries.lore, undefined);
  });
});
