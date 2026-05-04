'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AxiosError } from 'axios';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { AppTextArea, Badge, Button, LoadingBlock, Notice, surfaceCardClassName } from '@/components/ui';
import { SetupBackButton, SetupFlowShell } from '@/components/setup/SetupFlowShell';
import { getSetupAdvanceTarget, isLastSetupStep, setupAdvanceLabel } from '@/components/setup/setupFlowActions';
import { useConfirm } from '@/components/ConfirmDialog';
import { ChannelAvatar } from '@/components/UpdaterDisplay';
import { clientTypeLabel } from '@/components/clientTypeMeta';
import { getBootStatus, getSetupFlowStatus, saveBootStatus } from '@/lib/api';
import {
  CHANNEL_AGENTS_SETUP_STEP_ID,
  dispatchSetupStatusChanged,
  getDefaultBootContent,
  type BootStatusNode,
  type SetupFlowStatus,
} from '@/lib/bootSetup';
import { useT } from '@/lib/i18n';

interface NodeMessage {
  tone: 'success' | 'danger' | 'info';
  text: string;
}

const CHANNEL_AGENT_TEXTAREA_CLASS = '!h-[105px] !min-h-[105px] bg-bg-inset leading-relaxed';
const CHANNEL_AGENT_TEXTAREA_HEIGHT = 105;

function statusTone(state: BootStatusNode['state']): 'red' | 'orange' | 'green' {
  if (state === 'missing') return 'red';
  if (state === 'empty') return 'orange';
  return 'green';
}

function statusLabel(t: (key: string) => string, state: BootStatusNode['state']): string {
  if (state === 'missing') return t('Missing');
  if (state === 'empty') return t('Empty content');
  return t('Initialized');
}

function previousPath(setupStatus: SetupFlowStatus | null): string | null {
  if (!setupStatus) return null;
  const index = setupStatus.steps.findIndex((step) => step.id === CHANNEL_AGENTS_SETUP_STEP_ID);
  if (index <= 0) return null;
  return setupStatus.steps[index - 1]?.path || null;
}

function buildDrafts(nodes: BootStatusNode[]): Record<string, string> {
  return Object.fromEntries(
    nodes.map((node) => [node.uri, node.content || getDefaultBootContent(node.uri)]),
  );
}

