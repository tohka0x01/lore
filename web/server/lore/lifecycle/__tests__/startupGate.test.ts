import { describe, expect, it } from 'vitest';
import { createLifecycleStartupGate } from '../startupGate';

describe('lifecycle startup gate', () => {
  it('admits first use and rejects a duplicate client/session before expiry', () => {
    const gate = createLifecycleStartupGate(100);

    expect(gate.firstSeen('opencode', 'session-1', 1_000)).toBe(true);
    expect(gate.firstSeen('opencode', 'session-1', 1_099)).toBe(false);
  });

  it('isolates client and session keys and admits expired entries', () => {
    const gate = createLifecycleStartupGate(100);

    expect(gate.firstSeen('opencode', 'session-1', 1_000)).toBe(true);
    expect(gate.firstSeen('pi', 'session-1', 1_001)).toBe(true);
    expect(gate.firstSeen('opencode', 'session-2', 1_002)).toBe(true);
    expect(gate.firstSeen('opencode', 'session-1', 1_100)).toBe(true);
  });

  it('never retains an anonymous key and clear resets retained sessions', () => {
    const gate = createLifecycleStartupGate(100);

    expect(gate.firstSeen('opencode', '', 1_000)).toBe(true);
    expect(gate.firstSeen('opencode', '', 1_001)).toBe(true);
    expect(gate.firstSeen('opencode', 'session-1', 1_002)).toBe(true);
    expect(gate.firstSeen('opencode', 'session-1', 1_003)).toBe(false);
    gate.clear();
    expect(gate.firstSeen('opencode', 'session-1', 1_004)).toBe(true);
  });
});
