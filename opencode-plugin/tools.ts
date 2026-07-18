import { tool, type Hooks, type ToolContext, type ToolResult } from '@opencode-ai/plugin';
import contracts from './tool-contracts.json' with { type: 'json' };
import { loreFetchJson, type LoreRequestInit } from './api.js';
import type { LorePluginConfig } from './config.js';
import { formatBootView, formatNode, formatSearchResults, normalizeKeywordList } from './formatters.js';
import { resolveMemoryLocator, splitParentPathAndTitle } from './uri.js';

export const OPEN_CODE_TOOL_NAMES = [
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
] as const;

type ToolName = typeof OPEN_CODE_TOOL_NAMES[number];
type ToolContract = typeof contracts[number];

type LoreNodePayload = {
  node?: { uri?: string };
  children?: unknown[];
};

function contract(name: ToolName): ToolContract {
  const found = contracts.find((item) => item.name === name);
  if (!found) throw new Error(`Missing generated OpenCode tool contract: ${name}`);
  return found;
}

function parameterDescription(name: ToolName, parameter: string): string {
  const found = contract(name).parameters.find((item) => item.name === parameter);
  if (!found) throw new Error(`Missing generated OpenCode tool parameter contract: ${name}.${parameter}`);
  return found.description;
}

function metadata(context: ToolContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionID: context.sessionID,
    messageID: context.messageID,
    directory: context.directory,
    worktree: context.worktree,
    ...extra,
  };
}

function result(context: ToolContext, title: string, output: string, extra: Record<string, unknown> = {}): ToolResult {
  return { title, output, metadata: metadata(context, extra) };
}

async function request<T>(
  config: LorePluginConfig,
  context: ToolContext,
  pathname: string,
  init: LoreRequestInit = {},
): Promise<T> {
  return loreFetchJson<T>(config, pathname, { ...init, signal: context.abort });
}

function writeBody<T extends Record<string, unknown>>(context: ToolContext, body: T): T & { session_id: string } {
  return { ...body, session_id: context.sessionID };
}

