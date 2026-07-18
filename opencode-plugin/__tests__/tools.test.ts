import type { ToolContext, ToolResult } from '@opencode-ai/plugin';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoreTools, OPEN_CODE_TOOL_NAMES } from '../tools.js';

const config = {
  baseUrl: 'https://api.example.test',
  apiToken: 'super-secret-token',
  startupTimeoutMs: 8_000,
  requestTimeoutMs: 30_000,
  defaultDomain: 'core',
};

function context(abort = new AbortController()): ToolContext {
  return {
    sessionID: 'ses-context',
    messageID: 'msg-context',
    agent: 'build',
    directory: '/workspace/project',
    worktree: '/workspace',
    abort: abort.signal,
    metadata: vi.fn(),
    ask: vi.fn(async () => undefined),
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function resultOutput(result: ToolResult): string {
  return typeof result === 'string' ? result : result.output;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('native OpenCode Lore tools', () => {
  it('registers the exact cross-runtime inventory in canonical order', () => {
    expect(Object.keys(createLoreTools(config))).toEqual(OPEN_CODE_TOOL_NAMES);
    expect(OPEN_CODE_TOOL_NAMES).toEqual([
      'lore_guidance',
      'lore_status',
      'lore_boot',
      'lore_get_node',
      'lore_search',
      'lore_list_domains',
      'lore_create_node',
      'lore_update_node',
      'lore_delete_node',
      'lore_move_node',
    ]);
  });

  it('maps every native tool directly to Lore REST with identity and cancellation', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const method = init.method ?? 'GET';
      const path = url.pathname;

      if (path === '/api/lifecycle/guidance') return jsonResponse({ guidance: 'SERVER GUIDANCE' });
      if (path === '/api/health') return jsonResponse({ status: 'ok' });
      if (path === '/api/browse/boot') return jsonResponse({ loaded: 0, total: 0, core_memories: [] });
      if (path === '/api/browse/recall/usage') return jsonResponse({ updated: 1 });
      if (path === '/api/browse/search') return jsonResponse({ results: [] });
      if (path === '/api/browse/domains') return jsonResponse([{ domain: 'core', root_count: 3 }]);
      if (path === '/api/browse/move') return jsonResponse({ old_uri: 'core://old', new_uri: 'core://new' });
      if (path === '/api/browse/node' && method === 'GET') {
        return jsonResponse({ node: { uri: 'core://agent', priority: 0, content: 'Agent' }, children: [] });
      }
      if (path === '/api/browse/node' && method === 'POST') return jsonResponse({ uri: 'project://runtime/opencode' });
      if (path === '/api/browse/node' && method === 'PUT') return jsonResponse({ uri: 'project://runtime/opencode' });
      if (path === '/api/browse/node' && method === 'DELETE') return jsonResponse({ deleted_uri: 'project://runtime/opencode' });
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    const controller = new AbortController();
    const toolContext = context(controller);
    const tools = createLoreTools(config);
    const results = await Promise.all([
      tools.lore_guidance.execute({}, toolContext),
      tools.lore_status.execute({}, toolContext),
      tools.lore_boot.execute({}, toolContext),
      tools.lore_get_node.execute({
        uri: 'core://agent',
        nav_only: false,
        session_id: 'ses-explicit',
        query_id: 'query-1',
      }, toolContext),
      tools.lore_search.execute({ query: 'OpenCode', domain: 'project', limit: 10, content_limit: 5 }, toolContext),
      tools.lore_list_domains.execute({}, toolContext),
      tools.lore_create_node.execute({
        uri: 'project://runtime/opencode',
        content: 'OpenCode contract',
        priority: 2,
        glossary: ['OpenCode'],
      }, toolContext),
      tools.lore_update_node.execute({
        uri: 'project://runtime/opencode',
        content: 'Updated contract',
        glossary_add: ['native tools'],
        glossary_remove: [],
      }, toolContext),
      tools.lore_delete_node.execute({ uri: 'project://runtime/opencode' }, toolContext),
      tools.lore_move_node.execute({ old_uri: 'core://old', new_uri: 'core://new' }, toolContext),
    ]);

    expect(resultOutput(results[0])).toBe('SERVER GUIDANCE');
    expect(resultOutput(results[3])).toContain('URI: core://agent');
    expect(JSON.stringify(results)).not.toContain(config.apiToken);
    for (const result of results) {
      expect(result).toEqual(expect.objectContaining({
        metadata: expect.objectContaining({
          sessionID: 'ses-context',
          messageID: 'msg-context',
          directory: '/workspace/project',
          worktree: '/workspace',
        }),
      }));
    }

    const requestSummary = calls.map(({ url, init }) => `${init.method ?? 'GET'} ${url.pathname}`);
    expect(requestSummary).toEqual([
      'GET /api/lifecycle/guidance',
      'GET /api/health',
      'GET /api/browse/boot',
      'GET /api/browse/node',
      'POST /api/browse/search',
      'GET /api/browse/domains',
      'POST /api/browse/node',
      'PUT /api/browse/node',
      'DELETE /api/browse/node',
      'POST /api/browse/move',
      'POST /api/browse/recall/usage',
    ]);
    for (const { url, init } of calls) {
      if (url.pathname === '/api/health') expect(url.searchParams.has('client_type')).toBe(false);
      else expect(url.searchParams.get('client_type')).toBe('opencode');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }

    const usage = calls.find(({ url }) => url.pathname === '/api/browse/recall/usage');
    expect(JSON.parse(String(usage?.init.body))).toEqual({
      query_id: 'query-1',
      session_id: 'ses-explicit',
      node_uris: ['core://agent'],
      source: 'tool:lore_get_node',
      success: true,
    });

    const writes = calls.filter(({ url, init }) => (
      url.pathname === '/api/browse/move'
      || (url.pathname === '/api/browse/node' && ['POST', 'PUT', 'DELETE'].includes(String(init.method)))
    ));
    for (const write of writes) {
      expect(JSON.parse(String(write.init.body))).toEqual(expect.objectContaining({ session_id: 'ses-context' }));
    }

    controller.abort();
    for (const { init } of calls) expect(init.signal?.aborted).toBe(true);
  });

  it('keeps node output when best-effort adoption marking fails and falls back to ToolContext sessionID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        node: { uri: 'project://runtime/opencode', priority: 1, content: 'OpenCode' },
        children: [],
      }))
      .mockRejectedValueOnce(new Error('usage unavailable'));

    const result = await createLoreTools(config).lore_get_node.execute({
      uri: 'project://runtime/opencode',
      query_id: 'query-2',
    }, context());

    expect(resultOutput(result)).toContain('project://runtime/opencode');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(expect.objectContaining({
      session_id: 'ses-context',
      query_id: 'query-2',
    }));
  });
});
