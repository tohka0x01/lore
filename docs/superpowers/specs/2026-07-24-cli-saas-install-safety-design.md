# `@loremem/cli` SaaS Install Safety and Parity Design

Date: 2026-07-24
Status: Approved for implementation planning
Repository: `FFatTiger/lore`
Target release: `@loremem/cli@1.3.19`

## Summary

Harden the published `@loremem/cli` installer after comparing it with the frozen `scripts/install.sh` path used before LoreHub switched its generated SaaS command to:

```bash
npx @loremem/cli install --base-url "..." --api-token "..."
```

The immediate defect is that the Codex installer enables plugin-bundled hooks and then unconditionally installs equivalent legacy user hooks into `~/.codex/hooks.json`. The audit also found higher-severity problems: the Codex MCP Authorization header can be removed by a later `codex mcp remove/add`, an old token can be reused after changing server origin, required subprocess failures can be reported as successful installs, and explicit Docker reconfiguration can silently preserve a previous external server.

This patch fixes the release-blocking safety and correctness issues without redesigning the entire installer. The legacy shell installer remains frozen and serves only as a behavioral reference.

## Goals

1. Make the LoreHub-generated `npx` SaaS command safe and reliable without changing its syntax.
2. Ensure Codex has exactly one active Lore hook path by default.
3. Preserve the final Codex MCP Bearer Authorization configuration.
4. Prevent tokens from being reused across different server origins.
5. Make explicit external, SaaS, and Docker connection choices deterministic.
6. Make required host commands and Docker startup failures produce non-zero outcomes.
7. Protect Lore secret files and pre-existing host configuration from unsafe overwrite.
8. Give `update` a truthful operation and failure contract.
9. Document intentional differences and remaining deferred gaps between frozen curl and supported npx installation.
10. Prepare version `1.3.19` for publication without publishing, tagging, or creating a GitHub Release.

## Non-goals

- Per-channel artifact version markers.
- A complete status model covering artifact, plugin, MCP, hooks, and runtime health separately.
- Redesigning `uninstall --purge` or Docker data lifecycle.
- Native Windows implementations for Bash-dependent channel installers.
- Rewriting all plugin installers or moving runtime protocol behavior.
- Updating the frozen shell installer with new behavior.
- Publishing `@loremem/cli`, creating a tag, or creating a GitHub Release.
- Changing the LoreHub Console install command unless verification proves its current contract is wrong.

## Chosen Approach

Use a focused release-safety patch rather than a Codex-only fix or a full installer state-machine rewrite.

The patch introduces small explicit connection and token decisions at orchestration boundaries, checked subprocess execution for required steps, strict host JSON handling, and corrected Codex ordering. Existing channel modules remain responsible for host-specific work.

## Connection and Credential Model

### Types

Installation planning distinguishes connection selection from token selection:

```ts
type ConnectionMode = 'preserve' | 'docker' | 'external';
type TokenAction = 'keep' | 'set' | 'clear';
```

`external` includes Loremem SaaS and other explicitly supplied HTTP services. SaaS-specific validation is applied after URL normalization.

### URL normalization

A base URL is normalized by parsing it with `URL`, requiring `http:` or `https:`, removing the trailing slash from the serialized origin/path, and comparing normalized values rather than raw strings.

Invalid URLs fail before config or host files are modified.

### Token rules

| Situation | Result |
|---|---|
| Same normalized base URL, no new token | Keep saved token |
| Same normalized base URL, explicit token | Set new token |
| Different normalized base URL, no new token | Clear saved token |
| Different normalized base URL, explicit token | Set new token |
| Explicit Docker selection | Clear saved remote token |
| First install without a token | Token remains absent |

An omitted token never means “reuse regardless of target server.” Token reuse is permitted only when the effective normalized base URL is unchanged.

### SaaS requirements

The configured Loremem SaaS URL is `https://api.loremem.com`, overridden by `LORE_SAAS_BASE_URL` when set. An effective SaaS connection requires a non-empty API token in interactive and non-interactive execution.

### Transport security

A token may be sent over:

- HTTPS; or
- HTTP only for loopback hosts: `localhost`, IPv4 `127.0.0.0/8`, or IPv6 `::1`.

A token combined with non-loopback HTTP is rejected before channel installation. No insecure override flag is added in this patch.

### Explicit Docker selection

Interactive reconfiguration to Docker is represented explicitly rather than inferred from missing `--base-url`:

- saved SaaS/external URL is ignored;
- saved remote token is cleared;
- a local Docker server must start and pass health checks;
- failure does not fall back to the saved external URL or an assumed `127.0.0.1` service.

The `preserve` mode is used for an update or plugin-management operation that intentionally keeps the current connection.

## Config Persistence and Host File Safety

### Lore config

`~/.lore/config.json` supports all three token actions. A clear operation removes `api_token` from JSON instead of treating an empty value as “keep.”

The file and its temporary replacement are written with mode `0600`. Existing Lore config files are chmodded to `0600` after a successful write. Temporary files are removed in `finally` when a write or rename fails.

Malformed `~/.lore/config.json` is an explicit error. It is not silently interpreted as an empty config.

