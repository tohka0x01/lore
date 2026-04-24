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
  default: ({ children }: { children: React.ReactNode }) => <span data-badge="true">{children}</span>,
}));

vi.mock('../../../../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

import MemoryEditor from '../MemoryEditor';
import MemoryViewsSection from '../MemoryViewsSection';

describe('memory detail Lobe wrappers', () => {
  it('renders disclosure editing through AppInput', () => {
    const html = renderToStaticMarkup(
      <MemoryEditor
        editContent="body"
        setEditContent={() => undefined}
        editDisclosure="when useful"
        setEditDisclosure={() => undefined}
        editPriority={2}
        setEditPriority={() => undefined}
        saving={false}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('data-app-input="true"');
    expect(html).toContain('when useful');
  });

  it('renders LLM model metadata through Badge', () => {
    const html = renderToStaticMarkup(
      <MemoryViewsSection
        t={(key) => key}
        memoryViews={[
          {
            id: 1,
            view_type: 'summary',
            weight: 1,
            status: 'active',
            text_content: 'view text',
            metadata: { llm_refined: true, llm_model: 'claude-opus-4-7' },
          } as any,
        ]}
      />,
    );

    expect(html).toContain('data-badge="true"');
    expect(html).toContain('claude-opus-4-7');
  });
});
