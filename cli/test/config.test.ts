import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getLoreHome, getConfigPath } from '../src/core/paths.ts';
import { readConfig, writeConfig } from '../src/core/config.ts';

test('getLoreHome respects LORE_HOME', () => {
  assert.equal(getLoreHome({ LORE_HOME: '/tmp/custom-lore' } as NodeJS.ProcessEnv), '/tmp/custom-lore');
});

test('writeConfig merges token and version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-cli-'));
  const cfgPath = getConfigPath(dir);
  await writeConfig(cfgPath, { base_url: 'http://127.0.0.1:18901', api_token: 'lm_x' }, {
    writeVersion: true,
    releaseVersion: 'v1.2.3',
    dockerManaged: false,
  });
  const cfg = await readConfig(cfgPath);
  assert.equal(cfg.base_url, 'http://127.0.0.1:18901');
  assert.equal(cfg.api_token, 'lm_x');
  assert.equal(cfg.installed_version, 'v1.2.3');
  assert.equal(cfg.docker_managed, false);
});

test('writeConfig without writeVersion leaves installed_version intact', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-cli-'));
  const cfgPath = getConfigPath(dir);
  await writeConfig(cfgPath, { base_url: 'http://a' }, {
    writeVersion: true,
    releaseVersion: 'v1.0.0',
  });
  await writeConfig(cfgPath, { base_url: 'http://b' }, { writeVersion: false });
  const cfg = await readConfig(cfgPath);
  assert.equal(cfg.base_url, 'http://b');
  assert.equal(cfg.installed_version, 'v1.0.0');
});
