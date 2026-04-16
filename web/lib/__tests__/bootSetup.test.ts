import { describe, expect, it } from 'vitest';
import { getBootSetupDecision, getBootSetupRedirect, isSettingsPath, isSetupPath } from '@/lib/bootSetup';

describe('bootSetup routing helpers', () => {
  it('detects setup paths', () => {
    expect(isSetupPath('/setup')).toBe(true);
    expect(isSetupPath('/setup/extra')).toBe(true);
    expect(isSetupPath('/memory')).toBe(false);
  });

  it('detects settings paths', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/advanced')).toBe(true);
    expect(isSettingsPath('/setup')).toBe(false);
  });

  it('prompts first on incomplete boot when the user has not acknowledged setup yet', () => {
    expect(getBootSetupDecision('/memory', 'partial', false)).toEqual({ kind: 'prompt', target: '/setup' });
    expect(getBootSetupDecision('/', 'uninitialized', false)).toEqual({ kind: 'prompt', target: '/setup' });
  });

  it('redirects incomplete boot state to setup after acknowledgement', () => {
    expect(getBootSetupDecision('/memory', 'partial', true)).toEqual({ kind: 'redirect', target: '/setup' });
    expect(getBootSetupDecision('/', 'uninitialized', true)).toEqual({ kind: 'redirect', target: '/setup' });
    expect(getBootSetupRedirect('/memory', 'partial')).toBe('/setup');
    expect(getBootSetupRedirect('/', 'uninitialized')).toBe('/setup');
  });

  it('allows settings and setup while boot is incomplete', () => {
    expect(getBootSetupDecision('/settings', 'partial', false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupDecision('/setup', 'uninitialized', false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupRedirect('/settings', 'partial')).toBeNull();
    expect(getBootSetupRedirect('/setup', 'uninitialized')).toBeNull();
  });

  it('redirects completed setup back to memory', () => {
    expect(getBootSetupDecision('/setup', 'complete', false)).toEqual({ kind: 'redirect', target: '/memory' });
    expect(getBootSetupDecision('/', 'complete', false)).toEqual({ kind: 'redirect', target: '/memory' });
    expect(getBootSetupRedirect('/setup', 'complete')).toBe('/memory');
    expect(getBootSetupRedirect('/', 'complete')).toBe('/memory');
  });

  it('does nothing when already on a normal page after completion', () => {
    expect(getBootSetupDecision('/memory', 'complete', false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupDecision('/recall', 'complete', false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupRedirect('/memory', 'complete')).toBeNull();
    expect(getBootSetupRedirect('/recall', 'complete')).toBeNull();
  });

  it('does nothing when boot state is unavailable', () => {
    expect(getBootSetupDecision('/memory', null, false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupDecision('/memory', undefined, false)).toEqual({ kind: 'none', target: null });
    expect(getBootSetupRedirect('/memory', null)).toBeNull();
    expect(getBootSetupRedirect('/memory', undefined)).toBeNull();
  });
});
