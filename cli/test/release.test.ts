import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareRelease,
  resolveNeedInstall,
  fetchReleaseTag,
  tagFromGithubReleaseUrl,
} from '../src/core/release.ts';

test('compareRelease same stable', () => {
  assert.equal(compareRelease('v1.3.15', 'v1.3.15'), 'same');
});

test('compareRelease upgrade', () => {
  assert.equal(compareRelease('v1.3.14', 'v1.3.15'), 'older');
});

test('compareRelease installed newer', () => {
  assert.equal(compareRelease('v1.4.0', 'v1.3.15'), 'newer');
});

test('compareRelease pre to stable is older (upgrade)', () => {
  assert.equal(compareRelease('v1.3.15-pre.4', 'v1.3.15'), 'older');
});

test('compareRelease stable to pre is downgrade', () => {
  assert.equal(compareRelease('v1.3.15', 'v1.3.15-pre.4'), 'downgrade');
});

test('resolveNeedInstall same without force => 2', () => {
  assert.equal(resolveNeedInstall({ installed: 'v1.3.15', release: 'v1.3.15', force: false }), 2);
});

test('resolveNeedInstall same with force => 0', () => {
  assert.equal(resolveNeedInstall({ installed: 'v1.3.15', release: 'v1.3.15', force: true }), 0);
});

test('fetchReleaseTag dev short-circuits', async () => {
  const res = await fetchReleaseTag({
    pre: false,
    dev: true,
    fetchImpl: async () => {
      throw new Error('network should not be called');
    },
  });
  assert.equal(res.tag, 'dev');
  assert.equal(res.needInstallHint, 0);
});

test('fetchReleaseTag stable uses releases/latest redirect', async () => {
  const res = await fetchReleaseTag({
    pre: false,
    dev: false,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('github.com/') && u.endsWith('/releases/latest')) {
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://github.com/FFatTiger/lore/releases/tag/v1.3.15',
          },
        });
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(res.tag, 'v1.3.15');
});

test('fetchReleaseTag falls back to API when redirect fails', async () => {
  const res = await fetchReleaseTag({
    pre: false,
    dev: false,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/releases/latest') && !u.includes('api.github.com')) {
        return new Response('missing', { status: 404 });
      }
      if (u.includes('api.github.com') && u.endsWith('/releases/latest')) {
        return new Response(JSON.stringify({ tag_name: 'v1.2.0' }), { status: 200 });
      }
      throw new Error(`unexpected url ${u}`);
    },
  });
  assert.equal(res.tag, 'v1.2.0');
});

test('fetchReleaseTag prerelease selects the first prerelease only', async () => {
  const res = await fetchReleaseTag({
    pre: true,
    dev: false,
    fetchImpl: async (url) => {
      assert.match(String(url), /api\.github\.com\/repos\/FFatTiger\/lore\/releases\?per_page=10/);
      return new Response(JSON.stringify([
        { tag_name: 'v1.3.19', prerelease: false },
        { tag_name: 'v1.3.20-pre.1', prerelease: true },
        { tag_name: 'v1.3.20-pre.0', prerelease: true },
      ]), { status: 200 });
    },
  });
  assert.equal(res.tag, 'v1.3.20-pre.1');
  assert.equal(res.needInstallHint, 0);
});

test('fetchReleaseTag prerelease does not fall back to stable when API fails', async () => {
  const requests: string[] = [];
  const res = await fetchReleaseTag({
    pre: true,
    dev: false,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response('rate limited', { status: 403 });
    },
  });
  assert.equal(res.tag, null);
  assert.equal(res.needInstallHint, 1);
  assert.ok(res.error);
  assert.deepEqual(requests, [
    'https://api.github.com/repos/FFatTiger/lore/releases?per_page=10',
  ]);
});

test('fetchReleaseTag prerelease does not accept a stable-only release list', async () => {
  const res = await fetchReleaseTag({
    pre: true,
    dev: false,
    fetchImpl: async () => new Response(JSON.stringify([
      { tag_name: 'v1.3.19', prerelease: false },
      { tag_name: 'v1.3.18', prerelease: false },
    ]), { status: 200 }),
  });
  assert.equal(res.tag, null);
  assert.equal(res.needInstallHint, 1);
  assert.ok(res.error);
});

test('fetchReleaseTag network failure => needInstall 1 + error', async () => {
  const res = await fetchReleaseTag({
    pre: false,
    dev: false,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(res.tag, null);
  assert.equal(res.needInstallHint, 1);
  assert.ok(res.error);
});

test('tagFromGithubReleaseUrl', () => {
  assert.equal(
    tagFromGithubReleaseUrl('https://github.com/FFatTiger/lore/releases/tag/v1.3.15'),
    'v1.3.15',
  );
  assert.equal(tagFromGithubReleaseUrl('https://example.com'), null);
});
