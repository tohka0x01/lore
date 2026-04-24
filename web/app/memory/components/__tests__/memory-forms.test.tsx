import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui/es/Avatar/index', () => ({
  default: ({ avatar, title }: { avatar?: React.ReactNode; title?: React.ReactNode }) => <div>{avatar || title}</div>,
}));

vi.mock('@lobehub/ui/es/Input/Input', () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input data-app-input="true" {...props} />,
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

vi.mock('../../../../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../../lib/api', () => ({
  api: { post: vi.fn() },
}));

import CreateNodeForm from '../CreateNodeForm';
import MoveDialog from '../MoveDialog';

describe('memory form Lobe input wrappers', () => {
  it('renders title and disclosure fields through AppInput', () => {
    const html = renderToStaticMarkup(
      <CreateNodeForm domain="core" parentPath="agent" onCreated={() => undefined} onCancel={() => undefined} />,
    );

    expect(html).toContain('data-app-input="true"');
    expect((html.match(/data-app-input="true"/g) || []).length).toBe(2);
    expect(html).toContain('snake_case_name');
    expect(html).toContain('When should this memory be recalled?');
  });

  it('renders the new URI field through AppInput', () => {
    const html = renderToStaticMarkup(
      <MoveDialog domain="core" path="agent" onMoved={() => undefined} onCancel={() => undefined} />,
    );

    expect(html).toContain('data-app-input="true"');
    expect(html).toContain('core://agent');
  });
});
