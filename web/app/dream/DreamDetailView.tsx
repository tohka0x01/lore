'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DiffViewer from '../../components/DiffViewer';
import { Section, Button, Badge, StatCard, Notice } from '../../components/ui';
import type { DreamEntry, DreamWorkflowEvent, MemoryChange } from './useDreamPageController';

function fmtDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s ? `${m}m${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h${rm}m` : `${h}h`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type BadgeStatusTone = 'green' | 'red' | 'soft' | 'blue';
type ChangeTone = 'green' | 'red' | 'orange' | 'blue';

function statusTone(status: string): BadgeStatusTone {
  if (status === 'completed') return 'green';
  if (status === 'error') return 'red';
  if (status === 'rolled_back') return 'soft';
  return 'blue';
}

function changeTone(type: string): ChangeTone {
  if (type === 'create') return 'green';
  if (type === 'delete') return 'red';
  if (type === 'update') return 'orange';
  if (type === 'move') return 'blue';
  return 'blue';
}

function getSummaryBadges(entry: DreamEntry, t: (key: string) => string): Array<{ key: string; label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'default' }> {
  const summary = entry.summary;
  if (!summary) return [];

  const badges: Array<{ key: string; label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'default' }> = [];
  if (summary.recall_review?.possible_missed_recalls) {
    badges.push({ key: 'missed_recalls', label: `${t('Missed recalls')} ${summary.recall_review.possible_missed_recalls}`, tone: 'orange' });
  }
  if (summary.recall_review?.reviewed_queries) {
    badges.push({ key: 'reviewed_queries', label: `${t('Reviewed queries')} ${summary.recall_review.reviewed_queries}`, tone: 'blue' });
  }
  if (summary.activity?.recall_queries) {
    badges.push({ key: 'recall_queries', label: `${t('Recall queries')} ${summary.activity.recall_queries}`, tone: 'blue' });
  }
  if (summary.activity?.write_events) {
    badges.push({ key: 'write_events', label: `${t('Write events')} ${summary.activity.write_events}`, tone: 'default' });
  }
  if (summary.durable_extraction?.created) {
    badges.push({ key: 'durable_created', label: `${t('Created')} ${summary.durable_extraction.created}`, tone: 'green' });
  }
  if (summary.durable_extraction?.enriched) {
    badges.push({ key: 'durable_enriched', label: `${t('Enriched')} ${summary.durable_extraction.enriched}`, tone: 'orange' });
  }
  if (summary.maintenance?.events) {
    badges.push({ key: 'maintenance_events', label: `${t('Maintenance events')} ${summary.maintenance.events}`, tone: 'default' });
  }
  if (summary.index?.updated_count) {
    badges.push({ key: 'index_updated', label: `${t('Index updated')} ${summary.index.updated_count}`, tone: 'blue' });
  }
  if (summary.index?.deleted_count) {
    badges.push({ key: 'index_deleted', label: `${t('Index deleted')} ${summary.index.deleted_count}`, tone: 'default' });
  }
  if (summary.agent?.tool_calls != null) {
    badges.push({ key: 'tool_calls', label: `${summary.agent.tool_calls} ${t('calls')}`, tone: 'blue' });
  }
  return badges;
}

