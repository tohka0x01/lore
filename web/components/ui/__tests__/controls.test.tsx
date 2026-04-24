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

vi.mock('@lobehub/ui/es/Tag/Tag', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { AppAvatar, AppInput, Badge } from '../controls';

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
});
