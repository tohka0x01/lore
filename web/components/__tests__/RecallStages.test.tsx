import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../ui', () => ({
  TextButton: ({ children, className, active, tone = 'blue', type = 'button', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: string }) => (
    <button
      data-text-button="true"
      data-active={String(active)}
      tone={tone}
      type={type}
      className={
        (className || '') +
        (active ? ' bg-sys-blue/15 font-semibold' : tone === 'default' ? ' hover:bg-fill-quaternary' : '')
      }
      {...props}
    >{children}</button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  StatCard: ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => <div data-stat-card="true">{label}{value}</div>,
  Empty: ({ text }: { text: string }) => <div data-empty-state="true">{text}</div>,
  Table: ({ empty }: { empty?: string }) => <table data-table="true"><tbody><tr><td>{empty}</td></tr></tbody></table>,
  BreakdownGrid: () => <div data-breakdown-grid="true" />,
  CueList: () => <div data-cue-list="true" />,
  fmt: (value: unknown) => String(value ?? '—'),
  safeArray: <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [],
  asNumber: (value: unknown, fallback = 0) => Number(value) || fallback,
  formatRecallBlock: () => '',
}));

import RecallStages from '../RecallStages';

describe('RecallStages stage selector', () => {
  it('renders stage segments through TextButton with labels, counts, and active state', () => {
    const html = renderToStaticMarkup(<RecallStages data={null} initialStage="dense" />);

    expect((html.match(/data-text-button="true"/g) || []).length).toBe(7);
    expect((html.match(/aria-pressed="true"/g) || []).length).toBe(1);
    expect((html.match(/aria-pressed="false"/g) || []).length).toBe(6);
    expect(html).toContain('Query');
    expect(html).toContain('Exact');
    expect(html).toContain('Glossary');
    expect(html).toContain('Semantic');
    expect(html).toContain('Lexical');
    expect(html).toContain('Merged');
    expect(html).toContain('Shown');
    expect(html).toContain('bg-sys-blue/15');
    expect(html).toContain('font-semibold');
    expect(html).toContain('hover:bg-fill-quaternary');
  });
});
