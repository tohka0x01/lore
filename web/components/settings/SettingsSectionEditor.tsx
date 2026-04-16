'use client';

import React, { ChangeEvent } from 'react';
import clsx from 'clsx';
import { Badge, Button, inputClass } from '@/components/ui';
import { useT } from '@/lib/i18n';

export type SettingSource = 'db' | 'env' | 'default';

export interface FieldSchema {
  key: string;
  label: string;
  type: 'number' | 'integer' | 'string' | 'enum' | 'boolean';
  description?: string;
  env?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  option_labels?: Record<string, string>;
  section: string;
}

export interface SectionSchema {
  id: string;
  label: string;
  description?: string;
}

export interface SettingsData {
  schema: FieldSchema[];
  sections: SectionSchema[];
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  sources: Record<string, SettingSource>;
}

export interface SectionGroup extends SectionSchema {
  items: FieldSchema[];
}

interface SourceDotProps {
  source: SettingSource;
}

function SourceDot({ source }: SourceDotProps): React.JSX.Element {
  const { t } = useT();
  const map: Record<SettingSource, { tone: string; label: string }> = {
    db: { tone: 'bg-sys-blue', label: t('Modified') },
    env: { tone: 'bg-sys-green', label: t('From env') },
    default: { tone: 'bg-fill-primary', label: t('Default') },
  };
  const { tone, label } = map[source] || map.default;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-txt-tertiary">
      <span className={clsx('h-1.5 w-1.5 rounded-full', tone)} />
      {label}
    </span>
  );
}

interface NumberInputProps {
  value: unknown;
  onChange: (v: number | '') => void;
  schema: FieldSchema;
  disabled: boolean;
}

function NumberInput({ value, onChange, schema, disabled }: NumberInputProps): React.JSX.Element {
  const step = schema.step ?? (schema.type === 'integer' ? 1 : 0.01);
  return (
    <input
      type="number"
      step={step}
      min={schema.min}
      max={schema.max}
      value={value == null ? '' : String(value)}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className="w-32 rounded-lg border border-separator-thin bg-bg-raised px-3 py-1.5 text-right text-[13px] font-mono tabular-nums text-txt-primary focus:border-sys-blue/60 focus:bg-bg-surface focus:outline-none disabled:opacity-40"
    />
  );
}

interface StringInputProps {
  value: unknown;
  onChange: (v: string) => void;
  disabled: boolean;
}

function StringInput({ value, onChange, disabled }: StringInputProps): React.JSX.Element {
  return (
    <input
      type="text"
      value={value == null ? '' : String(value)}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className={`${inputClass} py-1.5`}
    />
  );
}

interface EnumInputProps {
  value: unknown;
  onChange: (v: string) => void;
  schema: FieldSchema;
  disabled: boolean;
}

function EnumInput({ value, onChange, schema, disabled }: EnumInputProps): React.JSX.Element {
  const labels = schema.option_labels || {};
  return (
    <select
      value={value == null ? '' : String(value)}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      className="rounded-lg border border-separator-thin bg-bg-raised px-3 py-1.5 text-[13px] font-mono text-txt-primary cursor-pointer focus:border-sys-blue/60 focus:bg-bg-surface focus:outline-none disabled:opacity-40 max-w-full"
    >
      {(schema.options || []).map((opt) => (
        <option key={opt} value={opt}>{labels[opt] ? `${opt} — ${labels[opt]}` : opt}</option>
      ))}
    </select>
  );
}

interface BooleanInputProps {
  value: unknown;
  onChange: (v: boolean) => void;
  disabled: boolean;
}

function BooleanInput({ value, onChange, disabled }: BooleanInputProps): React.JSX.Element {
  const checked = Boolean(value);
  return (
    <label className="inline-flex items-center gap-3 text-[13px] text-txt-primary">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40',
          checked
            ? 'border-sys-blue/30 bg-sys-blue/80'
            : 'border-separator-thin bg-fill-primary',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span>{checked ? 'true' : 'false'}</span>
    </label>
  );
}

interface FieldRowProps {
  schema: FieldSchema;
  value: unknown;
  source: SettingSource;
  dirty: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
  saving: boolean;
}