function formatProtectedNodeBlockedDetail(payload: Record<string, unknown> | undefined, t: (key: string) => string): string {
  if (!payload) return '';
  const blockedUri = typeof payload.blocked_uri === 'string' ? payload.blocked_uri : '';
  const requestedOldUri = typeof payload.requested_old_uri === 'string' ? payload.requested_old_uri : '';
  const requestedNewUri = typeof payload.requested_new_uri === 'string' ? payload.requested_new_uri : '';
  const tool = typeof payload.tool === 'string' ? payload.tool : '';

  if (tool === 'update_node' && blockedUri) return `${t('Protected boot node')} ${blockedUri} ${t('cannot be updated')}`;
  if (tool === 'delete_node' && blockedUri) return `${t('Protected boot node')} ${blockedUri} ${t('cannot be deleted')}`;
  if (tool === 'move_node' && blockedUri) {
    if (requestedNewUri && requestedNewUri === blockedUri) {
      return requestedOldUri
        ? `${t('Cannot move')} ${requestedOldUri} ${t('to protected boot path')} ${blockedUri}`
        : `${t('Cannot move')} ${t('another node')} ${t('to protected boot path')} ${blockedUri}`;
    }
    return `${t('Protected boot node')} ${blockedUri} ${t('cannot be moved')}`;
  }
  if (blockedUri) return `${t('Protected boot node')} ${blockedUri} ${t('blocked the action')}`;
  return '';
}

function getPolicyWarnings(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) return [];
  const raw = Array.isArray(payload.policy_warnings)
    ? payload.policy_warnings
    : Array.isArray(payload.warnings)
      ? payload.warnings
      : [];
  return Array.from(new Set(raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function formatPolicySignalDetail(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const tool = typeof payload.tool === 'string' ? payload.tool : '';
  const reason = typeof payload.reason === 'string'
    ? payload.reason.trim()
    : typeof payload.detail === 'string'
      ? payload.detail.trim()
      : '';
  const warnings = getPolicyWarnings(payload);
  const parts: string[] = [];
  if (tool) parts.push(tool);
  if (reason) parts.push(reason);
  if (warnings.length > 0) parts.push(warnings.join(' · '));
  return parts.join(' · ');
}

function pickWorkflowArgs(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const preferredKeys = ['uri', 'old_uri', 'new_uri', 'requested_old_uri', 'requested_new_uri', 'blocked_uri', 'query', 'keyword', 'node_uuid', 'days', 'limit', 'priority'];
  const compact: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    if (payload[key] !== undefined) compact[key] = payload[key];
  }
  if (payload.tool && Object.keys(compact).length === 0) {
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'tool' || key === 'turn' || key === 'ok' || key === 'result_preview') continue;
      compact[key] = value;
    }
  }
  const text = JSON.stringify(compact);
  return text && text !== '{}' ? text : '';
}

function workflowEventLabel(eventType: string): string {
  switch (eventType) {
    case 'run_started': return 'Run started';
    case 'phase_started': return 'Phase started';
    case 'phase_completed': return 'Phase completed';
    case 'llm_turn_started': return 'LLM turn';
    case 'tool_call_started': return 'Tool started';
    case 'tool_call_finished': return 'Tool finished';
    case 'protected_node_blocked': return 'Protected boot block';
    case 'policy_validation_blocked': return 'Policy validation block';
    case 'policy_warning_emitted': return 'Policy warning';
    case 'assistant_note': return 'Assistant note';
    case 'run_completed': return 'Run completed';
    case 'run_failed': return 'Run failed';
    default: return eventType.replace(/_/g, ' ');
  }
}

function workflowEventTone(eventType: string): 'green' | 'red' | 'orange' | 'blue' | 'default' {
  if (eventType === 'run_completed') return 'green';
  if (eventType === 'run_failed' || eventType === 'policy_validation_blocked') return 'red';
  if (eventType === 'protected_node_blocked' || eventType === 'policy_warning_emitted' || eventType === 'assistant_note') return 'orange';
  if (eventType === 'phase_completed' || eventType === 'tool_call_finished') return 'green';
  return 'blue';
}

