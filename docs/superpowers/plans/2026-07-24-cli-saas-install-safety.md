# CLI SaaS Install Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a publication-ready `@loremem/cli@1.3.19` that safely installs Lore from the LoreHub SaaS command, preserves Codex authentication, avoids duplicate hooks, prevents cross-origin token reuse, and reports installation failures truthfully.

**Architecture:** Add small core primitives for strict/secure JSON, URL and token decisions, and checked subprocesses; then make install orchestration carry explicit operation and connection modes into Docker and channel installers. Keep per-channel ownership intact, with Codex applying its authoritative TOML patch after host CLI registration and all mutating host JSON paths using strict reads.

**Tech Stack:** TypeScript 5.9, Node.js 20+ built-ins, Node test runner through `tsx`, existing `@clack/prompts`, shell/plugin fixtures already in the repository.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-24-cli-saas-install-safety-design.md` exactly.
- Keep LoreHub's generated command unchanged: `npx @loremem/cli install --base-url "<core-url>" --api-token "<lm-token>"`.
- Keep `scripts/install.sh` frozen; use it only as a parity reference.
- Do not publish npm, create/push a tag, create a GitHub Release, or deploy LoreHub.
- Do not modify the unrelated repository-root untracked `package-lock.json`.
- Use regression tests first; each production behavior must be observed failing for the intended reason before implementation.
- Never include an API token in an error message, command summary, test failure snapshot, or documentation example beyond redacted placeholders.
- Defer channel-local artifact version markers, full status layering, purge redesign, and native Windows installers.

---

## File Structure

### New files

- `cli/src/core/connection.ts` — normalize/validate base URLs, classify loopback transport, and resolve token keep/set/clear decisions.
- `cli/test/connection.test.ts` — unit contract for URL and token safety.

### Modified core/orchestration files

- `cli/src/core/fs.ts` — strict JSON reads and secure atomic writes.
- `cli/src/core/config.ts` — strict Lore config and explicit token action.
- `cli/src/core/types.ts` — shared connection/token/operation types.
- `cli/src/core/exec.ts` — checked command helper with bounded redacted diagnostics.
- `cli/src/core/docker.ts` — explicit preserve/docker/external selection and hard failure result.
- `cli/src/core/args.ts` — retain update identity and validate incompatible release flags.
- `cli/src/ui/wizard.ts` — emit explicit connection mode and operation.
- `cli/src/commands/install.ts` — resolve safe credentials, enforce SaaS/transport rules, make update truthful, and gate version advancement.
- `cli/src/channels/types.ts` — pass token action and process environment into channel installers.

### Modified channel files

- `cli/src/channels/codex.ts` — final TOML ordering, bundled-hook default, strict legacy-hook cleanup, opt-in compatibility hooks.
- `cli/src/channels/claudecode.ts` — strict settings mutation, stale token removal, checked required commands.
- `cli/src/channels/openclaw.ts` — strict config mutation, stale token removal, checked npm/plugin commands.
- `cli/src/channels/opencode.ts` — report invoked compatibility-helper failure and preserve recoverable state.
- `cli/src/channels/pi.ts` — use shared checked-command behavior without changing install semantics.
- `cli/src/channels/hermes.ts` — preserve explicit manual-link wording.

### Modified tests/docs/package metadata

- `cli/test/config.test.ts`
- `cli/test/commands-install.test.ts`
- `cli/test/commands-install-outcome.test.ts`
- `cli/test/docker.test.ts`
- `cli/test/wizard.test.ts`
- `cli/test/channels-claude-codex.test.ts`
- `cli/test/channels-opencode-openclaw.test.ts`
- `cli/test/channels-pi-hermes.test.ts`
- `cli/test/args.test.ts`
- `cli/README.md`
- `cli/package.json`
- `cli/package-lock.json`

---

### Task 1: Secure config and connection decisions

**Files:**
- Create: `cli/src/core/connection.ts`
- Create: `cli/test/connection.test.ts`
- Modify: `cli/src/core/types.ts`
- Modify: `cli/src/core/fs.ts`
- Modify: `cli/src/core/config.ts`
- Modify: `cli/test/config.test.ts`

**Interfaces:**
- Produces: `ConnectionMode = 'preserve' | 'docker' | 'external'`.
- Produces: `TokenAction = 'keep' | 'set' | 'clear'`.
- Produces: `normalizeBaseUrl(value: string): string`.
- Produces: `resolveTokenDecision(input): { action: TokenAction; apiToken?: string }`.
- Produces: `assertTokenTransport(baseUrl: string, apiToken?: string): void`.
- Produces: `readJsonFileStrict<T>(filePath: string): Promise<T | undefined>`.
- Changes: `writeJsonAtomic(filePath, data, { mode? })` securely writes and cleans temp files.
- Changes: `writeConfig` accepts `tokenAction` instead of interpreting falsy token values.

- [ ] **Step 1: Write failing connection tests**

Add `cli/test/connection.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTokenTransport,
  normalizeBaseUrl,
  resolveTokenDecision,
} from '../src/core/connection.ts';

test('normalizes equivalent base URLs before comparison', () => {
  assert.equal(normalizeBaseUrl('https://CORE.example/'), 'https://core.example');
});

