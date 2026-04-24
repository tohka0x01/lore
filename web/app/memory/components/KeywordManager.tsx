'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from 'react';
import type { InputRef } from 'antd';
import { X } from 'lucide-react';
import { AppInput, Badge } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { useConfirm } from '../../../components/ConfirmDialog';
import { AxiosError } from 'axios';

interface KeywordManagerProps {
  keywords: string[];
  nodeUuid: string;
  onUpdate: () => void;
}

const KeywordManager = ({ keywords, nodeUuid, onUpdate }: KeywordManagerProps): React.JSX.Element => {
  const { t } = useT();
  const { toast } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const inputRef = useRef<InputRef>(null);

  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

  const handleAdd = async () => {
    const kw = newKeyword.trim();
    if (!kw || !nodeUuid) return;
    try {
      await api.post('/browse/glossary', { keyword: kw, node_uuid: nodeUuid });
      setNewKeyword(''); setAdding(false); onUpdate();
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      toast(axiosErr.response?.data?.detail || axiosErr.message || t('Failed'));
    }
  };

  const handleRemove = async (kw: string) => {
    if (!nodeUuid) return;
    try {
      await api.delete('/browse/glossary', { data: { keyword: kw, node_uuid: nodeUuid } });
      onUpdate();
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      toast(axiosErr.response?.data?.detail || axiosErr.message || t('Failed'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setAdding(false); setNewKeyword(''); }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-txt-tertiary">{t('Glossary')}</span>
      {keywords.map((kw) => (
        <Badge key={kw} tone="yellow" className="glossary-tag">
          {kw}
          <button onClick={() => handleRemove(kw)} className="ml-0.5 opacity-60 hover:opacity-100" aria-label={t('Remove')}>
            <X size={10} />
          </button>
        </Badge>
      ))}
      {adding ? (
        <AppInput
          ref={inputRef} type="text" value={newKeyword}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!newKeyword.trim()) setAdding(false); }}
          placeholder={t('keyword')}
          className="w-28 font-mono text-[11px]"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-md border border-dashed border-separator px-2 py-0.5 text-[11px] text-txt-tertiary hover:border-sys-blue/50 hover:text-sys-blue transition-colors"
        >
          + {t('Add')}
        </button>
      )}
    </div>
  );
};

export default KeywordManager;
