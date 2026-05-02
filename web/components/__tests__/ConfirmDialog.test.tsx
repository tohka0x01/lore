import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: <T,>(initial: T) => [initial, vi.fn()] as const,
  };
});

vi.mock('@lobehub/ui/es/Modal/index', () => ({
  default: ({
    children,
    open,
    title,
    footer,
    centered,
    className,
    mask,
    keyboard,
  }: {
    children: React.ReactNode;
    open?: boolean;
    title?: React.ReactNode;
    footer?: React.ReactNode;
    centered?: boolean;
    className?: string;
    mask?: { closable?: boolean };
    keyboard?: boolean;
  }) => (
    <section
      data-lobe-modal="true"
      data-open={String(open)}
      data-mask-closable={String(Boolean(mask?.closable))}
      data-keyboard={String(Boolean(keyboard))}
      data-class-name={className || ''}
      data-centered={String(Boolean(centered))}
    >
      <h1>{title}</h1>
      <div>{children}</div>
      {footer === null ? null : <footer>{footer}</footer>}
    </section>
  ),
}));

vi.mock('sonner', () => ({
  Toaster: () => <div data-toaster="true" />,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../ui', () => ({
  Button: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <button className={className} data-variant={variant}>{children}</button>
  ),
  Modal: ({ children, open, title, footer }: { children: React.ReactNode; open?: boolean; title?: React.ReactNode; footer?: React.ReactNode }) => (
    <section data-app-modal="true" data-open={String(open)}>
      <h1>{title}</h1>
      <div>{children}</div>
      {footer === null ? null : <footer>{footer}</footer>}
    </section>
  ),
}));

vi.mock('../../lib/theme', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

import { ConfirmModalForTest } from '../ConfirmDialog';

function renderConfirmModal(options: { destructive?: boolean; hideCancel?: boolean } = {}) {
  return renderToStaticMarkup(
    <ConfirmModalForTest
      dialog={{
        title: 'Delete memory',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        destructive: options.destructive,
        hideCancel: options.hideCancel,
        resolve: () => undefined,
      }}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />,
  );
}

describe('ConfirmProvider modal', () => {
  it('renders confirmations through the shared Modal wrapper with message and actions', () => {
    const html = renderConfirmModal();

    expect(html).toContain('data-app-modal="true"');
    expect(html).toContain('data-open="true"');
    expect(html).toContain('Delete memory');
    expect(html).toContain('This cannot be undone.');
    expect(html).toContain('Cancel');
    expect(html).toContain('Delete');
    expect(html).toContain('data-variant="secondary"');
    expect(html).not.toContain('data-variant="primary"');
  });

  it('maps destructive confirmations to the destructive button variant', () => {
    const html = renderConfirmModal({ destructive: true });

    expect(html).toContain('data-variant="destructive"');
  });

  it('can hide the cancel action', () => {
    const html = renderConfirmModal({ hideCancel: true });

    expect(html).not.toContain('Cancel');
    expect(html).toContain('Delete');
  });
});