test('keeps a saved token only for the same normalized base URL', () => {
  assert.deepEqual(
    resolveTokenDecision({
      savedBaseUrl: 'https://core.example/',
      savedToken: 'lm_old',
      targetBaseUrl: 'https://CORE.example',
      explicitToken: false,
    }),
    { action: 'keep', apiToken: 'lm_old' },
  );
});

test('clears a saved token when the server changes', () => {
  assert.deepEqual(
    resolveTokenDecision({
      savedBaseUrl: 'https://api.loremem.com',
      savedToken: 'lm_old',
      targetBaseUrl: 'https://other.example',
      explicitToken: false,
    }),
    { action: 'clear', apiToken: undefined },
  );
});

test('sets an explicit token for a changed server', () => {
  assert.deepEqual(
    resolveTokenDecision({
      savedBaseUrl: 'https://api.loremem.com',
      savedToken: 'lm_old',
      targetBaseUrl: 'https://other.example',
      explicitToken: true,
      requestedToken: 'lm_new',
    }),
    { action: 'set', apiToken: 'lm_new' },
  );
});

test('rejects tokens over non-loopback HTTP', () => {
  assert.throws(() => assertTokenTransport('http://192.168.1.5:18901', 'lm_x'), /HTTPS/i);
  assert.doesNotThrow(() => assertTokenTransport('http://localhost:18901', 'lm_x'));
  assert.doesNotThrow(() => assertTokenTransport('http://127.9.8.7:18901', 'lm_x'));
  assert.doesNotThrow(() => assertTokenTransport('http://[::1]:18901', 'lm_x'));
});

test('rejects unsupported URL protocols', () => {
  assert.throws(() => normalizeBaseUrl('file:///tmp/lore'), /http/i);
});
```

- [ ] **Step 2: Extend config tests for clear, strict reads, permissions, and temp cleanup**

Add to `cli/test/config.test.ts`:

```ts
test('writeConfig clear removes a saved token', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-cli-'));
  const cfgPath = getConfigPath(dir);
  await writeConfig(cfgPath, { base_url: 'https://a.example', api_token: 'lm_old' }, {
    tokenAction: 'set',
  });
  await writeConfig(cfgPath, { base_url: 'https://b.example' }, { tokenAction: 'clear' });
  const cfg = await readConfig(cfgPath);
  assert.equal(cfg.api_token, undefined);
});

test('Lore config is written with mode 0600', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-cli-'));
  const cfgPath = getConfigPath(dir);
  await writeConfig(cfgPath, { base_url: 'https://core.example', api_token: 'lm_x' }, {
    tokenAction: 'set',
  });
  assert.equal((await fs.stat(cfgPath)).mode & 0o777, 0o600);
});

test('malformed Lore config fails instead of becoming empty config', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-cli-'));
  const cfgPath = getConfigPath(dir);
  await fs.writeFile(cfgPath, '{broken', 'utf8');
  await assert.rejects(readConfig(cfgPath), /invalid JSON/i);
  assert.equal(await fs.readFile(cfgPath, 'utf8'), '{broken');
});
```

Add a direct `writeJsonAtomic` failure test using an injected/occupied destination shape or an exported testable helper so the assertion proves no `${file}.tmp.*` entry remains after failure.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/connection.test.ts test/config.test.ts
```

Expected: FAIL because `connection.ts`, strict reads, token actions, and secure write options do not exist.

- [ ] **Step 4: Implement the shared types and connection module**

Add to `cli/src/core/types.ts`:

```ts
export type ConnectionMode = 'preserve' | 'docker' | 'external';
export type TokenAction = 'keep' | 'set' | 'clear';
export type InstallOperation = 'install' | 'update';
```

Implement `cli/src/core/connection.ts` with this public shape:

```ts
import type { TokenAction } from './types.js';

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Lore base URL must use http or https');
  }
  parsed.hash = '';
  parsed.search = '';
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

export function resolveTokenDecision(input: {
  savedBaseUrl?: string;
  savedToken?: string;
  targetBaseUrl: string;
  requestedToken?: string;
  explicitToken: boolean;
  forceClear?: boolean;
}): { action: TokenAction; apiToken?: string } {
  if (input.forceClear) return { action: 'clear', apiToken: undefined };
  if (input.explicitToken) {
    const token = input.requestedToken?.trim();
    return token ? { action: 'set', apiToken: token } : { action: 'clear', apiToken: undefined };
  }
  const same = Boolean(input.savedBaseUrl) &&
    normalizeBaseUrl(input.savedBaseUrl!) === normalizeBaseUrl(input.targetBaseUrl);
  return same && input.savedToken
    ? { action: 'keep', apiToken: input.savedToken }
    : { action: 'clear', apiToken: undefined };
}

export function assertTokenTransport(baseUrl: string, apiToken?: string): void {
  if (!apiToken) return;
  const parsed = new URL(normalizeBaseUrl(baseUrl));
  if (parsed.protocol === 'https:') return;
  const host = parsed.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
  if (!loopback) throw new Error('API tokens require HTTPS for non-loopback Lore servers');
}
```

