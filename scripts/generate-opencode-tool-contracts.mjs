#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2).includes('--check');
const result = spawnSync(
  'npm',
  ['--prefix', 'web', 'exec', '--', 'vitest', 'run', 'server/__tests__/mcpServer.test.ts'],
  {
    cwd: root,
    env: check
      ? process.env
      : { ...process.env, UPDATE_OPENCODE_TOOL_CONTRACTS: '1' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