function buildWorkflowRows(
  workflowEvents: DreamWorkflowEvent[],
  t: (key: string) => string,
): Array<{ key: string; label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'default'; detail: string; time: string | null; }> {
  const rows: Array<{ key: string; label: string; tone: 'green' | 'red' | 'orange' | 'blue' | 'default'; detail: string; time: string | null; }> = [];
  const pendingTools = new Map<string, DreamWorkflowEvent>();

  for (const event of workflowEvents) {
    if (event.event_type === 'tool_call_started') {
      const tool = String(event.payload?.tool || 'tool');
      const turn = String(event.payload?.turn || '');
      pendingTools.set(`${turn}:${tool}`, event);
      continue;
    }

    if (event.event_type === 'tool_call_finished') {
      const tool = String(event.payload?.tool || 'tool');
      const turn = String(event.payload?.turn || '');
      const key = `${turn}:${tool}`;
      const started = pendingTools.get(key);
      pendingTools.delete(key);
      rows.push({
        key: `${event.id}`,
        label: tool,
        tone: event.payload?.ok === false ? 'red' : 'blue',
        detail: pickWorkflowArgs((started?.payload as Record<string, unknown> | undefined) || event.payload),
        time: event.created_at || started?.created_at || null,
      });
      continue;
    }

    if (event.event_type === 'llm_turn_started') continue;

    if (event.event_type === 'phase_started' || event.event_type === 'phase_completed') {
      rows.push({
        key: `${event.id}`,
        label: String(event.payload?.label || workflowEventLabel(event.event_type)),
        tone: workflowEventTone(event.event_type),
        detail: '',
        time: event.created_at || null,
      });
      continue;
    }

    rows.push({
      key: `${event.id}`,
      label: workflowEventLabel(event.event_type),
      tone: workflowEventTone(event.event_type),
      detail: event.event_type === 'assistant_note'
        ? String(event.payload?.message || '')
        : event.event_type === 'protected_node_blocked'
          ? formatProtectedNodeBlockedDetail(event.payload, t)
          : event.event_type === 'policy_validation_blocked' || event.event_type === 'policy_warning_emitted'
            ? formatPolicySignalDetail(event.payload)
            : '',
      time: event.created_at || null,
    });
  }

  for (const event of pendingTools.values()) {
    rows.push({
      key: `pending-${event.id}`,
      label: String(event.payload?.tool || 'tool'),
      tone: 'blue',
      detail: pickWorkflowArgs(event.payload),
      time: event.created_at || null,
    });
  }

  return rows;
}

interface DreamDetailViewProps {
  entry: DreamEntry | null;
  loading: boolean;
  canRollback: boolean;
  rollingBack: boolean;
  onBack: () => void;
  onRollback: () => void;
  t: (key: string) => string;
}

