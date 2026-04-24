import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui/es/Avatar/index', () => ({
  default: ({ avatar, title }: { avatar?: React.ReactNode; title?: React.ReactNode }) => <div>{avatar || title}</div>,
}));

vi.mock('@lobehub/ui/es/Input/Input', () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@lobehub/ui/es/Select/Select', () => ({
  default: ({ options = [], value }: { options?: Array<{ label: React.ReactNode; value: string }>; value?: string }) => (
    <select value={value} readOnly>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));

vi.mock('@lobehub/ui/es/Segmented/index', () => ({
  default: ({ options = [], value }: { options?: Array<{ label: React.ReactNode; value: string }>; value?: string }) => (
    <div data-lobe-segmented="true" data-value={value}>
      {options.map((option) => <button key={option.value} type="button">{option.label}</button>)}
    </div>
  ),
}));

vi.mock('@lobehub/ui/es/Accordion/index', () => ({
  Accordion: ({ children, expandedKeys }: { children: React.ReactNode; expandedKeys?: React.Key[] }) => (
    <div data-lobe-accordion="true" data-expanded-keys={(expandedKeys || []).join(',')}>{children}</div>
  ),
  AccordionItem: ({ children, title }: { children: React.ReactNode; title: React.ReactNode }) => (
    <section><div>{title}</div>{children}</section>
  ),
}));

vi.mock('@lobehub/ui/es/Tag/Tag', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { AppAvatar, AppInput, Badge, Disclosure, SegmentedTabs } from '../controls';

describe('ui controls Lobe wrappers', () => {
  it('exports an AppInput wrapper that renders an input control', () => {
    const html = renderToStaticMarkup(<AppInput placeholder="Search memories" />);

    expect(html).toContain('Search memories');
  });

  it('exports an AppAvatar wrapper that renders avatar content', () => {
    const html = renderToStaticMarkup(<AppAvatar title="Lore" avatar="L" />);

    expect(html).toContain('L');
  });

  it('keeps Badge dot content rendering through the wrapper', () => {
    const html = renderToStaticMarkup(<Badge dot>Active</Badge>);

    expect(html).toContain('Active');
  });

  it('renders SegmentedTabs through Lobe Segmented', () => {
    const html = renderToStaticMarkup(
      <SegmentedTabs
        value="view"
        onValueChange={() => undefined}
        options={[
          { value: 'path', label: 'By path' },
          { value: 'view', label: 'By view' },
        ]}
      />,
    );

    expect(html).toContain('data-lobe-segmented="true"');
    expect(html).toContain('data-value="view"');
    expect(html).toContain('By path');
  });

  it('renders Disclosure through Lobe Accordion', () => {
    const html = renderToStaticMarkup(
      <Disclosure open onOpenChange={() => undefined} trigger={<span>Filters</span>}>
        <div>Filter content</div>
      </Disclosure>,
    );

    expect(html).toContain('data-lobe-accordion="true"');
    expect(html).toContain('data-expanded-keys="open"');
    expect(html).toContain('Filters');
    expect(html).toContain('Filter content');
  });
});
