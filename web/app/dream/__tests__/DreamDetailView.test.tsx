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
  it('shows the diary and structured audit without the legacy original diary toggle', () => {
    const audit = {
      primary_focus: 'tree_maintenance',
      changed_nodes: [
        {
          uri: 'project://lore_integration/dream_system/dream_prompt_workflow_review',
          action: 'update_node',
          result: 'success',
          changes: ['absorbed新版 Dream 三层优先级', 'narrowed disclosure'],
        },
      ],
      evidence: [
        {
          query_id: '61a648e8-1c28-48b7-b767-8890c71bbd00',
          reason: '用户明确给出新版 Dream 定义与三层优先级。',
        },
      ],
      why_not_more_changes: '今日候选均可归入既有节点。',
      expected_effect: '后续查询新版 Dream 定义时更稳定命中。',
      confidence: 'high',
    };
    const html = renderToStaticMarkup(
      <DreamDetailView
        entry={entry({ raw_narrative: JSON.stringify(audit), poetic_narrative: 'Poetic diary' })}
        loading={false}
        canRollback={false}
        rollingBack={false}
        onBack={() => undefined}
        onRollback={() => undefined}
        t={(key) => key}
      />,
    );

    expect(html).toContain('Diary');
    expect(html).toContain('Poetic diary');
    expect(html).not.toContain('View original diary');
    expect(html).not.toContain('Original Diary');
    expect(html).toContain('Dream Audit');
    expect(html).toContain('tree_maintenance');
    expect(html).toContain('project://lore_integration/dream_system/dream_prompt_workflow_review');
    expect(html).toContain('absorbed新版 Dream 三层优先级');
    expect(html).toContain('用户明确给出新版 Dream 定义与三层优先级。');
    expect(html).toContain('今日候选均可归入既有节点。');
    expect(html).toContain('后续查询新版 Dream 定义时更稳定命中。');
    expect(html).toContain('high');
  });
});
