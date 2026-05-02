'use client';

import React, { useEffect, useState, useCallback, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import { PageCanvas, PageTitle, Button, Badge, Card, Empty, LoadingBlock, Notice, SelectionBox, StatCard, TextButton } from '../../components/ui';
import { useT } from '../../lib/i18n';
import { AxiosError } from 'axios';
import { useConfirm } from '../../components/ConfirmDialog';

interface MigrationTarget {
  id?: string | number;
  paths: string[];
  content?: string;
}

interface OrphanItem {
  id: string | number;
  category: 'deprecated' | 'orphaned';
  created_at?: string;
  content_snippet?: string;
  migration_target?: MigrationTarget;
}

export default function MaintenancePage(): React.JSX.Element {
  const { t } = useT();
  const { confirm: confirmDialog } = useConfirm();
  const router = useRouter();
  const [orphans, setOrphans] = useState<OrphanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => { loadOrphans(); }, []);

  const loadOrphans = async () => {
    setLoading(true); setError(null); setSelectedIds(new Set());
    try {
      const data = (await api.get('/maintenance/orphans')).data as OrphanItem[];
      setOrphans(data);
    }
    catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message);
    }
    finally { setLoading(false); }
  };

  const toggleSelect = useCallback((id: string | number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleBatchDelete = async () => {
    if (!selectedIds.size) return;
    const ok = await confirmDialog({ message: t('Delete {n} memories?').replace('{n}', String(selectedIds.size)), destructive: true, confirmLabel: t('Delete') });
    if (!ok) return;
    setBatchDeleting(true);
    const toDelete = [...selectedIds], failed: Array<string | number> = [];
    for (const id of toDelete) { try { await api.delete(`/maintenance/orphans/${id}`); } catch { failed.push(id); } }
    const fs = new Set(failed.map((id) => String(id)));
    setOrphans(prev => prev.filter(i => !toDelete.includes(i.id) || fs.has(String(i.id))));
    setSelectedIds(new Set(failed));
    setBatchDeleting(false);
  };

  const handleExpand = (id: string | number) => {
    router.push(`/maintenance/orphans/${id}`);
  };

  const deprecated = orphans.filter(o => o.category === 'deprecated');
  const orphaned = orphans.filter(o => o.category === 'orphaned');

  const renderEntry = (item: OrphanItem) => {
    const isChecked = selectedIds.has(item.id);
    const cat = item.category === 'deprecated' ? { tone: 'orange' as const, label: t('Deprecated') } : { tone: 'red' as const, label: t('Orphaned') };

    return (
      <Card key={item.id} padded={false} interactive selected={isChecked}>
        <div className="flex cursor-pointer items-start gap-4 p-5 group" onClick={() => handleExpand(item.id)}>
          <SelectionBox
            selected={isChecked}
            label={isChecked ? t('Deselect') : t('Select')}
            className="mt-0.5"
            onClick={(e) => toggleSelect(item.id, e)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge tone={cat.tone}>{cat.label}</Badge>
              <span className="text-[11px] font-mono text-txt-tertiary">#{String(item.id)}</span>
              {item.created_at && (
                <span className="text-[11px] text-txt-quaternary">{format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')}</span>
              )}
            </div>
            {item.migration_target && item.migration_target.paths.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-txt-tertiary">{t('migrated to')}</span>
                {item.migration_target.paths.map((p, i) => (
                  <code key={i} className="font-mono text-sys-blue">{p}</code>
                ))}
              </div>
            )}
            <p className="mt-2 line-clamp-3 text-[13.5px] leading-snug text-txt-secondary">
              {item.content_snippet}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start">
            <TextButton onClick={(event) => { event.stopPropagation(); handleExpand(item.id); }}>
              {t('View')} →
            </TextButton>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <PageCanvas maxWidth="4xl">
      <PageTitle
        eyebrow={t('Cleanup')}
        title={t('Orphans')}
        description={t('Memories that no longer connect to the active graph. Review and remove what is safe to drop.')}
        right={
          <>
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={handleBatchDelete} disabled={batchDeleting}>
                {batchDeleting ? t('Deleting…') : `${t('Delete')} ${selectedIds.size}`}
              </Button>
            )}
            <Button variant="ghost" onClick={loadOrphans} disabled={loading}>
              {loading ? t('Scanning…') : t('Rescan')}
            </Button>
          </>
        }
      />

      <div className="animate-in stagger-1 mb-5 grid grid-cols-2 gap-3">
        <StatCard compact label={t('Deprecated')} value={deprecated.length} tone="orange" />
        <StatCard compact label={t('Orphaned')} value={orphaned.length} tone="red" />
      </div>

      {error && (
        <Notice tone="danger" className="animate-scale mb-4">
          {error}
        </Notice>
      )}

      {loading && !orphans.length && <LoadingBlock />}

      {!loading && !error && !orphans.length && (
        <Empty text={t('All clear. No orphans to review.')} />
      )}

      {!error && orphans.length > 0 && (
        <div className="animate-in stagger-2 space-y-8">
          {deprecated.length > 0 && (
            <div>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">
                {t('Deprecated')} · {deprecated.length}
              </h2>
              <div className="space-y-2.5">{deprecated.map(renderEntry)}</div>
            </div>
          )}
          {orphaned.length > 0 && (
            <div>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">
                {t('Orphaned')} · {orphaned.length}
              </h2>
              <div className="space-y-2.5">{orphaned.map(renderEntry)}</div>
            </div>
          )}
        </div>
      )}
    </PageCanvas>
  );
}