- [ ] **Step 5: Implement strict and secure JSON writes**

In `cli/src/core/fs.ts`:

```ts
export async function readJsonFileStrict<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (err instanceof SyntaxError) throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
    throw err;
  }
}

export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  opts: { mode?: number } = {},
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const mode = opts.mode ?? 0o600;
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode });
    await fs.chmod(tmp, mode);
    await fs.rename(tmp, filePath);
    await fs.chmod(filePath, mode);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}
```

Keep lenient `readJsonFile` only for read-only status paths that intentionally degrade to missing/unknown.

- [ ] **Step 6: Implement explicit token actions in config**

Update `writeConfig` options:

```ts
opts: {
  tokenAction?: TokenAction;
  writeVersion?: boolean;
  releaseVersion?: string;
  dockerManaged?: boolean | null;
}
```

Apply:

```ts
if (opts.tokenAction === 'set' && patch.api_token) next.api_token = patch.api_token;
if (opts.tokenAction === 'clear') delete next.api_token;
```

Make `readConfig` use `readJsonFileStrict` and validate that the parsed value is a non-array object.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/connection.test.ts test/config.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add cli/src/core/types.ts cli/src/core/connection.ts cli/src/core/fs.ts cli/src/core/config.ts cli/test/connection.test.ts cli/test/config.test.ts
git commit -m "fix(cli): secure connection and token persistence"
```

---

### Task 2: Explicit Docker selection and hard failure propagation

**Files:**
- Modify: `cli/src/core/docker.ts`
- Modify: `cli/src/ui/wizard.ts`
- Modify: `cli/test/docker.test.ts`
- Modify: `cli/test/wizard.test.ts`

**Interfaces:**
- Consumes: `ConnectionMode` from Task 1.
- Produces: `DockerResult = { ok: true; baseUrl; dockerManaged; skipped } | { ok: false; error }`.
- Produces: wizard plans with `connectionMode` rather than indirect Docker inference.

- [ ] **Step 1: Write failing wizard tests for explicit modes**

Extend `cli/test/wizard.test.ts`:

```ts
test('Docker reconfigure is explicit and does not preserve external connection', async () => {
  const result = await runInteractiveWizard({
    prompt: scriptedPrompt({ existing: 'reconfigure', first: 'docker', channels: ['codex'] }),
    snapshot: baseSnapshot({
      hasConfig: true,
      serverKind: 'saas',
      config: { base_url: 'https://api.loremem.com', api_token: 'lm_old' },
    }),
    initialLang: 'en',
    langLocked: true,
  });
  assert.equal(result.kind, 'install');
  if (result.kind !== 'install') return;
  assert.equal(result.plan.connectionMode, 'docker');
  assert.equal(result.plan.keepExistingToken, false);
});