export function FieldRow({ schema, value, source, dirty, onChange, onReset, saving }: FieldRowProps): React.JSX.Element {
  const { t } = useT();
  const isString = schema.type === 'string';
  const renderInput = () => {
    if (schema.type === 'number' || schema.type === 'integer') return <NumberInput value={value} onChange={onChange as (v: number | '') => void} schema={schema} disabled={saving} />;
    if (schema.type === 'enum') return <EnumInput value={value} onChange={onChange as (v: string) => void} schema={schema} disabled={saving} />;
    if (schema.type === 'boolean') return <BooleanInput value={value} onChange={onChange as (v: boolean) => void} disabled={saving} />;
    return <StringInput value={value} onChange={onChange as (v: string) => void} disabled={saving} />;
  };

  return (
    <div
      className={clsx(
        'grid gap-3 md:gap-4 border-b border-separator-hairline px-4 md:px-6 py-4 last:border-b-0 transition-colors',
        isString ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[1fr_auto] sm:items-center',
        dirty && 'bg-sys-blue/[0.04]',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[14px] font-medium text-txt-primary">{schema.label}</span>
          <SourceDot source={source} />
          {dirty && <Badge tone="blue">{t('Unsaved')}</Badge>}
          {source !== 'default' && !dirty && (
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="text-[11px] text-sys-blue hover:opacity-80 disabled:opacity-30"
            >
              {t('Reset')}
            </button>
          )}
        </div>
        {schema.description && (
          <p className="mt-0.5 text-[12.5px] text-txt-secondary leading-relaxed">{schema.description}</p>
        )}
        <p className="mt-1 text-[11px] text-txt-quaternary font-mono">
          {schema.key}
          {schema.env && <> · env: {schema.env}</>}
          {(schema.min !== undefined || schema.max !== undefined) && <> · range [{schema.min ?? '∞'}, {schema.max ?? '∞'}]</>}
        </p>
      </div>
      <div className={isString ? '' : 'shrink-0'}>
        {renderInput()}
      </div>
    </div>
  );
}

interface SettingsSectionEditorProps {
  section: SectionGroup;
  data: SettingsData;
  draft: Record<string, unknown>;
  saving: boolean;
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
  right?: React.ReactNode;
}

export function SettingsSectionEditor({
  section,
  data,
  draft,
  saving,
  onChange,
  onReset,
  right,
}: SettingsSectionEditorProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 pt-4 md:pt-5 pb-3 md:pb-4 border-b border-separator-thin">
        <div className="min-w-0">
          <h2 className="text-[17px] md:text-[19px] font-semibold tracking-tight text-txt-primary">{section.label}</h2>
          {section.description && <p className="mt-0.5 text-[12px] md:text-[13px] text-txt-secondary">{section.description}</p>}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
      {section.items.map((schema) => {
        const effectiveValue = schema.key in draft ? draft[schema.key] : data.values[schema.key];
        return (
          <FieldRow
            key={schema.key}
            schema={schema}
            value={effectiveValue}
            source={data.sources[schema.key]}
            dirty={schema.key in draft}
            onChange={(v) => onChange(schema.key, v)}
            onReset={() => onReset(schema.key)}
            saving={saving}
          />
        );
      })}
    </>
  );
}

export function groupSettingsSections(data: SettingsData | null): SectionGroup[] {
  if (!data) return [];
  const bySection = new Map<string, SectionGroup>(data.sections.map((section) => [section.id, { ...section, items: [] }]));
  for (const item of data.schema) {
    const section = bySection.get(item.section);
    if (section) section.items.push(item);
  }
  return [...bySection.values()];
}

export function findSettingsSection(data: SettingsData | null, sectionId: string): SectionGroup | null {
  return groupSettingsSections(data).find((section) => section.id === sectionId) || null;
}

export function buildSettingsSaveLabel(count: number, t: (key: string) => string): string {
  if (count <= 0) return t('Save');
  return `${t('Save')} ${count}`;
}

export function canResetField(source: SettingSource, dirty: boolean): boolean {
  return source !== 'default' && !dirty;
}

export function renderSectionAction(
  node: React.ReactNode,
  condition = true,
): React.ReactNode {
  return condition ? node : null;
}

export function sectionHasDirtyKey(section: SectionGroup, draft: Record<string, unknown>): boolean {
  return section.items.some((item) => item.key in draft);
}

export function buildResetAllKeys(section: SectionGroup): string[] {
  return section.items.map((item) => item.key);
}

export function SectionActionButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
