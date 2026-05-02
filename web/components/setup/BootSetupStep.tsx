'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AxiosError } from 'axios';
import { Bot, RefreshCw, Save, Sparkles, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { AppTextArea, Badge, Button, LoadingBlock, Notice, surfaceCardClassName } from '@/components/ui';
import { SetupBackButton, SetupFlowShell } from '@/components/setup/SetupFlowShell';
import { useConfirm } from '@/components/ConfirmDialog';
import { getBootStatus, getSetupFlowStatus, saveBootStatus } from '@/lib/api';
import {
  dispatchSetupStatusChanged,
  getDefaultBootContent,
  makeBootSetupStepId,
  type BootNodeRole,
  type BootStatusNode,
  type SetupFlowStatus,
} from '@/lib/bootSetup';
import { useT } from '@/lib/i18n';

interface BootSetupStepProps {
  setupSlug: string;
}

interface NodeMessage {
  tone: 'success' | 'danger' | 'info';
  text: string;
}

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

function roleIcon(role: BootNodeRole) {
  if (role === 'agent') return Bot;
  if (role === 'soul') return Sparkles;
  return User;
}

function previousPath(setupStatus: SetupFlowStatus | null, stepId: string): string | null {
  if (!setupStatus) return null;
  const index = setupStatus.steps.findIndex((step) => step.id === stepId);
  if (index <= 0) return null;
  return setupStatus.steps[index - 1]?.path || null;
}

export default function BootSetupStep({ setupSlug }: BootSetupStepProps): React.JSX.Element {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { toast } = useConfirm();
  const stepId = useMemo(() => makeBootSetupStepId(setupSlug), [setupSlug]);
  const [setupStatus, setSetupStatus] = useState<SetupFlowStatus | null>(null);
  const [node, setNode] = useState<BootStatusNode | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<NodeMessage | null>(null);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boot, nextSetupStatus] = await Promise.all([getBootStatus(), getSetupFlowStatus()]);
      setSetupStatus(nextSetupStatus);
      const nextNode = boot.nodes.find((entry) => entry.setup_slug === setupSlug) || null;
      setNode(nextNode);
      if (nextNode && !dirtyRef.current) {
        setDraft(nextNode.content || getDefaultBootContent(nextNode.uri));
      }
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [setupSlug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const goNext = useCallback((nextSetupStatus: SetupFlowStatus | null) => {
    const target = nextSetupStatus?.next_step || '/memory';
    if (target !== pathname) router.replace(target);
  }, [pathname, router]);

  const handleSave = useCallback(async () => {
    if (!node) return;
    setSaving(true);
    setError(null);
    try {
      const response = await saveBootStatus({ nodes: { [node.uri]: draft } });
      const result = response.results[0];
      if (!result || result.status === 'failed') {
        setMessage({ tone: 'danger', text: result?.detail || t('Failed to load') });
        return;
      }
      const notice = result.status === 'created'
        ? t('Created')
        : result.status === 'updated'
          ? t('Updated')
          : t('Unchanged');
      setMessage({ tone: result.status === 'unchanged' ? 'info' : 'success', text: notice });
      setDirty(false);
      dirtyRef.current = false;
      dispatchSetupStatusChanged();
      toast(notice, 'success');
      const nextSetupStatus = await getSetupFlowStatus();
      setSetupStatus(nextSetupStatus);
      await load();
      goNext(nextSetupStatus);
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setSaving(false);
    }
  }, [draft, goNext, load, node, t, toast]);

  const handleSkip = useCallback(async () => {
    if (!node) return;
    const defaultContent = getDefaultBootContent(node.uri);
    const content = node.state === 'initialized' && node.content.trim() ? node.content : defaultContent;
    setSaving(true);
    setError(null);
    try {
      const response = await saveBootStatus({ nodes: { [node.uri]: content } });
      const result = response.results[0];
      if (!result || result.status === 'failed') {
        setMessage({ tone: 'danger', text: result?.detail || t('Failed to load') });
        return;
      }
      setDraft(content);
      setDirty(false);
      dirtyRef.current = false;
      dispatchSetupStatusChanged();
      toast(t('Default saved'), 'success');
      const nextSetupStatus = await getSetupFlowStatus();
      setSetupStatus(nextSetupStatus);
      await load();
      goNext(nextSetupStatus);
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setSaving(false);
    }
  }, [goNext, load, node, t, toast]);

  const Icon = roleIcon(node?.role || 'agent');
  const currentStep = useMemo(
    () => setupStatus?.steps.find((step) => step.id === stepId) || null,
    [setupStatus, stepId],
  );
  const previous = useMemo(() => previousPath(setupStatus, stepId), [setupStatus, stepId]);
  const pageTitle = currentStep?.label || node?.setup_title || 'Boot memory';
  const pageDescription = currentStep?.description || node?.setup_description || 'Write the fixed boot node for this setup step.';

  return (
    <SetupFlowShell
      stepId={stepId}
      setupStatus={setupStatus}
      title={t(pageTitle)}
      description={t(pageDescription)}
      right={
        <>
          {previous ? <SetupBackButton href={previous} /> : null}
          <Button variant="secondary" onClick={() => void handleSkip()} disabled={saving || loading || !node}>
            {saving ? t('Saving…') : t('Skip')}
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

      {!loading && !node && (
        <Notice tone="danger" title={t('Not found')}>
          {t('Failed to load')}
        </Notice>
      )}

      {!loading && node && (
        <div className={clsx('animate-in stagger-2 overflow-hidden', surfaceCardClassName)}>
          <div className="flex items-start justify-between gap-4 border-b border-separator-thin px-4 py-4 md:px-6 md:py-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sys-blue/20 bg-sys-blue/10 text-sys-blue">
                <Icon size={19} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[17px] font-semibold tracking-tight text-txt-primary">{t(node.role_label)}</h2>
                  <Badge tone={statusTone(node.state)}>{statusLabel(t, node.state)}</Badge>
                  {node.scope === 'client' && node.client_type && <Badge tone="default">{node.client_type}</Badge>}
                  {!node.content.trim() && <Badge tone="soft">{t('Default')}</Badge>}
                  {dirty && <Badge tone="blue">{t('Unsaved')}</Badge>}
                </div>
                <div className="mt-1 text-[12px] font-mono text-txt-tertiary break-all">{node.uri}</div>
                <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-txt-secondary">{t(node.purpose)}</p>
              </div>
            </div>
            <div className="shrink-0 rounded-xl bg-fill-quaternary px-3 py-2 text-right text-[12px]">
              <div className="text-txt-tertiary">{t('Content length')}</div>
              <div className="mt-1 font-medium tabular-nums text-txt-primary">{draft.trim().length}</div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 md:px-6 md:py-5">
            <div>
              <label htmlFor={`boot-content-${node.id}`} className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">{t('Content')}</label>
              <AppTextArea
                id={`boot-content-${node.id}`}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setDirty(true);
                }}
                placeholder={t('Write the final memory content here')}
                className="bg-bg-inset leading-relaxed"
                size="lg"
                style={{ height: 460, minHeight: 460 }}
              />
            </div>

            {message && (
              <Notice tone={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'info'}>
                {message.text}
              </Notice>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-separator-thin px-4 py-3.5 md:px-6">
            <Button variant="secondary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t('Saving…') : t('Save')}
            </Button>
          </div>
        </div>
      )}
    </SetupFlowShell>
  );
}
