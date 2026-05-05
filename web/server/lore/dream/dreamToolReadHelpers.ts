import { getNodePayload } from '../memory/browse';
import { markSessionRead } from '../memory/session';
import { parseUri } from '../core/utils';
import { listMemoryViewsByNode } from '../view/memoryViewQueries';

interface DreamReadEventContext {
  source: string;
  session_id?: string | null;
}

interface DreamReadableNode {
  uri?: unknown;
  node_uuid?: unknown;
}

interface DreamTreeNode {
  uri: string;
  node_uuid: string | null;
  priority: number | null;
  disclosure: string | null;
  content_snippet: string;
  child_count: number;
  children: DreamTreeNode[];
}

interface DreamTreeInspection {
  uri: string;
  depth: number;
  max_nodes: number;
  visited_nodes: number;
  truncated: boolean;
  tree: DreamTreeNode;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function snippet(content: unknown): string {
  const text = String(content || '');
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function gistSnippetFromViews(views: unknown): string {
  if (!Array.isArray(views)) return '';
  const gist = views.find((view) => {
    if (!view || typeof view !== 'object') return false;
    const record = view as Record<string, unknown>;
    return record.view_type === 'gist' && typeof record.text_content === 'string' && record.text_content.trim();
  }) as Record<string, unknown> | undefined;
  return snippet(gist?.text_content);
}

async function getChildGistSnippet(child: Record<string, unknown>): Promise<string> {
  const fromInlineViews = gistSnippetFromViews(child.memory_views);
  if (fromInlineViews) return fromInlineViews;

  const nodeUuid = typeof child.node_uuid === 'string' ? child.node_uuid : '';
  const uri = typeof child.uri === 'string' ? child.uri : '';
  if (!nodeUuid && !uri) return '';

  const views = await listMemoryViewsByNode({ nodeUuid, uri, limit: 2 });
  return gistSnippetFromViews(views);
}

async function toTreeLeaf(child: Record<string, unknown>): Promise<DreamTreeNode> {
  const gistSnippet = await getChildGistSnippet(child);
  return {
    uri: String(child.uri || ''),
    node_uuid: typeof child.node_uuid === 'string' ? child.node_uuid : null,
    priority: Number.isFinite(Number(child.priority)) ? Number(child.priority) : null,
    disclosure: typeof child.disclosure === 'string' && child.disclosure.trim() ? child.disclosure : null,
    content_snippet: gistSnippet || snippet(child.content_snippet),
    child_count: Number.isFinite(Number(child.approx_children_count)) ? Number(child.approx_children_count) : 0,
    children: [],
  };
}

async function trackDreamRead(
  node: DreamReadableNode | null | undefined,
  eventContext: DreamReadEventContext,
  sourceSuffix: string,
): Promise<void> {
  const sessionId = eventContext.session_id ?? null;
  const uri = typeof node?.uri === 'string' ? node.uri : '';
  const nodeUuid = typeof node?.node_uuid === 'string' ? node.node_uuid : '';
  if (!sessionId || !uri || !nodeUuid) return;

  try {
    await markSessionRead({
      session_id: sessionId,
      uri,
      node_uuid: nodeUuid,
      source: `${eventContext.source}:${sourceSuffix}`,
    });
  } catch {
    // best effort only
  }
}

export async function inspectTree(
  uri: string,
  {
    depth = 2,
    maxNodes = 60,
  }: {
    depth?: number;
    maxNodes?: number;
  } = {},
  eventContext: DreamReadEventContext = { source: 'dream:auto' },
): Promise<DreamTreeInspection> {
  const safeDepth = clampInteger(depth, 1, 4, 2);
  const safeMaxNodes = clampInteger(maxNodes, 1, 120, 60);
  const { domain, path } = parseUri(uri);
  let visitedNodes = 0;
  let truncated = false;
  const seenUris = new Set<string>();

  async function loadNode(currentUri: string, level: number): Promise<DreamTreeNode> {
    const parsed = parseUri(currentUri);
    const payload = await getNodePayload({ domain: parsed.domain, path: parsed.path });
    await trackDreamRead(payload.node, eventContext, 'inspect_tree');
    visitedNodes += 1;

    const nodeUri = String(payload.node?.uri || currentUri);
    seenUris.add(nodeUri);
    const children = Array.isArray(payload.children) ? payload.children : [];
    const leafChildren = await Promise.all(children.map((child) => toTreeLeaf(child as unknown as Record<string, unknown>)));
    const treeNode: DreamTreeNode = {
      uri: nodeUri,
      node_uuid: typeof payload.node?.node_uuid === 'string' ? payload.node.node_uuid : null,
      priority: Number.isFinite(Number(payload.node?.priority)) ? Number(payload.node.priority) : null,
      disclosure: typeof payload.node?.disclosure === 'string' && payload.node.disclosure.trim() ? payload.node.disclosure : null,
      content_snippet: gistSnippetFromViews(payload.node?.memory_views) || snippet(payload.node?.content),
      child_count: children.length,
      children: leafChildren,
    };

    if (level >= safeDepth || children.length === 0) return treeNode;

    const nestedChildren: DreamTreeNode[] = [];
    for (const child of children) {
      const childUri = String(child.uri || '').trim();
      if (!childUri || seenUris.has(childUri)) {
        nestedChildren.push(await toTreeLeaf(child as unknown as Record<string, unknown>));
        continue;
      }
      if (visitedNodes >= safeMaxNodes) {
        truncated = true;
        nestedChildren.push(await toTreeLeaf(child as unknown as Record<string, unknown>));
        continue;
      }
      nestedChildren.push(await loadNode(childUri, level + 1));
    }
    treeNode.children = nestedChildren;
    return treeNode;
  }

  const tree = await loadNode(`${domain}://${path}`, 1);
  return {
    uri: `${domain}://${path}`,
    depth: safeDepth,
    max_nodes: safeMaxNodes,
    visited_nodes: visitedNodes,
    truncated,
    tree,
  };
}

export async function inspectNeighbors(
  uri: string,
  eventContext: DreamReadEventContext = { source: 'dream:auto' },
): Promise<Record<string, unknown>> {
  const { domain, path: currentPath } = parseUri(uri);
  const current = await getNodePayload({ domain, path: currentPath });
  await trackDreamRead(current.node, eventContext, 'inspect_neighbors');
  const aliases = Array.isArray(current.node?.aliases) ? current.node.aliases : [];
  const breadcrumbs = Array.isArray(current.breadcrumbs) ? current.breadcrumbs : [];
  const children = Array.isArray(current.children) ? current.children : [];

  const segments = currentPath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { uri: `${domain}://${currentPath}`, parent: null, siblings: [], children, aliases, breadcrumbs };
  }

  const parentPath = segments.slice(0, -1).join('/');
  const parent = await getNodePayload({ domain, path: parentPath });
  await trackDreamRead(parent.node, eventContext, 'inspect_neighbors');
  const siblings = (Array.isArray(parent.children) ? parent.children : []).filter((child) => child.uri !== uri);

  return {
    uri: `${domain}://${currentPath}`,
    parent: parent.node,
    siblings,
    children,
    aliases,
    breadcrumbs,
  };
}