test('existing update preserves the current connection explicitly', async () => {
  // Reuse the existing update fixture.
  // Assert result.plan.connectionMode === 'preserve'.
});
```

Also assert first-run SaaS/external plans use `external`.

- [ ] **Step 2: Replace the old empty-result Docker test with hard-failure tests**

In `cli/test/docker.test.ts`, replace `no docker available on fresh start returns empty unmanaged result` and add:

```ts
test('explicit Docker selection fails when Docker is unavailable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lore-docker-'));
  const res = await ensureDockerServer({
    loreHome: dir,
    connectionMode: 'docker',
    skipDocker: false,
    pre: false,
    dev: false,
    run: async () => { throw new Error('ENOENT docker'); },
    fetchImpl: composeFetch(),
  });
  assert.deepEqual(res, { ok: false, error: 'Docker is not available' });
});
```

Add separate tests for compose unavailable, compose download failure, `up -d` non-zero, health timeout, and managed `pull` non-zero. Add:

```ts
test('explicit Docker reconfigure ignores a saved external URL', async () => {
  const res = await ensureDockerServer({
    loreHome: await fs.mkdtemp(path.join(os.tmpdir(), 'lore-docker-')),
    connectionMode: 'docker',
    skipDocker: false,
    pre: false,
    dev: false,
    saved: { base_url: 'https://api.loremem.com', docker_managed: false },
    run: dockerComposeOk(),
    fetchImpl: composeFetch(),
    healthTimeoutMs: 100,
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.baseUrl, DEFAULT_BASE);
});
```

Add an assertion that a freshly written and updated Docker `.env` has mode `0600`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/docker.test.ts test/wizard.test.ts
```

Expected: FAIL because `connectionMode` and the discriminated Docker result do not exist.

- [ ] **Step 4: Add connection mode to wizard plans**

Change `InstallPlan` to include:

```ts
connectionMode: ConnectionMode;
```

Set it as follows:

- SaaS/external first run and reconfigure: `external`.
- Docker first run and reconfigure: `docker` and `keepExistingToken: false`.
- Existing update/manage: `preserve`.

Retain `skipDocker` as a CLI transport flag, but stop using `explicitBaseUrl` as the sole semantic source of connection selection.

- [ ] **Step 5: Make Docker orchestration return success or failure explicitly**

Change the result shape:

```ts
export type DockerResult =
  | { ok: true; baseUrl: string; dockerManaged: boolean | null; skipped: boolean }
  | { ok: false; error: string };
```

Change `EnsureDockerServerOpts` to include `connectionMode: ConnectionMode`.

Behavior:

```ts
if (opts.connectionMode === 'external') { /* return normalized explicit URL */ }
if (opts.connectionMode === 'preserve') { /* saved external, or update saved managed Docker */ }
if (opts.connectionMode === 'docker') { /* ignore saved external and start fresh */ }
```

Return stable messages for tests:

- `Docker is not available`
- `Docker Compose is not available`
- `Could not download docker-compose.yml`
- `docker compose pull failed: <bounded detail>`
- `docker compose up failed: <bounded detail>`
- `Lore Docker health check timed out for <baseUrl>`

Make `updateDocker` return a result and check compose download, pull, up, and health. Write/chmod `.env` with `0o600`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/docker.test.ts test/wizard.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/src/core/docker.ts cli/src/ui/wizard.ts cli/test/docker.test.ts cli/test/wizard.test.ts
git commit -m "fix(cli): make Docker connection selection explicit"
```

---

### Task 3: Safe install orchestration and truthful update semantics

**Files:**
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/channels/types.ts`
- Modify: `cli/src/core/args.ts`
- Modify: `cli/test/commands-install.test.ts`
- Modify: `cli/test/commands-install-outcome.test.ts`
- Modify: `cli/test/args.test.ts`

**Interfaces:**
- Consumes: connection helpers and Docker result from Tasks 1–2.
- Produces: `ChannelContext.tokenAction`, `ChannelContext.env`, and operation-aware execution.
- Changes: `runUpdate` keeps `operation: 'update'` and defaults to installed/partial channels.

- [ ] **Step 1: Write failing connection-safety integration tests**

Extend `cli/test/commands-install.test.ts` with preseeded configs and the existing Hermes artifact mock:

```ts
test('same explicit base keeps a saved token when no new token is supplied', async () => {
  // Seed https://core.example + lm_old.
  // Run install --base-url https://CORE.example/ --channels hermes --skip-docker.
  // Assert config.api_token === 'lm_old'.
});

test('changed explicit base clears a saved token', async () => {
  // Seed https://api.loremem.com + lm_old.
  // Run install --base-url https://other.example --channels hermes --skip-docker.
  // Assert config.base_url === 'https://other.example'.
  // Assert config.api_token === undefined.
});

test('non-interactive SaaS install without a token fails before channel effects', async () => {
  // Run api.loremem.com without --api-token and with empty config.
  // Assert exit === 2 or 1 according to the command validation contract.
  // Assert no Hermes artifact directory was created.
});

test('non-loopback HTTP with a token fails before channel effects', async () => {
  // Run http://192.168.1.5:18901 with lm_x.
  // Assert non-zero and no channel artifact.
});
```

Add a Docker reconfigure integration test using the wizard fixture: seed SaaS config, select Docker, then assert final base is local and token absent.

- [ ] **Step 2: Write failing update tests**

Extend `cli/test/commands-install-outcome.test.ts`:

```ts
test('update fails immediately when the release cannot be resolved', async () => {
  // Seed config and an installed Hermes footprint.
  // Invoke runUpdate(parseArgv(['update', '--channels', 'hermes'])).
  // Make fetch throw.
  // Assert exit === 1, no "complete" log, and installed_version unchanged.
});

test('failed selected channel prevents global version advancement', async () => {
  // Seed installed_version v1.3.18.
  // Resolve v1.3.19; make one selected channel fail.
  // Assert config.installed_version remains v1.3.18.
});

test('non-interactive update defaults to installed and partial channels', async () => {
  // Seed only Hermes installed and Pi partial footprints.
  // Do not pass --channels.
  // Capture section logs or installer calls.
  // Assert unrelated missing channels are not attempted.
});
```

- [ ] **Step 3: Write failing argv test for incompatible release flags**

Add to `cli/test/args.test.ts`:

```ts
test('--pre and --dev cannot be combined', () => {
  assert.throws(() => parseArgv(['install', '--pre', '--dev']), /cannot.*together/i);
});
```

- [ ] **Step 4: Run focused tests and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/commands-install.test.ts test/commands-install-outcome.test.ts test/args.test.ts
```

Expected: FAIL on cross-origin reuse, missing SaaS validation, update identity/defaults, and release flag conflict.

- [ ] **Step 5: Extend channel context**

In `cli/src/channels/types.ts` add:

```ts
tokenAction: TokenAction;
env?: NodeJS.ProcessEnv;
```

Pass the resolved action and execution environment to every installer.

- [ ] **Step 6: Make install execution operation- and connection-aware**

Refactor `executeInstallPlan` input to include:

```ts
operation: InstallOperation;
connectionMode: ConnectionMode;
explicitToken: boolean;
```

Sequence:

1. Read strict saved config.
2. Call `ensureDockerServer` with explicit mode.
3. If Docker result is failure, log and return `1` before channel work.
4. Normalize effective base URL.
5. Resolve token decision against saved/effective base, forcing clear for explicit Docker selection.
6. Enforce SaaS token and transport security.
7. Resolve release.
8. If operation is update and release is unknown, return `1` before channel work.
9. Persist connection config with explicit token action.
10. Execute selected channels with `tokenAction` and `env`.
11. Advance version only when release is known, work was applied, `failed === 0`, and `skipped === 0`.

Use exit `2` for invalid non-interactive URL/token usage and exit `1` for operational Docker/release/channel failures.

- [ ] **Step 7: Preserve update identity and choose installed channels**

Implement an internal operation parameter rather than rewriting update to install:

```ts
export async function runUpdate(args: GlobalArgs, deps: InstallDeps = {}): Promise<number> {
  return runInstallOperation('update', args, deps);
}
```

For update with no explicit channels, call `collectInstallSnapshot` and select `installed` or `partial` IDs. If none exist, fail with a clear message instead of selecting all channels.

For non-interactive install derive mode:

```ts
const connectionMode = args.explicitBaseUrl
  ? 'external'
  : args.skipDocker
    ? 'preserve'
    : operation === 'update'
      ? 'preserve'
      : 'docker';
```

- [ ] **Step 8: Reject `--pre --dev`**

At the end of `parseArgv`:

```ts
if (result.pre && result.dev) {
  throw new Error('--pre and --dev cannot be used together');
}
```

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/commands-install.test.ts test/commands-install-outcome.test.ts test/args.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add cli/src/commands/install.ts cli/src/channels/types.ts cli/src/core/args.ts cli/test/commands-install.test.ts cli/test/commands-install-outcome.test.ts cli/test/args.test.ts
git commit -m "fix(cli): enforce safe install and update connections"
```

---

### Task 4: Checked subprocess execution

**Files:**
- Modify: `cli/src/core/exec.ts`
- Modify: `cli/test/result.test.ts` or create `cli/test/exec.test.ts`

**Interfaces:**
- Produces: `runChecked(run, stage, argv, opts?, { redact? }): Promise<ExecResult>`.
- Produces: bounded, redacted failure messages reused by Docker and channels.

- [ ] **Step 1: Write failing checked-command tests**

Create `cli/test/exec.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { runChecked } from '../src/core/exec.ts';

test('runChecked throws a stage-specific error on non-zero exit', async () => {
  await assert.rejects(
    runChecked(
      async () => ({ code: 7, stdout: '', stderr: 'permission denied' }),
      'Codex marketplace registration',
      ['codex', 'plugin', 'marketplace', 'add', '/tmp/lore'],
    ),
    /Codex marketplace registration failed.*permission denied/i,
  );
});

test('runChecked redacts token text from diagnostics', async () => {
  const token = 'lm_super_secret';
  await assert.rejects(
    runChecked(
      async () => ({ code: 1, stdout: '', stderr: `bad bearer ${token}` }),
      'Claude MCP registration',
      ['claude', 'mcp', 'add'],
      undefined,
      { redact: [token] },
    ),
    (err: Error) => !err.message.includes(token) && err.message.includes('[REDACTED]'),
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/exec.test.ts
```

Expected: FAIL because `runChecked` does not exist.

- [ ] **Step 3: Implement `runChecked`**

Add exported result/options types and helper to `cli/src/core/exec.ts`:

```ts
export type ExecResult = { code: number; stdout: string; stderr: string };

function boundedDetail(result: ExecResult, redact: string[]): string {
  let detail = [result.stderr, result.stdout].filter(Boolean).join(' ').trim();
  for (const secret of redact.filter(Boolean)) detail = detail.split(secret).join('[REDACTED]');
  return detail.replace(/\s+/g, ' ').slice(0, 300);
}

export async function runChecked(
  run: ExecFn,
  stage: string,
  argv: string[],
  opts?: Parameters<ExecFn>[1],
  safety: { redact?: string[] } = {},
): Promise<ExecResult> {
  const result = await run(argv, opts);
  if (result.code !== 0) {
    const detail = boundedDetail(result, safety.redact ?? []);
    throw new Error(`${stage} failed (exit ${result.code})${detail ? `: ${detail}` : ''}`);
  }
  return result;
}
```

Do not include `argv.join(' ')` in the error.

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/exec.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Refactor Docker to use bounded checked diagnostics**

Use the shared helper/detail behavior for compose pull/up while preserving the stable Docker error contract from Task 2. Re-run `test/docker.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/core/exec.ts cli/src/core/docker.ts cli/test/exec.test.ts cli/test/docker.test.ts
git commit -m "fix(cli): add checked subprocess execution"
```

---

### Task 5: Correct Codex authentication and hook policy

**Files:**
- Modify: `cli/src/channels/codex.ts`
- Modify: `cli/test/channels-claude-codex.test.ts`

**Interfaces:**
- Consumes: `runChecked`, strict JSON, token action, and environment from previous tasks.
- Produces: final authoritative Codex TOML and default bundled-only hook state.

- [ ] **Step 1: Write a fake Codex TOML mutation regression test**

Extend `cli/test/channels-claude-codex.test.ts` with a `run` implementation that simulates host CLI behavior:

```ts
const cfgPath = path.join(home, '.codex', 'config.toml');
const run: ExecFn = async (argv) => {
  if (argv.join(' ') === 'codex mcp remove lore') {
    await fs.writeFile(cfgPath, '', 'utf8');
  }
  if (argv.slice(0, 4).join(' ') === 'codex mcp add lore --url') {
    await fs.writeFile(cfgPath, `[mcp_servers.lore]\nurl = ${JSON.stringify(argv[4])}\n`, 'utf8');
  }
  return { code: 0, stdout: '', stderr: '' };
};
```

After install assert the final file includes:

```ts
assert.match(cfg, /http_headers = \{ Authorization = "Bearer lm_x" \}/);
assert.match(cfg, /\[plugins\."lore@lore"\]/);
assert.match(cfg, /hooks = true/);
```

This test must fail against the current write-before-remove/add order.

- [ ] **Step 2: Write failing legacy-hook policy tests**

Create a plugin fixture containing `scripts/install-hooks.sh` and seed `~/.codex/hooks.json` with one unrelated hook plus Lore rules/recall entries.

Add tests:

```ts
test('codex defaults to bundled hooks and removes only legacy Lore hooks', async () => {
  // Install with env not containing LORE_CODEX_INSTALL_USER_HOOKS.
  // Assert ~/.codex/hooks/lore is removed.
  // Assert unrelated hook remains.
  // Assert Lore legacy entries are absent.
  // Assert install-hooks.sh was not invoked.
});

test('codex installs legacy hooks only when explicitly enabled', async () => {
  // Install with env.LORE_CODEX_INSTALL_USER_HOOKS = '1'.
  // Assert bash install-hooks.sh was invoked with HOME/CODEX_HOME and Lore env.
});
```

Add a malformed `~/.codex/hooks.json` test asserting channel `failed` and original bytes unchanged.

- [ ] **Step 3: Write failing command and auth-clear tests**

Add:

```ts
test('codex marketplace failure returns failed', async () => { /* return code 1 for add */ });

test('codex clear token removes stale MCP auth keys', async () => {
  // Seed bearer_token_env_var, http_headers, env_http_headers.
  // Install with tokenAction: 'clear' and no apiToken.
  // Assert none remain in the final Lore section.
});
```

Add a hook JSON path test using a home path with spaces/backslashes or quotes and assert `JSON.parse` succeeds after placeholder replacement.

- [ ] **Step 4: Run focused test and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/channels-claude-codex.test.ts
```

Expected: FAIL on Authorization persistence, duplicate legacy hooks, strict JSON, and required command failure.

- [ ] **Step 5: Implement safe plugin hook JSON replacement**

Parse `hooks/hooks.json`, recursively replace placeholder substrings only inside string values, then write it through JSON serialization. A suitable helper shape is:

```ts
function replaceStrings(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceStrings(item, from, to)]),
    );
  }
  return value;
}
```

- [ ] **Step 6: Reorder Codex registration and final TOML patch**

Implement:

```ts
await runChecked(run, 'Codex marketplace registration', ['codex', 'plugin', 'marketplace', 'add', marketDir], { quiet: true });
await run(['codex', 'mcp', 'remove', 'lore'], { quiet: true });
await runChecked(run, 'Codex MCP registration', ['codex', 'mcp', 'add', 'lore', '--url', mcpUrl], { quiet: true });