export function DreamDetailView({ entry, loading, canRollback, rollingBack, onBack, onRollback, t }: DreamDetailViewProps): React.JSX.Element {
  const [showOriginalDiary, setShowOriginalDiary] = useState(false);
  const stats = useMemo(() => {
    const toolCalls = entry?.tool_calls || [];
    const changes = entry?.memory_changes || [];
    const workflowEvents = entry?.workflow_events || [];
    const summaryStructure = entry?.summary?.structure;
    return {
      viewed: toolCalls.filter((call) => call.tool === 'get_node').length,
      modified: toolCalls.filter((call) => call.tool === 'update_node').length,
      created: toolCalls.filter((call) => call.tool === 'create_node').length,
      deleted: toolCalls.filter((call) => call.tool === 'delete_node').length,
      moved: changes.filter((change) => change.type === 'move').length,
      protectedBlocks: summaryStructure?.protected_blocks ?? workflowEvents.filter((event) => event.event_type === 'protected_node_blocked').length,
      policyBlocks: summaryStructure?.policy_blocks ?? workflowEvents.filter((event) => event.event_type === 'policy_validation_blocked').length,
      policyWarnings: summaryStructure?.policy_warnings ?? workflowEvents.filter((event) => event.event_type === 'policy_warning_emitted').length,
    };
  }, [entry]);

  useEffect(() => {
    setShowOriginalDiary(false);
  }, [entry?.id]);

  if (loading || !entry) {
    return (
      <>
        <div className="mb-6">
          <Button variant="ghost" onClick={onBack}>← {t('Dream Diary')}</Button>
        </div>
        <div className="text-center py-12 text-txt-tertiary">{loading ? t('Loading…') : t('Not found')}</div>
      </>
    );
  }

  const rawNarrative = entry.raw_narrative || entry.narrative || '';
  const poeticNarrative = entry.poetic_narrative || entry.narrative || rawNarrative;
  const displayedNarrative = showOriginalDiary ? rawNarrative : poeticNarrative;
  const canToggleDiary = Boolean(rawNarrative && poeticNarrative && rawNarrative !== poeticNarrative);

  return (
    <>
      <div className="flex flex-col justify-between gap-3 mb-6 sm:flex-row sm:items-center">
        <Button variant="ghost" onClick={onBack}>← {t('Dream Diary')}</Button>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="min-w-[3.9rem] justify-center" tone={statusTone(entry.status)}>{t(entry.status)}</Badge>
          <span className="text-sm text-txt-tertiary">{fmtDate(entry.started_at)} · {fmtDuration(entry.duration_ms)}</span>
          {canRollback && (
            <Button variant="destructive" onClick={onRollback} disabled={rollingBack}>
              {rollingBack ? t('Rolling back…') : t('Rollback')}
            </Button>
          )}
        </div>
      </div>

      <div className="animate-in stagger-1 mb-5 grid grid-cols-2 gap-3 md:grid-cols-8">
        <StatCard label={t('Viewed')} value={stats.viewed} tone="blue" compact />
        <StatCard label={t('Modified')} value={stats.modified} tone="orange" compact />
        <StatCard label={t('Created')} value={stats.created} tone="green" compact />
        <StatCard label={t('Deleted')} value={stats.deleted} tone="red" compact />
        <StatCard label={t('Moved')} value={stats.moved} tone="blue" compact />
        <StatCard label={t('Protected')} value={stats.protectedBlocks} tone="orange" compact />
        <StatCard label={t('Policy blocks')} value={stats.policyBlocks} tone="red" compact />
        <StatCard label={t('Policy warnings')} value={stats.policyWarnings} tone="orange" compact />
      </div>

      {displayedNarrative && (
        <Section
          title={showOriginalDiary ? t('Original Diary') : t('Diary')}
          right={canToggleDiary ? (
            <Button variant="ghost" onClick={() => setShowOriginalDiary(!showOriginalDiary)}>
              {showOriginalDiary ? t('View diary') : t('View original diary')}
            </Button>
          ) : null}
          className="mb-5"
        >
          <div className="prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayedNarrative}</ReactMarkdown>
          </div>
        </Section>
      )}

      {(entry.status === 'running' || (entry.workflow_events && entry.workflow_events.length > 0)) && (
        <AgentWorkflowSection
          workflowEvents={entry.workflow_events || []}
          defaultExpanded={entry.status === 'running'}
          t={t}
        />
      )}

      {entry.memory_changes && entry.memory_changes.length > 0 && (
        <MemoryChangesSection changes={entry.memory_changes} t={t} />
      )}

      {entry.summary && (
        <Section title={t('Dream Summary')} className="mt-5">
          <div className="flex gap-2 flex-wrap">
            {getSummaryBadges(entry, t).map((badge) => (
              <Badge key={badge.key} tone={badge.tone}>{badge.label}</Badge>
            ))}
          </div>
        </Section>
      )}

      {entry.error && (
        <Notice tone="danger" className="mt-5">
          <span className="font-mono">{entry.error}</span>
        </Notice>
      )}
    </>
  );
}

interface AgentWorkflowSectionProps {
  workflowEvents: DreamWorkflowEvent[];
  defaultExpanded: boolean;
  t: (key: string) => string;
}

