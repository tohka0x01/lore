import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { pickPluginConfig } from "./api";
import { registerTools } from "./tools";
import { registerHooks, loadPromptGuidance } from "./hooks";

const GUIDANCE = loadPromptGuidance();

export default definePluginEntry({
  id: "lore",
  name: "Lore",
  description: "Primary Lore memory system for fixed boot baseline, recall, and cross-session project knowledge.",
  register(api) {
    try {
      api.logger.info(`lore: register() start, cfg keys: ${Object.keys(api?.pluginConfig ?? {}).join(",") || "none"}`);
      const pluginCfg = pickPluginConfig(api);
      api.logger.info(`lore: baseUrl=${pluginCfg.baseUrl}, recall=${pluginCfg.recallEnabled}`);
      registerTools(api, pluginCfg);
      api.logger.info(`lore: tools registered ok`);
      registerHooks(api, pluginCfg, GUIDANCE);
      api.logger.info(`lore: hooks registered ok`);
    } catch (e: any) {
      api.logger.error(`lore: register() FAILED: ${e.message}\n${e.stack}`);
      throw e;
    }
  },
});

// Re-export from modules for testing and backward compatibility
export { parseMemoryUri, resolveMemoryLocator, splitParentPathAndTitle, trimSlashes, sameLocator } from "./uri";
export { formatNode, formatBootView, formatRecallBlock, readCueList, normalizeSearchResults, normalizeKeywordList, normalizeUriList } from "./formatters";
export { textResult, pickPluginConfig } from "./api";