// Read config.toml after host commands, then apply plugin/features/MCP keys and write once.
```

The final `setTomlSectionKeys` call removes all auth alternatives and adds `http_headers` only when `ctx.apiToken` exists.

- [ ] **Step 7: Implement strict legacy-hook cleanup and opt-in installation**

Extract predicates that identify both Lore scripts:

```ts
function isLoreLegacyCommand(command: string): boolean {
  return command.includes('/hooks/lore/hooks/rules-inject.') ||
    command.includes('/hooks/lore/hooks/recall-inject.') ||
    (command.includes('LORE_CODEX_PLUGIN_ROOT=') &&
      (command.includes('rules-inject.') || command.includes('recall-inject.')));
}
```

Default path:

- strict-read existing hooks JSON if present;
- preserve unrelated entries;
- remove empty event arrays and empty top-level `hooks` only when appropriate;
- write only when changed;
- remove `~/.codex/hooks/lore`.

Opt-in path:

```ts
if (ctx.env?.LORE_CODEX_INSTALL_USER_HOOKS === '1') {
  await runChecked(run, 'Codex legacy hook installation', ['bash', installHooks], {
    quiet: true,
    env: { ...ctx.env, LORE_BASE_URL: ctx.baseUrl, LORE_API_TOKEN: ctx.apiToken ?? '', HOME: homeDir, CODEX_HOME: cHome },
  }, { redact: [ctx.apiToken ?? ''] });
}
```

- [ ] **Step 8: Run focused test and plugin tests, verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/channels-claude-codex.test.ts
npm run typecheck
cd ..
node --test codex-plugin/hooks/__tests__/lifecycle-hooks.test.mjs
node --test codex-plugin/scripts/install.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add cli/src/channels/codex.ts cli/test/channels-claude-codex.test.ts
git commit -m "fix(cli): preserve Codex auth and dedupe hooks"
```

