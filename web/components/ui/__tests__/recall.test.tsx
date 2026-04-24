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
  default: ({ children }: { children: React.ReactNode }) => <span data-badge="true">{children}</span>,
}));

import { CueList } from '../recall';

describe('recall UI wrappers', () => {
  it('renders cue tags through Badge', () => {
    const html = renderToStaticMarkup(<CueList item={{ cues: ['exact', 'semantic'] }} />);

    expect((html.match(/data-badge="true"/g) || []).length).toBe(2);
    expect(html).toContain('exact');
    expect(html).toContain('semantic');
  });
});
