import type { ChannelId, ChannelResult, ChannelStatus, Lang, NeedInstall } from '../core/types.js';
import type { ExecFn } from '../core/exec.js';

export type ChannelContext = {
  loreHome: string;
  baseUrl: string;
  apiToken?: string;
  releaseVersion?: string;
  needInstall: NeedInstall;
  force: boolean;
  lang: Lang;
  /** Injectable command runner (default: createExec). */
  run?: ExecFn;
  /** Override home directory for tests (default: os.homedir()). */
  homeDir?: string;
};

export type UninstallContext = {
  loreHome: string;
  homeDir?: string;
  run?: ExecFn;
  purgeRelated?: boolean;
};

export type ChannelInstaller = {
  id: ChannelId;
  detectCli(): Promise<boolean>;
  install(ctx: ChannelContext): Promise<ChannelResult>;
  uninstall(ctx: UninstallContext): Promise<ChannelResult>;
  status(ctx?: { loreHome?: string; homeDir?: string }): Promise<ChannelStatus>;
};