---

### Task 6: Harden Claude, OpenClaw, Pi, OpenCode, and Hermes outcomes

**Files:**
- Modify: `cli/src/channels/claudecode.ts`
- Modify: `cli/src/channels/openclaw.ts`
- Modify: `cli/src/channels/pi.ts`
- Modify: `cli/src/channels/opencode.ts`
- Modify: `cli/src/channels/hermes.ts`
- Modify: `cli/test/channels-claude-codex.test.ts`
- Modify: `cli/test/channels-opencode-openclaw.test.ts`
- Modify: `cli/test/channels-pi-hermes.test.ts`

**Interfaces:**
- Consumes: `runChecked`, strict JSON, and `ChannelContext.tokenAction`.
- Produces: accurate `failed` results for required subprocesses and stale-token removal.

- [ ] **Step 1: Write failing Claude tests**

Add to `cli/test/channels-claude-codex.test.ts`:

```ts
test('Claude marketplace failure returns failed', async () => { /* marketplace add => code 1 */ });
test('Claude MCP add failure returns failed without leaking token', async () => { /* assert message redacted */ });
test('Claude clear token removes settings token and omits MCP header', async () => { /* seed old token */ });
test('Claude malformed settings fail without overwriting the file', async () => { /* write {broken */ });
```

- [ ] **Step 2: Write failing OpenClaw tests**

