'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Notice } from '@/components/ui';
import {
  buildSettingsSaveLabel,
  findSettingsSection,
  SettingsSectionEditor,
  type SettingsData,
} from '@/components/settings/SettingsSectionEditor';
import { SetupBackButton, SetupFlowShell } from '@/components/setup/SetupFlowShell';
import { useConfirm } from '@/components/ConfirmDialog';
import { api, getSetupFlowStatus } from '@/lib/api';
import { dispatchSetupStatusChanged, type SetupFlowStatus } from '@/lib/bootSetup';
import { useT } from '@/lib/i18n';

const EMBEDDING_REBUILD_KEYS = new Set([
  'embedding.base_url',
  'embedding.api_key',
  'embedding.model',
]);

interface SettingsSetupStepProps {
  sectionId: 'embedding' | 'view_llm';
}

function getStepMeta(sectionId: SettingsSetupStepProps['sectionId']) {
  if (sectionId === 'embedding') {
    return {
      stepId: 'embedding' as const,
      title: 'Embedding setup',
      description: 'Configure the vector endpoint Lore uses for embeddings before continuing.',
    };
  }
  return {
    stepId: 'llm' as const,
    title: 'View LLM setup',
    description: 'Configure the model Lore uses for draft generation, view refinement, and dream workflows.',
  };
}

function getPreviousStepPath(setupStatus: SetupFlowStatus | null, stepId: 'embedding' | 'llm'): string | null {
  if (!setupStatus) return null;
  const index = setupStatus.steps.findIndex((step) => step.id === stepId);
  if (index <= 0) return null;
  return setupStatus.steps[index - 1]?.path || null;
}

export default function SettingsSetupStep({ sectionId }: SettingsSetupStepProps): React.JSX.Element {
  const meta = getStepMeta(sectionId);
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { confirm: confirmDialog, toast } = useConfirm();
  const [data, setData] = useState<SettingsData | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupFlowStatus | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, nextSetupStatus] = await Promise.all([
        api.get('/settings'),
        getSetupFlowStatus(),
      ]);
      setData(settingsResponse.data as SettingsData);
      setSetupStatus(nextSetupStatus);
      setDraft({});
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

  const section = useMemo(() => findSettingsSection(data, sectionId), [data, sectionId]);
  const dirtyKeys = useMemo(
    () => section?.items.filter((item) => item.key in draft).map((item) => item.key) || [],
    [draft, section],
  );
  const embeddingChanged = useMemo(
    () => sectionId === 'embedding' && dirtyKeys.some((key) => EMBEDDING_REBUILD_KEYS.has(key)),
    [dirtyKeys, sectionId],
  );
  const previousPath = useMemo(() => getPreviousStepPath(setupStatus, meta.stepId), [meta.stepId, setupStatus]);

  const handleChange = useCallback((key: string, newValue: unknown) => {
    setDraft((prev) => {
      if (!data) return prev;
      const current = data.values[key];
      if (newValue === current || (newValue === '' && current === '')) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: newValue };
    });
  }, [data]);

  const refreshSetupOnly = useCallback(async (): Promise<SetupFlowStatus | null> => {
    try {
      const next = await getSetupFlowStatus();
      setSetupStatus(next);
      return next;
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Failed to load'));
      return null;
    }
  }, [t]);

  const handleReset = useCallback(async (key: string) => {
    setSaving(true);
    setError(null);
    try {
      const { data: next } = await api.post('/settings/reset', { keys: [key] });
      setData(next as SettingsData);
      setDraft((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
      await refreshSetupOnly();
      dispatchSetupStatusChanged();
      toast(`Reset ${key}`, 'success');
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  }, [refreshSetupOnly, toast]);

  const handleRebuild = useCallback(async (showToast = true) => {
    setRebuilding(true);
    setError(null);
    try {
      const response = await api.post('/browse/recall/rebuild');
      const payload = response.data as Record<string, unknown>;
      if (showToast) {
        toast(`${t('Rebuild completed')} (views: ${payload.updated_count ?? 0}, glossary: ${payload.glossary_embedding_updated_count ?? 0})`, 'success');
      }
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || 'Rebuild failed');
    } finally {
      setRebuilding(false);
    }
  }, [t, toast]);

  const handleSave = useCallback(async () => {
    if (!dirtyKeys.length) return;
    if (embeddingChanged) {
      const ok = await confirmDialog({
        message: t('Changing the embedding model will invalidate all existing embeddings and trigger a full rebuild. Continue?'),
        confirmLabel: t('Continue'),
      });
      if (!ok) return;
    }

    setSaving(true);
    setError(null);
    try {
      const patch = Object.fromEntries(dirtyKeys.map((key) => [key, draft[key]]));
      const { data: nextSettings } = await api.put('/settings', { patch });
      setData(nextSettings as SettingsData);
      setDraft({});
      if (embeddingChanged) {
        await handleRebuild(false);
      }
      const nextSetupStatus = await refreshSetupOnly();
      dispatchSetupStatusChanged();
      toast(`Saved ${dirtyKeys.length} change${dirtyKeys.length === 1 ? '' : 's'}`, 'success');
      const target = nextSetupStatus?.next_step || '/memory';
      if (target !== pathname) router.replace(target);
    } catch (e) {
      const axiosErr = e as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [confirmDialog, dirtyKeys, draft, embeddingChanged, handleRebuild, pathname, refreshSetupOnly, router, t, toast]);

  const topNotice = useMemo(() => {
    if (!setupStatus) return null;
    if (sectionId === 'view_llm' && setupStatus.llm.configured && !setupStatus.llm.runtime_ready) {
      return (
        <Notice tone="warning" title={t('Runtime not ready')}>
          <div className="space-y-2">
            <p>{t('View LLM settings are incomplete. Draft generation and dream workflows stay disabled until base URL, API key, and model are all configured in Settings.')}</p>
            {setupStatus.boot.draft_generation_reason && <p>{setupStatus.boot.draft_generation_reason}</p>}
          </div>
        </Notice>
      );
    }
    return null;
  }, [sectionId, setupStatus, t]);

  const footer = previousPath ? <SetupBackButton href={previousPath} /> : <div />;

  return (
    <SetupFlowShell
      stepId={meta.stepId}
      setupStatus={setupStatus}
      title={t(meta.title)}
      description={t(meta.description)}
      topNotice={topNotice}
      footer={footer}
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

      {!loading && !section && (
        <Notice tone="danger" title={t('Not found')}>
          {sectionId}
        </Notice>
      )}

      {!loading && section && data && (
        <Card className="overflow-hidden p-0">
          <SettingsSectionEditor
            section={section}
            data={data}
            draft={draft}
            saving={saving || rebuilding}
            onChange={handleChange}
            onReset={handleReset}
            right={
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {dirtyKeys.length > 0 && (
                  <Button variant="ghost" onClick={() => setDraft({})} disabled={saving || rebuilding}>
                    {t('Discard')}
                  </Button>
                )}
                <Button variant="primary" onClick={() => void handleSave()} disabled={saving || rebuilding || dirtyKeys.length === 0}>
                  {saving || rebuilding ? t('Saving…') : buildSettingsSaveLabel(dirtyKeys.length, t)}
                </Button>
              </div>
            }
          />
        </Card>
      )}
    </SetupFlowShell>
  );
}