function AgentWorkflowSection({ workflowEvents, defaultExpanded, t }: AgentWorkflowSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rows = useMemo(() => buildWorkflowRows(workflowEvents, t), [workflowEvents, t]);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <Section
      title={t('Agent Workflow')}
      subtitle={`${rows.length}`}
      right={
        <Button variant="ghost" onClick={() => setExpanded(!expanded)}>
          <span aria-hidden>{expanded ? '▲' : '▼'}</span>
        </Button>
      }
      className="mb-5"
    >
      {expanded && (
        rows.length > 0 ? (
          <div className="space-y-2 max-h-[360px] overflow-y-auto sm:max-h-[560px]">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start gap-2 rounded-xl border border-separator-thin bg-bg-raised px-3 py-3">
                <Badge tone={row.tone}>{t(row.label)}</Badge>
                <div className="min-w-0 flex-1">
                  {row.detail && <div className="truncate text-xs font-mono text-txt-secondary">{row.detail}</div>}
                </div>
                <span className="shrink-0 text-xs text-txt-tertiary">{fmtDate(row.time)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-txt-tertiary">{t('Waiting for workflow events…')}</div>
        )
      )}
    </Section>
  );
}

interface MemoryChangesSectionProps {
  changes: MemoryChange[];
  t: (key: string) => string;
}

function MemoryChangesSection({ changes, t }: MemoryChangesSectionProps): React.JSX.Element {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <Section title={t('Memory Changes')} subtitle={`${changes.length}`} className="mb-5">
      <div className="space-y-2">
        {changes.map((change, index) => (
          <div key={index} className="rounded-xl border border-separator-thin bg-bg-raised overflow-hidden">
            <div
              className="flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-fill-quaternary"
              onClick={() => setExpandedIdx(expandedIdx === index ? null : index)}
            >
              <Badge tone={changeTone(change.type)}>{t(change.type)}</Badge>
              <code className="text-xs font-mono text-txt-primary flex-1 truncate">{change.uri}</code>
              {change.before?.priority !== undefined && change.after?.priority !== undefined && change.before.priority !== change.after.priority && (
                <span className="text-xs text-txt-tertiary">P{change.before.priority}→P{change.after.priority}</span>
              )}
              {change.type === 'move' && change.before?.uri && change.after?.uri && (
                <span className="max-w-[16rem] truncate text-xs text-txt-tertiary">{change.before.uri} → {change.after.uri}</span>
              )}
              <span className="text-[11px] text-txt-quaternary">{expandedIdx === index ? '▲' : '▼'}</span>
            </div>
            {expandedIdx === index && (
              <div className="space-y-2 border-t border-separator-thin px-3 py-3">
                {change.type === 'update' && change.before?.content !== undefined && change.after?.content !== undefined ? (
                  <DiffViewer oldText={change.before.content} newText={change.after.content} />
                ) : change.type === 'move' && change.before?.uri && change.after?.uri ? (
                  <div className="space-y-1 text-xs text-txt-tertiary">
                    <div>{t('Before')}: <code className="font-mono text-txt-primary">{change.before.uri}</code></div>
                    <div>{t('After')}: <code className="font-mono text-txt-primary">{change.after.uri}</code></div>
                  </div>
                ) : change.type === 'create' && change.after?.content ? (
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-txt-tertiary">{t('After')}</div>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs font-mono text-txt-secondary">{change.after.content}</pre>
                  </div>
                ) : change.type === 'delete' && change.before?.content ? (
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-txt-tertiary">{t('Before')}</div>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs font-mono text-txt-secondary line-through opacity-60">{change.before.content}</pre>
                  </div>
                ) : (
                  <div className="text-xs text-txt-tertiary">
                    {change.before && <div>{t('Before')}: {JSON.stringify(change.before)}</div>}
                    {change.after && <div>{t('After')}: {JSON.stringify(change.after)}</div>}
                  </div>
                )}
                {change.type === 'update' && change.before?.disclosure !== change.after?.disclosure && (
                  <div className="mt-1 text-xs text-txt-tertiary">
                    {t('Disclosure changed')}: <span className="line-through opacity-60">{change.before?.disclosure || t('(none)')}</span> → <span className="text-txt-primary">{change.after?.disclosure || t('(none)')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
