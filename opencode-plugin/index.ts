import type { Plugin } from '@opencode-ai/plugin';
import { loadLorePluginConfig } from './config.js';
import { createLoreTools } from './tools.js';

const loreOpenCodePlugin: Plugin = async () => {
  const config = loadLorePluginConfig();
  return { tool: createLoreTools(config) };
};

export default loreOpenCodePlugin;
