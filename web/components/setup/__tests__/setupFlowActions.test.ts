import { describe, expect, it } from 'vitest';
import { getSetupAdvanceTarget, isLastSetupStep, setupAdvanceLabel } from '../setupFlowActions';
import type { SetupFlowStatus } from '@/lib/bootSetup';

const setupStatus: SetupFlowStatus = {
  complete: false,
  next_step: '/setup/embedding',
  steps: [
    { id: 'embedding', path: '/setup/embedding', label: 'Embedding setup', complete: false },
    { id: 'llm', path: '/setup/llm', label: 'View LLM setup', complete: false },
    { id: 'channel_agents', path: '/setup/channels', label: 'Channel agent setup', complete: false },
  ],
  embedding: { configured: false, runtime_ready: false },
  llm: { configured: false, runtime_ready: false },
  boot: {
    overall_state: 'partial',
    nodes: [],
    loaded: 0,
    total: 0,
    remaining_count: 0,
    draft_generation_available: false,
    draft_generation_reason: null,
    includes_all_clients: false,
  },
};

describe('setup flow actions', () => {
  it('advances by current step order instead of first incomplete step', () => {
    expect(getSetupAdvanceTarget(setupStatus, 'llm')).toBe('/setup/channels');
  });

  it('uses memory as the target after the last step', () => {
    expect(isLastSetupStep(setupStatus, 'channel_agents')).toBe(true);
    expect(getSetupAdvanceTarget(setupStatus, 'channel_agents')).toBe('/memory');
  });

  it('labels only the last step as complete', () => {
    const t = (key: string) => key;
    expect(setupAdvanceLabel(setupStatus, 'embedding', t)).toBe('Next step');
    expect(setupAdvanceLabel(setupStatus, 'channel_agents', t)).toBe('Complete');
  });
});
