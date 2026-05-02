import React, { useState, ChangeEvent } from 'react';
import { ActionPanel, AppInput, Button } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { AxiosError } from 'axios';

interface MoveDialogProps {
  domain: string;
  path: string;
  onMoved: (newDomain: string, newPath: string) => void;
  onCancel: () => void;
}

export default function MoveDialog({ domain, path, onMoved, onCancel }: MoveDialogProps): React.JSX.Element {
  const { t } = useT();
  const currentUri = `${domain}://${path}`;
  const [newUri, setNewUri] = useState(currentUri);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = newUri.trim();
    if (!trimmed || trimmed === currentUri) { onCancel(); return; }
    setSaving(true); setError(null);
    try {
      await api.post('/browse/move', { old_uri: currentUri, new_uri: trimmed });
      const match = trimmed.match(/^([^:]+):\/\/(.*)$/);
      if (match) {
        onMoved(match[1], match[2]);
      } else {
        onMoved(domain, trimmed);
      }
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      setError(axiosErr.response?.data?.detail || axiosErr.message || t('Move failed'));
    } finally { setSaving(false); }
  };

  return (
    <ActionPanel tone="orange" className="mb-8" title={t('Move / Rename')} right={
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || !newUri.trim()}>
          {saving ? t('Moving…') : t('Move')}
        </Button>
      </div>
    }>
      {error && <p className="text-[13px] text-sys-red">{error}</p>}
      <label className="block">
        <span className="block mb-1 text-[11px] font-medium text-txt-tertiary">{t('New URI')}</span>
        <AppInput
          type="text" value={newUri}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUri(e.target.value)}
          placeholder="domain://path/to/node"
          size="lg"
          mono
          autoFocus
        />
      </label>
      <p className="text-[11px] text-txt-quaternary">{t('Child nodes will follow automatically.')}</p>
    </ActionPanel>
  );
}
