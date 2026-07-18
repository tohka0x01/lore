import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('OpenCode release bundle', () => {
  it('builds one managed ESM file without development paths or secrets', () => {
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' });
    const output = readFileSync(join(root, 'dist/lore-memory.js'), 'utf8');
    expect(output).toContain('@lore-managed-opencode-plugin');
    expect(output).toContain('version=1.3.15-pre.0');
    expect(output).not.toContain('/Users/proxy/');
    expect(output).not.toContain('LORE_API_TOKEN=');
  });
});
