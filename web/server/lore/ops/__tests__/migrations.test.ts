import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = fileURLToPath(new URL('../../../../migrations', import.meta.url));

describe('migration files', () => {
  it('uses each numeric migration version once', () => {
    const files = readdirSync(migrationsDir)
      .filter((file) => /^\d{3}_.*\.sql$/.test(file))
      .sort();
    const byVersion = new Map<string, string[]>();

    for (const file of files) {
      const version = file.slice(0, 3);
      byVersion.set(version, [...(byVersion.get(version) || []), file]);
    }

    const duplicates = [...byVersion.entries()]
      .filter(([, versionFiles]) => versionFiles.length > 1)
      .map(([version, versionFiles]) => `${version}: ${versionFiles.join(', ')}`);

    expect(duplicates).toEqual([]);
  });
});
