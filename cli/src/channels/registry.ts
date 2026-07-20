import type { ChannelId } from '../core/types.js';
import type { ChannelInstaller } from './types.js';
import { hermesInstaller } from './hermes.js';
import { piInstaller } from './pi.js';

const installers: Partial<Record<ChannelId, ChannelInstaller>> = {
  pi: piInstaller,
  hermes: hermesInstaller,
};

export function getInstaller(id: ChannelId): ChannelInstaller {
  const installer = installers[id];
  if (!installer) {
    throw new Error(`No installer registered for channel: ${id}`);
  }
  return installer;
}

export function allInstallers(): ChannelInstaller[] {
  return Object.values(installers).filter((x): x is ChannelInstaller => Boolean(x));
}

export function registerInstaller(installer: ChannelInstaller): void {
  installers[installer.id] = installer;
}