Add table-driven cases to `cli/test/channels-opencode-openclaw.test.ts` for failures at:

- `npm install` after both retries;
- `npm run build`;
- `openclaw plugins install`;
- `openclaw plugins enable lore`.

Each must return `failed`. Add stale-token clear and malformed-config preservation tests.

- [ ] **Step 3: Write failing Pi/OpenCode/Hermes tests**

Add:

```ts
test('pi install reports checked script failure without token leakage', async () => { /* stderr includes token */ });

test('opencode reports a non-zero invoked compatibility install helper', async () => {
  // Provide python3 and a helper/state path so compatibility is actually invoked.
  // Return code 1 for python3 helper install.
  // Assert channel failed and managed plugin remains available for retry.
});

test('Hermes success message states manual linking is required', async () => {
  // Assert /manual|symlink/i and not /configured successfully/i.
});
```

For uninstall, when an OpenCode compatibility state exists and the helper invocation fails, return `failed` without deleting the state/helper needed for recovery.

- [ ] **Step 4: Run channel tests and verify RED**

Run:

```bash
cd cli
node --import tsx --test \
  test/channels-claude-codex.test.ts \
  test/channels-opencode-openclaw.test.ts \
  test/channels-pi-hermes.test.ts
```

Expected: FAIL on required command propagation, strict JSON, and clear-token behavior.

- [ ] **Step 5: Harden Claude Code**

Use `runChecked` for marketplace add, plugin list, plugin install when absent, and MCP add. Keep MCP remove best-effort. Strict-read settings when present; on clear delete `LORE_API_TOKEN`; always update `LORE_BASE_URL`; secure-write settings while preserving other keys.

Return a `failed` `ChannelResult` from caught operational errors using the sanitized helper message.

- [ ] **Step 6: Harden OpenClaw**

Require both npm attempts to fail before returning the npm-install error. Require successful build, plugin install, and plugin enable. Strict-read an existing config; when clearing, delete `config.apiToken`; preserve all other plugin/user keys.

Do not swallow a present malformed config as “optional.” A genuinely missing config remains optional if the OpenClaw CLI owns creation.

- [ ] **Step 7: Harden Pi and OpenCode**

Replace Pi's local manual result handling with `runChecked` and redaction, while retaining its current `failed` result contract.

Make `configureCompatibility` return a structured result:

```ts
type CompatibilityResult = { ok: true } | { ok: false; error: string };
```

An unavailable optional helper may return success-with-skip, but any helper command that is actually invoked and exits non-zero returns failure. For uninstall, if compatibility state exists, missing/invocation-failed helper must preserve state and produce channel failure.

- [ ] **Step 8: Preserve Hermes semantics**

Keep download-only installation and ensure its success message explicitly says files are ready and manual symlink/linking is required.

- [ ] **Step 9: Run channel tests and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test \
  test/channels-claude-codex.test.ts \
  test/channels-opencode-openclaw.test.ts \
  test/channels-pi-hermes.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add \
  cli/src/channels/claudecode.ts \
  cli/src/channels/openclaw.ts \
  cli/src/channels/pi.ts \
  cli/src/channels/opencode.ts \
  cli/src/channels/hermes.ts \
  cli/test/channels-claude-codex.test.ts \
  cli/test/channels-opencode-openclaw.test.ts \
  cli/test/channels-pi-hermes.test.ts
git commit -m "fix(cli): propagate required channel failures"
```

---

### Task 7: Documentation, version, and curl-to-npx parity record

**Files:**
- Modify: `cli/README.md`
- Modify: `cli/package.json`
- Modify: `cli/package-lock.json`
- Modify: `cli/test/cli-help.test.ts`

**Interfaces:**
- Documents all externally observable contracts introduced by Tasks 1–6.
- Produces package metadata consistently set to `1.3.19`.

- [ ] **Step 1: Write failing help/package contract tests**

Extend `cli/test/cli-help.test.ts` or add a metadata assertion:

```ts
import pkg from '../package.json' with { type: 'json' };

