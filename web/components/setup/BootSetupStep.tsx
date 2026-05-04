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
import { getBootStatus, getSetupFlowStatus, saveBootStatus } from '@/lib/api';
import {
  dispatchSetupStatusChanged,
  getDefaultBootContent,
  makeBootSetupStepId,
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

const BOOT_CONTENT_TEXTAREA_HEIGHT = 140;

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

  const goAdvance = useCallback((nextSetupStatus: SetupFlowStatus | null) => {
    const target = getSetupAdvanceTarget(nextSetupStatus, stepId);
    if (target !== pathname) router.replace(target);
  }, [pathname, router, stepId]);

  const handleSave = useCallback(async () => {
    if (!node) return;
    if (!draft.trim()) {
      setMessage({ tone: 'danger', text: t('Fill every field on this page before continuing.') });
      return;
    }
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
      goAdvance(nextSetupStatus);
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setSaving(false);
    }
  }, [draft, goAdvance, load, node, t, toast]);

  const currentStep = useMemo(
    () => setupStatus?.steps.find((step) => step.id === stepId) || null,
    [setupStatus, stepId],
  );
  const previous = useMemo(() => previousPath(setupStatus, stepId), [setupStatus, stepId]);
  const isLastStep = useMemo(() => isLastSetupStep(setupStatus, stepId), [setupStatus, stepId]);
  const advanceLabel = setupAdvanceLabel(setupStatus, stepId, t);
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
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || loading || !node}>
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

      {!loading && !node && (
        <Notice tone="danger" title={t('Not found')}>
          {t('Failed to load')}
        </Notice>
      )}

      {!loading && node && (
        <div className={clsx('animate-in stagger-2 overflow-hidden', surfaceCardClassName)}>
          <div className="flex items-center justify-between gap-4 border-b border-separator-thin px-4 py-3 md:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone={statusTone(node.state)}>{statusLabel(t, node.state)}</Badge>
              {node.scope === 'client' && node.client_type && <Badge tone="default">{node.client_type}</Badge>}
              {!node.content.trim() && <Badge tone="soft">{t('Default')}</Badge>}
              {dirty && <Badge tone="blue">{t('Unsaved')}</Badge>}
              <code className="min-w-0 break-all font-mono text-[12px] text-txt-tertiary">{node.uri}</code>
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
                className="!h-[140px] !min-h-[140px] bg-bg-inset leading-relaxed"
                size="lg"
                style={{ height: BOOT_CONTENT_TEXTAREA_HEIGHT, minHeight: BOOT_CONTENT_TEXTAREA_HEIGHT }}
              />
            </div>

            {message && (
              <Notice tone={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'info'}>
                {message.text}
              </Notice>
            )}
          </div>

        </div>
      )}
    </SetupFlowShell>
  );
}
