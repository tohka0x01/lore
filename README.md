# Lore — one memory system across all your agents

[中文 README](./README.zh-CN.md)

## 1. Screenshots

<p align="center">
  <img src="docs/screenshots/recall-analytics.jpg" alt="Recall Analytics">
</p>

| Recall Workbench | Memory Browser | Dream Diary |
|:-:|:-:|:-:|
| ![Recall Workbench](docs/screenshots/recall-workbench.jpg) | ![Memory Browser](docs/screenshots/memory-browser.jpg) | ![Dream Diary](docs/screenshots/dream-diary.jpg) |

---

## 2. Design philosophy

Lore is a long-term memory system for AI agents. It gives an agent a durable memory graph, a fixed startup baseline, per-prompt recall, explicit read tracking, and cautious write tools.

Supported runtimes:

| Runtime | Integration | Notes |
|---|---|---|
| **Pi** | `pi-extension/` | Best fit. Pi leaves long-term memory to extensions and keeps its system prompt compact, so Lore can act as the primary memory layer with little prompt competition. |
| **Claude Code** | `claudecode-plugin/` | MCP tools, session-start boot injection, per-prompt recall injection, and guidance rules. |
| **Codex** | `codex-plugin/` | Local marketplace plugin, MCP config, and optional hooks for boot / recall injection. |
| **OpenClaw** | `openclaw-plugin/` | Runtime plugin with boot, recall, and Lore tools. |
| **Hermes** | `hermes-plugin/` | MemoryProvider plugin with Lore tools and recall support. |
| **Generic MCP clients** | `/api/mcp` | Streamable HTTP MCP endpoint for clients that can connect to remote tools. |

Most agent memory systems stop at retrieval. Lore focuses on the full memory lifecycle:

- **Boot baseline** — every session starts with stable identity, workflow, user, and runtime memories.
- **Recall before reply** — the agent receives a small `<recall>` block with relevant candidates before answering.
- **Read before trust** — recalled candidates are cues; the agent opens the memory node before relying on it.
- **URI-first graph** — memories live at durable URIs such as `core://agent`, `preferences://user`, and `project://my_project`.
- **Disclosure triggers** — each memory carries a natural-language condition that explains when it should surface.
- **Policy-guided writes** — priority budgets, read-before-modify checks, and boot-node protection keep the graph stable.
- **Dream maintenance** — scheduled review can inspect recall quality, structure, and stale nodes with rollback history.

Lore is built for agents that need continuity across sessions, tools, and runtimes.

---

## 3. Quick start

### 1. Start the server

Create a `.env` file:

```bash
POSTGRES_PASSWORD=your-secure-password
```

Create a `docker-compose.yml` — or just run the install script which does everything:

```bash
curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash -s -- --pre
```

Or manually create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: fffattiger/pgvector-zhparser:pg16
    restart: unless-stopped
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      POSTGRES_DB: ${POSTGRES_DB:-lore}
      POSTGRES_USER: ${POSTGRES_USER:-lore}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-me}
    ports:
      - "${POSTGRES_PORT:-55439}:5432"
    volumes:
      - ${POSTGRES_DATA_DIR:-./data/postgres}:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-lore} -d ${POSTGRES_DB:-lore}"]
      interval: 10s
      timeout: 5s
      retries: 10

  web:
    image: fffattiger/lore:latest
    restart: unless-stopped
    pull_policy: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      DATABASE_URL: postgresql://${POSTGRES_USER:-lore}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lore}
      API_TOKEN: ${API_TOKEN:-}
    ports:
      - "${WEB_PORT:-18901}:18901"
    volumes:
      - ${SNAPSHOT_DATA_DIR:-./data/snapshots}:/app/snapshots
```

Start Lore:

```bash
docker compose up -d
```

Check health:

```bash
curl http://127.0.0.1:18901/api/health
```

Open the UI:

```text
http://127.0.0.1:18901
```

### 2. Complete first-run setup

After the server is running, open:

```text
http://127.0.0.1:18901/setup
```

Complete the setup flow:

1. **Embedding setup** — configure an OpenAI-compatible embedding endpoint.
   - `Embedding Base URL`, for example `http://host.docker.internal:8090/v1`
   - `Embedding API Key`
   - `Embedding Model`, for example `text-embedding-3-small`
2. **View LLM setup** — configure the model used by view refinement and Dream.
   - `View LLM Base URL`
   - `View LLM API Key`
   - `View LLM Model`, for example `deepseek-v4-flash`
3. **Global boot memories** — review or save defaults for:
   - `core://agent`
   - `core://soul`
   - `preferences://user`
4. **Channel agent memories** — review or save defaults for runtime-specific memories:
   - `core://agent/claudecode`
   - `core://agent/codex`
   - `core://agent/openclaw`
   - `core://agent/hermes`
   - `core://agent/pi`

The `Skip` button saves the default value for an empty boot node and moves forward.

### 3. Configure optional runtime settings

Open `/settings` after setup for:

- recall scoring weights and thresholds
- View LLM for view refinement and Dream
- Dream schedule
- backup settings
- write policy settings

Embedding is required for semantic recall and index rebuilds. View LLM is required during setup so Dream and view refinement are ready when you enable them.

#### Source build

For local development or custom builds:

```bash
git clone https://github.com/FFatTiger/lore.git
cd lore
docker compose up -d --build
```

---

## 4. Connect agents

```bash
curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash
```

The install script interactively asks which agent runtimes to set up and lets you
configure the Lore server URL. After installing, restart each agent runtime.

> **Environment variables take highest priority.** Set `LORE_BASE_URL` and
> `LORE_API_TOKEN` in your environment before running the script to skip the
> interactive prompts. The script writes them to a config file
> (`~/.config/lore/env`) and, for Claude Code, to `~/.claude/settings.json`.

### What each runtime gets

| Runtime | Integration |
|---|---|
| **Claude Code** | Marketplace plugin, MCP tools, SessionStart boot injection, per-prompt recall, `@import` guidance in CLAUDE.md |
| **Codex** | Local marketplace plugin, MCP config, boot/recall hooks |
| **Pi** | Extension tools, startup boot + recall context |
| **OpenClaw** | Runtime plugin with boot, recall, and Lore tools |
| **Hermes** | MemoryProvider plugin, tools, recall support |
| **Generic MCP** | `http://your-host:18901/api/mcp?client_type=mcp` |

> **Claude Code note:** Claude Code has a built-in auto-memory feature. The
> install script does not disable it — if you want Lore as your only memory
> system, set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` or `"autoMemoryEnabled": false`
> in `~/.claude/settings.json`.

### Non-interactive install

```bash
# Install specific channels only
export LORE_BASE_URL=http://192.168.1.100:18901
export LORE_INSTALL_CHANNELS=claudecode,codex
curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash

# Skip all prompts
export LORE_INSTALL_NO_INTERACTIVE=1
curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash
```

---

## 5. Daily use

Once connected, the agent workflow is:

1. load boot memories at session start
2. receive `<recall>` candidates before user prompts
3. open relevant nodes with `lore_get_node`
4. create or update durable memories when something should survive the session
5. use the Web UI to inspect recall quality, memory history, settings, backup, and Dream maintenance

Useful UI pages:

- `/memory` — browse and edit the memory graph
- `/recall` — inspect retrieval stages and scoring
- `/dream` — run structural maintenance
- `/settings` — configure runtime behavior

---

## 6. Development

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
```

Requires Node.js 20+ and PostgreSQL with the `vector` extension.
