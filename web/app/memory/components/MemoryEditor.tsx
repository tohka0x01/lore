import React, { ChangeEvent } from 'react';
import { ActionPanel, AppInput, AppTextArea, Button } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

interface MemoryEditorProps {
  editContent: string;
  setEditContent: (value: string) => void;
  editDisclosure: string;
  setEditDisclosure: (value: string) => void;
  editPriority: number;
  setEditPriority: (value: number) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export default function MemoryEditor({
  editContent, setEditContent,
  editDisclosure, setEditDisclosure,
  editPriority, setEditPriority,
  saving, onSave, onCancel,
}: MemoryEditorProps): React.JSX.Element {
  const { t } = useT();
  return (
    <ActionPanel tone="blue" className="mb-8" title={t('Editing')} right={
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? t('Saving…') : t('Save')}
        </Button>
      </div>
    }>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-start">
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-txt-tertiary">{t('Priority')}</span>
          <AppInput
            type="number" min="0" value={editPriority}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditPriority(parseInt(e.target.value, 10) || 0)}
            className="w-24 tabular-nums"
            size="lg"
            mono
          />
        </label>
        <label className="block">
          <span className="block mb-1 text-[11px] font-medium text-txt-tertiary">{t('Disclosure')}</span>
          <AppInput
            type="text" value={editDisclosure}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditDisclosure(e.target.value)}
            placeholder={t('When should this memory be recalled?')}
            className="text-[14px]"
          />
        </label>
      </div>
      <AppTextArea
        value={editContent}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
        className="h-80 leading-relaxed"
        size="lg"
        spellCheck={false}
      />
    </ActionPanel>
  );
}