test('package version is 1.3.19', () => {
  assert.equal(pkg.version, '1.3.19');
});
```

Assert help/README source includes the supported installer, SaaS token requirement, and Codex compatibility switch without including a real token.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
cd cli
node --import tsx --test test/cli-help.test.ts
```

Expected: FAIL because package version is `1.3.18` and documentation is incomplete.

- [ ] **Step 3: Update README with exact contracts**

Add concise sections covering:

- `@loremem/cli` is supported; `scripts/install.sh` is frozen compatibility.
- SaaS example with `lm_...` placeholder and requirement for a token.
- Tokens are stored in `~/.lore/config.json`, written `0600`, and cleared when changing server without a new token.
- Tokens require HTTPS except on loopback HTTP.
- Codex uses bundled plugin hooks by default; `LORE_CODEX_INSTALL_USER_HOOKS=1` is legacy-only.
- Supported environment is macOS/Linux for Bash-dependent integrations; list Node, Bash, curl, unzip, and host CLI requirements.
- Hermes prepares files and requires manual linking.
- Update targets installed/partial channels and fails when release resolution fails.
- Deferred limitations: per-channel version markers, full status, purge lifecycle, Windows-native installers.

- [ ] **Step 4: Bump package and lockfile to 1.3.19**

Run only inside `cli/`:

```bash
cd cli
npm version 1.3.19 --no-git-tag-version
```

Verify both `cli/package.json` and the root package entries in `cli/package-lock.json` are `1.3.19`. Do not stage or modify `/Users/proxy/Documents/program/lore/package-lock.json`.

- [ ] **Step 5: Run focused test and verify GREEN**

Run:

```bash
cd cli
node --import tsx --test test/cli-help.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/README.md cli/package.json cli/package-lock.json cli/test/cli-help.test.ts
git commit -m "docs(cli): prepare 1.3.19 install safety release"
```

---

### Task 8: Full verification and parity audit closure

**Files:**
- Modify only if verification reveals a demonstrated defect in files already covered by the approved design.
- Do not modify frozen shell scripts to make tests pass.

**Interfaces:**
- Verifies the complete approved design and publication boundary.

- [ ] **Step 1: Run the complete CLI test suite**

Run:

```bash
cd cli
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
cd cli
npm run typecheck
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 3: Run Codex plugin tests**

Run from repository root:

```bash
node --test codex-plugin/hooks/__tests__/lifecycle-hooks.test.mjs
node --test codex-plugin/scripts/install.test.mjs
```

Expected: PASS. If a test encodes the frozen standalone plugin installer's intentional policy, preserve that policy and fix only CLI divergence.

- [ ] **Step 4: Run focused frozen-shell parity tests**

Run the existing installer tests that do not mutate production user state, including:

```bash
bash scripts/__tests__/opencode-install.test.sh
```

Also list `scripts/__tests__` and run additional install/uninstall tests whose prerequisites are available and whose fixtures isolate HOME. Record any environment-blocked test explicitly.

- [ ] **Step 5: Inspect the npm package without publishing**

Run:

```bash
cd cli
npm pack --dry-run
```

Expected:

- package name `@loremem/cli`;
- version `1.3.19`;
- contents limited to intended `dist`, `README.md`, and package metadata;
- no tokens, local config, test fixtures, or repository-root `package-lock.json`.

- [ ] **Step 6: Verify the downstream LoreHub command contract**

From `/Users/proxy/Documents/program/LoreHub` run:

```bash
npm --prefix apps/console test -- --run tests/opencode-install.test.tsx
```

Expected: the Console still generates:

```text
npx @loremem/cli install --base-url "..." --api-token "..."
```

No LoreHub source edit is needed if this passes.

- [ ] **Step 7: Inspect diff and secret safety**

Run:

```bash
git diff --check
git status --short
rg -n 'lm_[A-Za-z0-9_-]{12,}' cli --glob '!test/**' || true
```

Expected:

- no whitespace errors;
- only planned files changed;
- repository-root untracked `package-lock.json` remains untouched and unstaged;
- no real-looking token is present.

- [ ] **Step 8: Run independent verification**

Launch a fresh verification agent with:

- original user request;
- approved design path;
- this plan path;
- full changed-file list;
- explicit concerns: Codex final auth, duplicate hooks, cross-origin token reuse, malformed host JSON, subprocess/Docker false success, update version advancement, and no publishing.

A FAIL must be corrected and reverified by the same verifier before completion.

- [ ] **Step 9: Commit verification-only corrections, if any**

If verification required code corrections, follow a new RED/GREEN cycle and commit them separately:

```bash
git add <corrected files and regression tests>
git commit -m "fix(cli): address install safety verification"
```

Do not create a commit when no files changed.

- [ ] **Step 10: Final publication-readiness report**

Report:

- commits created;
- changed files grouped by core/channels/tests/docs;
- exact verification commands and outcomes;
- npm dry-run package name/version/content summary;
- confirmed LoreHub command compatibility;
- deferred P1 items;
- explicit statement that npm publish, tags, releases, and deployment were not performed.
