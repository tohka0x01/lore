import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { pickPluginConfig, textResult } from './api';
import { registerTools } from './tools';
import { registerHooks } from './hooks';

export default function lorePiExtension(pi: ExtensionAPI) {
  const pluginCfg = pickPluginConfig(pi);
  registerTools(pi, pluginCfg);
  registerHooks(pi, pluginCfg);
}

export { pickPluginConfig, textResult };
export { parseMemoryUri, resolveMemoryLocator, splitParentPathAndTitle, trimSlashes, sameLocator } from './uri';
export { formatNode, formatBootView, formatRecallBlock } from './formatters';