export default function ChannelAgentsSetupStep(): React.JSX.Element {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { toast } = useConfirm();
  const dirtyRef = useRef(false);
  const [setupStatus, setSetupStatus] = useState<SetupFlowStatus | null>(null);
  const [nodes, setNodes] = useState<BootStatusNode[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyUris, setDirtyUris] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<NodeMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boot, nextSetupStatus] = await Promise.all([getBootStatus(), getSetupFlowStatus()]);
      const nextNodes = boot.nodes.filter((node) => node.scope === 'client');
      setNodes(nextNodes);
      setSetupStatus(nextSetupStatus);
      if (!dirtyRef.current) {
        setDrafts(buildDrafts(nextNodes));
        setDirtyUris(new Set());
      }
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const goAdvance = useCallback((nextSetupStatus: SetupFlowStatus | null) => {
    const target = getSetupAdvanceTarget(nextSetupStatus, CHANNEL_AGENTS_SETUP_STEP_ID);
    if (target !== pathname) router.replace(target);
  }, [pathname, router]);

  const saveNodes = useCallback(async (nextDrafts: Record<string, string>, successText: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await saveBootStatus({ nodes: nextDrafts });
      const failed = response.results.filter((result) => result.status === 'failed');
      if (failed.length > 0) {
        setMessage({ tone: 'danger', text: failed.map((result) => result.detail || result.uri).join('\n') });
        return;
      }
      setDrafts(nextDrafts);
      dirtyRef.current = false;
      setDirtyUris(new Set());
      setMessage({ tone: 'success', text: successText });
      dispatchSetupStatusChanged();
      toast(successText, 'success');
      const nextSetupStatus = await getSetupFlowStatus();
      setSetupStatus(nextSetupStatus);
      await load();
      goAdvance(nextSetupStatus);
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setSaving(false);
    }
  }, [goAdvance, load, t, toast]);

  const handleChange = useCallback((uri: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [uri]: value }));
    setDirtyUris((prev) => {
      const next = new Set(prev);
      next.add(uri);
      dirtyRef.current = true;
      return next;
    });
  }, []);

  const handleAdvance = useCallback(async () => {
    const emptyNodes = nodes.filter((node) => !String(drafts[node.uri] ?? '').trim());
    if (emptyNodes.length > 0) {
      setMessage({
        tone: 'danger',
        text: `${t('Fill every field on this page before continuing.')} ${emptyNodes.map((node) => t(node.setup_title)).join(', ')}`,
      });
      return;
    }
    await saveNodes(drafts, t('Changes saved'));
  }, [drafts, nodes, saveNodes, t]);

  const previous = useMemo(() => previousPath(setupStatus), [setupStatus]);
  const isLastStep = useMemo(() => isLastSetupStep(setupStatus, CHANNEL_AGENTS_SETUP_STEP_ID), [setupStatus]);
  const advanceLabel = setupAdvanceLabel(setupStatus, CHANNEL_AGENTS_SETUP_STEP_ID, t);

  return (
    <SetupFlowShell
      stepId={CHANNEL_AGENTS_SETUP_STEP_ID}
      setupStatus={setupStatus}
      title={t('Channel agent setup')}
      description={t('Review every supported channel in one page. Each channel keeps only its runtime-specific delta; shared rules stay in core://agent.')}
      right={
        <>
          {previous ? <SetupBackButton href={previous} /> : null}
          <Button variant="primary" onClick={() => void handleAdvance()} disabled={saving || loading || nodes.length === 0}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : isLastStep ? <Check size={14} /> : <ArrowRight size={14} />}
            {saving ? t('Saving…') : advanceLabel}
          </Button>
        </>
      }
    >
      {error && (
        <Notice tone="danger" title={t('Failed to load')}>
          {error}
        </Notice>
      )}

      {loading && <LoadingBlock />}

      {!loading && nodes.length === 0 && (
        <Notice tone="info" title={t('Not found')}>
          {t('No channel agent boot nodes found.')}
        </Notice>
      )}

      {!loading && nodes.length > 0 && (
        <div className={clsx('animate-in stagger-2 overflow-hidden', surfaceCardClassName)}>
          <div className="divide-y divide-separator-thin">
            {nodes.map((node) => {
              const value = drafts[node.uri] ?? getDefaultBootContent(node.uri);
              const dirty = dirtyUris.has(node.uri);
              const usingDefault = !node.content.trim();
              return (
                <section key={node.uri} className="px-4 py-4 md:px-6 md:py-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                        <ChannelAvatar clientType={node.client_type} size={40} elevated />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[16px] font-semibold tracking-tight text-txt-primary">{t(node.setup_title)}</h3>
                          <Badge tone={statusTone(node.state)}>{statusLabel(t, node.state)}</Badge>
                          {node.client_type && <Badge tone="default">{t(clientTypeLabel(node.client_type))}</Badge>}
                          {usingDefault && <Badge tone="soft">{t('Default')}</Badge>}
                          {dirty && <Badge tone="blue">{t('Unsaved')}</Badge>}
                        </div>
                        <div className="mt-1 text-[12px] font-mono text-txt-tertiary break-all">{node.uri}</div>
                        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-txt-secondary">{t(node.purpose)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl bg-fill-quaternary px-3 py-2 text-right text-[12px]">
                      <div className="text-txt-tertiary">{t('Content length')}</div>
                      <div className="mt-1 font-medium tabular-nums text-txt-primary">{value.trim().length}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor={`channel-content-${node.id}`} className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">{t('Content')}</label>
                    <AppTextArea
                      id={`channel-content-${node.id}`}
                      value={value}
                      onChange={(event) => handleChange(node.uri, event.target.value)}
                      placeholder={t('Write the final memory content here')}
                      className={CHANNEL_AGENT_TEXTAREA_CLASS}
                      style={{ height: CHANNEL_AGENT_TEXTAREA_HEIGHT, minHeight: CHANNEL_AGENT_TEXTAREA_HEIGHT }}
                      size="lg"
                    />
                  </div>
                </section>
              );
            })}
          </div>

          {message && (
            <div className="border-t border-separator-thin px-4 py-4 md:px-6">
              <Notice tone={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'info'}>
                {message.text}
              </Notice>
            </div>
          )}

        </div>
      )}
    </SetupFlowShell>
  );
}