### Docker environment

`~/.lore/docker/.env` contains generated database credentials and is written or updated with mode `0600`.

### Host-owned JSON

Existing host files are read strictly before mutation:

- `~/.claude/settings.json`
- `~/.openclaw/openclaw.json`
- `~/.codex/hooks.json`

A missing file may use an empty default when creation is expected. A present malformed file makes the affected channel fail and remains untouched. Other user-owned keys and hook entries are preserved.

### Clearing channel credentials

When the effective token action is `clear`, channel configuration must remove stale credentials:

- Claude Code: remove `env.LORE_API_TOKEN` and omit the MCP Authorization header.
- Codex: remove `http_headers`, `env_http_headers`, and `bearer_token_env_var` from the Lore MCP section unless replaced by the new token.
- OpenClaw: remove `plugins.entries.lore.config.apiToken`.
- Pi and runtime scripts receive an empty `LORE_API_TOKEN` for the current install execution.

## Codex Installation

### Authoritative order

Codex installation executes in this order:

1. Download and stage the release marketplace artifact.
2. Copy the Lore plugin into the Codex cache and safely replace the plugin-root placeholder in its hook configuration.
3. Register the marketplace.
4. Run the idempotent `codex mcp remove lore` cleanup.
5. Run `codex mcp add lore --url <url>` to establish host registration.
6. Read the resulting `~/.codex/config.toml`.
7. Apply the authoritative final patch:
   - enable `[plugins."lore@lore"]`;
   - set `[features] hooks = true`;
   - set the final Lore MCP URL;
   - set the Bearer Authorization header when a token is present;
   - remove stale Lore MCP auth keys when a token is absent.
8. Remove legacy Lore user-hook entries and `~/.codex/hooks/lore` by default.
9. Install legacy user hooks only when `LORE_CODEX_INSTALL_USER_HOOKS=1` is explicitly set.

The final TOML patch must occur after Codex CLI commands so those commands cannot erase the Authorization header.

### Hook policy

Modern default:

```text
~/.codex/plugins/cache/lore/lore/local/hooks/hooks.json
```

Legacy compatibility, opt-in only:

```text
~/.codex/hooks.json
~/.codex/hooks/lore/
```

Legacy cleanup removes only entries whose commands are identifiable as Lore `rules-inject` or `recall-inject` handlers. Other user hooks and event groups remain unchanged.

### Hook path serialization

Hook placeholder replacement must preserve valid JSON for paths containing backslashes, spaces, or quotes. The implementation should parse and update the JSON structure or otherwise serialize the substituted command safely rather than relying on unchecked raw text replacement.

## Required Command Failure Contract

Introduce a small checked-command helper that receives a stage label, command arguments, and execution options. A non-zero exit produces a sanitized error containing the stage and a bounded stderr/stdout summary. It must not echo API tokens or full commands containing them.

### Required steps

The following failures make the channel or Docker operation fail:

- Claude marketplace registration, plugin installation when needed, and MCP add.
- Codex marketplace registration and MCP add.
- Opt-in Codex legacy hook installation.
- Pi `install-local.sh`.
- OpenClaw `npm install`, build, plugin install, and plugin enable.
- OpenCode compatibility install/uninstall when a compatibility state requires it.
- Docker compose pull/up for managed updates and compose up for fresh starts.

### Best-effort or idempotent steps

Explicit remove/unregister operations may ignore a not-found/non-zero result where the next authoritative write or add establishes the desired state. The code must make this exception local and visible rather than relying on all `ExecFn` calls being best-effort.

### Channel semantics

- Missing required host CLI remains `skipped`.
- Hermes remains “files ready; manual link required” and does not claim that a Hermes runtime was automatically configured.
- A selected channel with a failed required command returns `failed`.
- Aggregate outcome and process exit code derive from actual channel results.

## Docker Failure Contract

Docker orchestration returns a discriminated success/failure result rather than an empty base URL.

When Docker is explicitly selected or an existing managed Docker install is updated, these are hard failures:

- Docker unavailable;
- Compose unavailable;
- compose file download failure;
- compose pull failure during managed update;
- compose up failure;
- health check timeout.

Only an explicit external/SaaS connection or `--skip-docker` bypasses Docker startup. A Docker failure does not continue into channel configuration using an assumed local URL.

## Update Contract

`update` remains an explicit operation throughout parsing and execution.

Rules:

1. Default channels are those currently reported as `installed` or `partial`.
2. An explicit `--channels` list overrides the default.
3. Failure to resolve the target GitHub Release is fatal for `update`.
4. A failed update does not print a success message or advance `installed_version`.
5. Any failed selected channel prevents the global version from advancing.
6. `update` preserves the current connection unless explicit supported connection flags are supplied.
7. This patch does not add per-channel version markers; that remains a documented P1 limitation.

For install, the global version may advance only when a known release was applied and no selected channel failed. Skipped channels do not prove their artifacts are current and must not be described as updated.

## Frozen curl vs Supported npx

### Fixed parity gaps

