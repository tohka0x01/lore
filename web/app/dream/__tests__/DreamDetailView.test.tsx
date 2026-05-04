import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DreamDetailView } from '../DreamDetailView';
import type { DreamEntry } from '../useDreamPageController';

function entry(overrides: Partial<DreamEntry> = {}): DreamEntry {
  return {
    id: 1,
    status: 'completed',
    started_at: '2024-01-01T00:00:00Z',
    duration_ms: 1000,
    summary: {},
    narrative: 'Poetic diary',
    raw_narrative: 'Raw audit diary',
    poetic_narrative: 'Poetic diary',
    tool_calls: [],
    workflow_events: [],
    memory_changes: [],
    ...overrides,
  };
}

describe('DreamDetailView', () => {
  it('shows the poetic diary by default with an action to view the original diary', () => {
    const html = renderToStaticMarkup(
      <DreamDetailView
        entry={entry()}
        loading={false}
        canRollback={false}
        rollingBack={false}
        onBack={() => undefined}
        onRollback={() => undefined}
        t={(key) => key}
      />,
    );

    expect(html).toContain('Poetic Diary');
    expect(html).toContain('Poetic diary');
    expect(html).toContain('View original diary');
    expect(html).not.toContain('Raw audit diary');
  });
});