export function createLoreTools(config: LorePluginConfig): NonNullable<Hooks['tool']> {
  return {
    lore_guidance: tool({
      description: contract('lore_guidance').description,
      args: {},
      async execute(_args, context) {
        const data = await request<{ guidance?: string }>(config, context, '/lifecycle/guidance');
        return result(context, 'Lore guidance', data.guidance ?? '');
      },
    }),

    lore_status: tool({
      description: contract('lore_status').description,
      args: {},
      async execute(_args, context) {
        const data = await request<unknown>(config, context, '/health');
        return result(context, 'Lore status', `Lore online\n\n${JSON.stringify(data, null, 2)}`);
      },
    }),

    lore_boot: tool({
      description: contract('lore_boot').description,
      args: {},
      async execute(_args, context) {
        const data = await request<unknown>(config, context, '/browse/boot');
        return result(context, 'Lore boot', formatBootView(data));
      },
    }),

    lore_get_node: tool({
      description: contract('lore_get_node').description,
      args: {
        uri: tool.schema.string().describe(parameterDescription('lore_get_node', 'uri')),
        nav_only: tool.schema.boolean().optional().describe(parameterDescription('lore_get_node', 'nav_only')),
        session_id: tool.schema.string().optional().describe(parameterDescription('lore_get_node', 'session_id')),
        query_id: tool.schema.string().optional().describe(parameterDescription('lore_get_node', 'query_id')),
      },
      async execute(args, context) {
        const locator = resolveMemoryLocator(args, {
          defaultDomain: config.defaultDomain,
          pathKey: '__unused_path',
          allowEmptyPath: true,
          label: 'uri',
        });
        const data = await request<LoreNodePayload>(config, context, '/browse/node', {
          search: new URLSearchParams({
            domain: locator.domain,
            path: locator.path,
            nav_only: String(args.nav_only === true),
          }),
        });
        const sessionID = args.session_id?.trim() || context.sessionID;
        const queryID = args.query_id?.trim() || '';
        const nodeURI = data.node?.uri?.trim() || '';
        if (queryID && nodeURI) {
          try {
            await request(config, context, '/browse/recall/usage', {
              method: 'POST',
              body: {
                query_id: queryID,
                session_id: sessionID,
                node_uris: [nodeURI],
                source: 'tool:lore_get_node',
                success: true,
              },
            });
          } catch {
            // Best effort: opening the node remains successful if usage marking is unavailable.
          }
        }
        return result(context, 'Lore node', formatNode(data), { uri: nodeURI || `${locator.domain}://${locator.path}` });
      },
    }),

    lore_search: tool({
      description: contract('lore_search').description,
      args: {
        query: tool.schema.string().describe(parameterDescription('lore_search', 'query')),
        domain: tool.schema.string().optional().describe(parameterDescription('lore_search', 'domain')),
        limit: tool.schema.number().int().min(1).max(100).optional().describe(parameterDescription('lore_search', 'limit')),
        content_limit: tool.schema.number().int().min(0).max(20).optional().describe(parameterDescription('lore_search', 'content_limit')),
      },
      async execute(args, context) {
        const query = args.query.trim();
        const domain = args.domain?.trim() || null;
        if (domain && (!query || query === '*')) {
          const data = await request(config, context, '/browse/node', {
            search: new URLSearchParams({ domain, path: '', nav_only: 'true' }),
          });
          return result(context, 'Lore domain', `Domain root: ${domain}://\n\n${formatNode(data)}`);
        }
        const data = await request(config, context, '/browse/search', {
          method: 'POST',
          body: {
            query,
            domain,
            limit: args.limit ?? 10,
            content_limit: args.content_limit ?? 5,
          },
        });
        return result(context, 'Lore search', formatSearchResults(data, domain));
      },
    }),

    lore_list_domains: tool({
      description: contract('lore_list_domains').description,
      args: {},
      async execute(_args, context) {
        const data = await request<unknown[]>(config, context, '/browse/domains');
        const output = Array.isArray(data) && data.length > 0
          ? data.map((item) => {
            const domain = String((item as Record<string, unknown>).domain ?? '');
            const count = String((item as Record<string, unknown>).root_count ?? '');
            return `- ${domain} (${count}) — open root with lore_get_node uri="${domain}://" nav_only=true`;
          }).join('\n')
          : 'No domains found.';
        return result(context, 'Lore domains', output);
      },
    }),

    lore_create_node: tool({
      description: contract('lore_create_node').description,
      args: {
        content: tool.schema.string().describe(parameterDescription('lore_create_node', 'content')),
        priority: tool.schema.number().int().min(0).describe(parameterDescription('lore_create_node', 'priority')),
        glossary: tool.schema.array(tool.schema.string()).describe(parameterDescription('lore_create_node', 'glossary')),
        uri: tool.schema.string().optional().describe(parameterDescription('lore_create_node', 'uri')),
        domain: tool.schema.string().optional().describe(parameterDescription('lore_create_node', 'domain')),
        parent_path: tool.schema.string().optional().describe(parameterDescription('lore_create_node', 'parent_path')),
        title: tool.schema.string().optional().describe(parameterDescription('lore_create_node', 'title')),
        disclosure: tool.schema.string().optional().describe(parameterDescription('lore_create_node', 'disclosure')),
      },
      async execute(args, context) {
        let domain = args.domain?.trim() || config.defaultDomain;
        let parentPath = args.parent_path?.trim().replace(/^\/+|\/+$/g, '') || '';
        let title = args.title?.trim() || '';
        if (args.uri?.trim()) {
          const target = resolveMemoryLocator(args, {
            defaultDomain: config.defaultDomain,
            pathKey: 'parent_path',
            allowEmptyPath: false,
            label: 'uri',
          });
          const derived = splitParentPathAndTitle(target.path);
          if (!derived.title) throw new Error('Create target URI must include a final path segment.');
          if (title && title !== derived.title) throw new Error(`Conflicting uri and title: ${derived.title} vs ${title}`);
          domain = target.domain;
          parentPath = derived.parentPath;
          title = derived.title;
        }
        const glossary = normalizeKeywordList(args.glossary);
        const data = await request<Record<string, unknown>>(config, context, '/browse/node', {
          method: 'POST',
          body: writeBody(context, {
            domain,
            parent_path: parentPath,
            title,
            content: args.content,
            priority: args.priority,
            glossary,
            ...(args.disclosure === undefined ? {} : { disclosure: args.disclosure }),
          }),
        });
        const uri = String(data.uri ?? `${domain}://${parentPath}/${title}`).replace(/\/+/g, '/').replace(':/', '://');
        return result(context, 'Lore create', `Created ${uri}${glossary.length > 0 ? `\nGlossary: ${glossary.join(', ')}` : ''}`);
      },
    }),

    lore_update_node: tool({
      description: contract('lore_update_node').description,
      args: {
        uri: tool.schema.string().describe(parameterDescription('lore_update_node', 'uri')),
        content: tool.schema.string().optional().describe(parameterDescription('lore_update_node', 'content')),
        priority: tool.schema.number().int().min(0).optional().describe(parameterDescription('lore_update_node', 'priority')),
        disclosure: tool.schema.string().optional().describe(parameterDescription('lore_update_node', 'disclosure')),
        glossary_add: tool.schema.array(tool.schema.string()).optional().describe(parameterDescription('lore_update_node', 'glossary_add')),
        glossary_remove: tool.schema.array(tool.schema.string()).optional().describe(parameterDescription('lore_update_node', 'glossary_remove')),
      },
      async execute(args, context) {
        const locator = resolveMemoryLocator(args, {
          defaultDomain: config.defaultDomain,
          pathKey: '__unused_path',
          allowEmptyPath: false,
          label: 'uri',
        });
        const glossaryAdd = normalizeKeywordList(args.glossary_add);
        const glossaryRemove = normalizeKeywordList(args.glossary_remove);
        const body: Record<string, unknown> = { session_id: context.sessionID };
        if (args.content !== undefined) body.content = args.content;
        if (args.priority !== undefined) body.priority = args.priority;
        if (args.disclosure !== undefined) body.disclosure = args.disclosure;
        if (glossaryAdd.length > 0) body.glossary_add = glossaryAdd;
        if (glossaryRemove.length > 0) body.glossary_remove = glossaryRemove;
        const data = await request<Record<string, unknown>>(config, context, '/browse/node', {
          method: 'PUT',
          search: new URLSearchParams({ domain: locator.domain, path: locator.path }),
          body,
        });
        return result(context, 'Lore update', `Updated ${String(data.uri ?? args.uri)}`);
      },
    }),

    lore_delete_node: tool({
      description: contract('lore_delete_node').description,
      args: {
        uri: tool.schema.string().describe(parameterDescription('lore_delete_node', 'uri')),
      },
      async execute(args, context) {
        const locator = resolveMemoryLocator(args, {
          defaultDomain: config.defaultDomain,
          pathKey: '__unused_path',
          allowEmptyPath: false,
          label: 'uri',
        });
        const data = await request<Record<string, unknown>>(config, context, '/browse/node', {
          method: 'DELETE',
          search: new URLSearchParams({ domain: locator.domain, path: locator.path }),
          body: writeBody(context, {}),
        });
        return result(context, 'Lore delete', `Deleted ${String(data.deleted_uri ?? data.uri ?? args.uri)}`);
      },
    }),

    lore_move_node: tool({
      description: contract('lore_move_node').description,
      args: {
        old_uri: tool.schema.string().describe(parameterDescription('lore_move_node', 'old_uri')),
        new_uri: tool.schema.string().describe(parameterDescription('lore_move_node', 'new_uri')),
      },
      async execute(args, context) {
        const data = await request<Record<string, unknown>>(config, context, '/browse/move', {
          method: 'POST',
          body: writeBody(context, {
            old_uri: args.old_uri.trim(),
            new_uri: args.new_uri.trim(),
          }),
        });
        return result(context, 'Lore move', `Moved ${String(data.old_uri ?? args.old_uri)} → ${String(data.new_uri ?? data.uri ?? args.new_uri)}`);
      },
    }),
  };
}