- Codex final MCP Authorization is authoritative and survives host CLI registration.
- Codex defaults to plugin-bundled hooks without duplicate legacy hooks.
- Tokens are not reused after changing server origin.
- Explicit Docker reconfiguration does not silently retain an external server.
- Required subprocess and Docker failures are reflected in channel and process outcomes.
- Secret files use restrictive permissions.
- Malformed host JSON is preserved rather than overwritten.
- Update does not report success without a resolved target release.

### Intentional differences

- The TypeScript CLI rejects unknown flags/channels instead of silently ignoring them.
- The interactive wizard defaults to detected or already installed channels.
- Structured channel outcomes distinguish `ok`, `skipped`, and `failed`.
- JSON writes are atomic and secret-aware.
- `@loremem/cli` is the supported evolution surface; shell scripts are frozen.

### Deferred P1 gaps

- Per-channel artifact version markers and reliable mixed-version recovery.
- Full status layering for artifact, host plugin, MCP, hooks, and runtime health.
- Safe subset purge and complete Docker shutdown/data lifecycle.
- Native Windows installers and removal of Bash dependencies.
- General host-config backup framework.
- Full SemVer prerelease redesign beyond release-safety regressions required by this patch.

## Testing Strategy

All behavior changes use regression tests first and are observed failing for the intended reason before implementation.

### Connection and config

- Same normalized URL without a new token keeps the token.
- Changed URL without a new token clears the token.
- Changed URL with a new token sets only the new token.
- Explicit Docker selection ignores saved external URL and clears the remote token.
- SaaS without a token fails in non-interactive execution.
- Non-loopback HTTP with a token fails before side effects.
- Loopback HTTP with a token remains supported.
- Lore config and Docker `.env` are mode `0600`.
- Failed atomic writes clean temporary files.
- Malformed Lore config fails explicitly.

### Codex

- A fake Codex executable that edits temporary TOML proves the final MCP section retains `Authorization = "Bearer ..."`.
- Token clearing removes prior MCP auth keys.
- Default install removes Lore legacy hook entries and hook files while preserving unrelated hooks.
- `LORE_CODEX_INSTALL_USER_HOOKS=1` installs compatibility hooks.
- Marketplace or MCP add non-zero exits return `failed`.
- Plugin hook JSON remains valid with platform-sensitive paths.

### Other channels

- Claude required command failures return `failed`; clearing removes old token values.
- Pi install script non-zero remains `failed`.
- OpenClaw npm/build/plugin failures return `failed`; malformed config is untouched.
- OpenCode compatibility helper failures required for an existing compatibility state return `failed` or preserve a recoverable partial state.
- Hermes output explicitly describes manual linking.

### Docker and update

- Missing Docker/Compose, failed compose download/up/pull, and health timeout return hard failures when Docker is selected.
- External-to-Docker reconfiguration starts Docker rather than reusing the external URL.
- Update defaults to installed/partial channels.
- Unknown release causes update to return non-zero.
- A failed selected channel prevents version advancement and success output.

### Verification commands

```bash
cd cli
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Also run:

```bash
node --test codex-plugin/hooks/__tests__/lifecycle-hooks.test.mjs
node --test codex-plugin/scripts/install.test.mjs
```

Run focused existing shell installer tests relevant to changed parity assumptions without modifying frozen shell behavior.

## Documentation and Versioning

Update `cli/README.md` to document:

- `@loremem/cli` as the supported installer and `scripts/install.sh` as frozen compatibility;
- token storage, restrictive permissions, and changed-origin clearing;
- SaaS token and HTTPS requirements;
- Codex bundled hooks and the explicit legacy compatibility environment variable;
- supported platforms and remaining Bash/curl/unzip requirements;
- Hermes manual-link semantics;
- update release-resolution and exit-code behavior;
- the deferred parity limitations listed above.

Update:

- `cli/package.json` from `1.3.18` to `1.3.19`;
- `cli/package-lock.json` consistently.

Do not modify the unrelated repository-root untracked `package-lock.json`.

## Downstream LoreHub Contract

The LoreHub Console command remains:

```bash
npx @loremem/cli install --base-url "<core-url>" --api-token "<lm-token>"
```

LoreHub requires no implementation change unless final verification identifies a command-contract mismatch. Console owns command presentation; the public CLI owns installation behavior.

## Release Boundary

This work ends with a buildable, testable `1.3.19` package and dry-run package inspection. It does not:

- execute `npm publish`;
- create or push a Git tag;
- create a GitHub Release;
- deploy LoreHub.

## Success Criteria

- A LoreHub-generated SaaS install leaves Codex with an authenticated MCP server.
- Modern Codex receives one Lore lifecycle hook execution path by default.
- Changing server origin never silently sends the saved token to the new origin.
- Explicit Docker selection either produces a healthy local service or fails.
- Required host command failures cannot produce a successful channel result.
- Existing malformed host JSON is not overwritten.
- Lore secret files are mode `0600`.
- Update cannot succeed without a resolved target release or after a selected channel failure.
- All focused and package-wide tests, typecheck, build, and package dry-run pass.
- CLI version and lockfile are ready for `1.3.19`, but nothing is published.
