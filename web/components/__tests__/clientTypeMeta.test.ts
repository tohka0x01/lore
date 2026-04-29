import { describe, expect, it } from 'vitest';
import {
  KNOWN_CLIENT_TYPES,
  clientTypeAssetPath,
  clientTypeInitials,
  clientTypeLabel,
} from '../clientTypeMeta';

describe('clientTypeMeta', () => {
  it('exposes Pi display metadata', () => {
    expect(KNOWN_CLIENT_TYPES).toContain('pi');
    expect(clientTypeLabel('pi')).toBe('Pi');
    expect(clientTypeAssetPath('pi')).toBe('/channel-icons/pi.svg');
    expect(clientTypeInitials('pi')).toBe('π');
  });
});
