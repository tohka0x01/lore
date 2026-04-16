'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { Bot, RefreshCw, Save, Sparkles, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Button, Card, Notice } from '@/components/ui';
import { SetupBackButton, SetupFlowShell } from '@/components/setup/SetupFlowShell';
import { useConfirm } from '@/components/ConfirmDialog';
import { generateBootStatusDrafts, getBootStatus, getSetupFlowStatus, saveBootStatus } from '@/lib/api';
import { dispatchSetupStatusChanged, type BootNodeRole, type BootStatusNode, type SetupFlowStatus } from '@/lib/bootSetup';
import { useT } from '@/lib/i18n';

interface BootSetupStepProps {
  role: BootNodeRole;
}

interface NodeMessage {
  tone: 'success' | 'danger' | 'info';
  text: string;
}

const ROLE_META: Record<BootNodeRole, { stepId: 'boot-agent' | 'boot-soul' | 'boot-user'; title: string; description: string }> = {
  agent: {
    stepId: 'boot-agent',
    title: 'Agent boot memory',
    description: 'Write the fixed workflow-constraints node that Lore always loads at startup.',
  },
  soul: {
    stepId: 'boot-soul',
    title: 'Soul boot memory',
    description: 'Write the fixed persona baseline that Lore carries into every session.',
  },
  user: {
    stepId: 'boot-user',
    title: 'User boot memory',
    description: 'Write the stable user profile Lore should remember across future sessions.',
  },
};

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

export default function BootSetupStep({ role }: BootSetupStepProps): React.JSX.Element {
  const meta = ROLE_META[role];
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { toast } = useConfirm();
  const [setupStatus, setSetupStatus] = useState<SetupFlowStatus | null>(null);
  const [node, setNode] = useState<BootStatusNode | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [nodeContext, setNodeContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
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
      const nextNode = boot.nodes.find((entry) => entry.role === role) || null;
      setNode(nextNode);
      if (nextNode && !dirtyRef.current) {
        setDraft(nextNode.content || '');
      }
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const goNext = useCallback((nextSetupStatus: SetupFlowStatus | null) => {
    const target = nextSetupStatus?.next_step || '/memory';
    if (target !== pathname) router.replace(target);
  }, [pathname, router]);

  const handleGenerate = useCallback(async () => {
    if (!node) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await generateBootStatusDrafts({
        uris: [node.uri],
        node_context: nodeContext.trim() ? { [node.uri]: nodeContext.trim() } : undefined,
      });
      const result = response.results[0];
      if (result?.status === 'generated' && result.content) {
        setDraft(result.content);
        setDirty(true);
        setMessage({ tone: 'success', text: t('Draft generated') });
      } else {
        setMessage({ tone: 'danger', text: result?.detail || t('Failed to load') });
      }
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
    } finally {
      setGenerating(false);
    }
  }, [node, nodeContext, t]);

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

  const Icon = roleIcon(role);
  const previous = useMemo(() => previousPath(setupStatus, meta.stepId), [meta.stepId, setupStatus]);

  const topNotice = useMemo(() => {
    if (!setupStatus) return null;
    if (!setupStatus.boot.draft_generation_available) {
      return (
        <Notice tone="warning" title={t('Draft generation unavailable')}>
          <div className="space-y-2">
            <p>{t('You can still complete setup manually, or open Settings first and configure the default View LLM.')}</p>
            {setupStatus.boot.draft_generation_reason && <p>{setupStatus.boot.draft_generation_reason}</p>}
          </div>
        </Notice>
      );
    }
    return null;
  }, [setupStatus, t]);

  return (
    <SetupFlowShell
      stepId={meta.stepId}
      setupStatus={setupStatus}
      title={t(meta.title)}
      description={t(meta.description)}
      topNotice={topNotice}
      footer={previous ? <SetupBackButton href={previous} /> : <div />}
    >
      {error && (
        <Notice tone="danger" title={t('Failed to load')}>
          {error}
        </Notice>
      )}

      {loading && (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-fill-tertiary border-t-sys-blue" />
        </div>
      )}

      {!loading && node && (
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fill-primary text-sys-blue">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[18px] font-semibold tracking-tight text-txt-primary">{t(node.role_label)}</h2>
                  <Badge tone={statusTone(node.state)}>{statusLabel(t, node.state)}</Badge>
                  {dirty && <Badge tone="blue">{t('Unsaved')}</Badge>}
                </div>
                <div className="mt-1 text-[12px] font-mono text-txt-tertiary break-all">{node.uri}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-txt-secondary">{t(node.purpose)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px] min-w-[220px]">
              <div className="rounded-xl bg-fill-quaternary px-3 py-2">
                <div className="text-txt-tertiary">{t('Status')}</div>
                <div className="mt-1 font-medium text-txt-primary">{statusLabel(t, node.state)}</div>
              </div>
              <div className="rounded-xl bg-fill-quaternary px-3 py-2">
                <div className="text-txt-tertiary">{t('Content length')}</div>
                <div className="mt-1 font-medium text-txt-primary">{draft.trim().length}</div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">{t('Draft prompt')}</label>
            <input
              type="text"
              value={nodeContext}
              onChange={(event) => setNodeContext(event.target.value)}
              placeholder={t('Optional extra guidance for this node')}
              className="w-full rounded-lg border border-separator bg-bg-raised px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-quaternary focus:border-sys-blue focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">{t('Content')}</label>
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setDirty(true);
              }}
              placeholder={t('Write the final memory content here')}
              className="min-h-[320px] w-full rounded-lg border border-separator bg-bg-raised px-3 py-3 text-[14px] leading-relaxed text-txt-primary placeholder:text-txt-quaternary focus:border-sys-blue focus:outline-none"
            />
          </div>

          {message && (
            <Notice tone={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'info'}>
              {message.text}
            </Notice>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="secondary" onClick={() => void handleGenerate()} disabled={!setupStatus?.boot.draft_generation_available || generating || saving}>
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? t('Generating…') : t('Generate draft')}
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t('Saving…') : t('Save')}
            </Button>
          </div>
        </Card>
      )}
    </SetupFlowShell>
  );
}
