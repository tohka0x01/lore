import { getSettings } from '../config/settings';

export interface LifecycleTextConfig {
  guidance: string;
  bootPreamble: string;
  startupRecallPreamble: string;
  promptRecallPreamble: string;
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

export async function loadLifecycleTextConfig(): Promise<LifecycleTextConfig> {
  const values = await getSettings([
    'lifecycle.guidance.enabled',
    'lifecycle.guidance.global',
    'lifecycle.boot.preamble',
    'lifecycle.startup_recall.preamble',
    'lifecycle.prompt_recall.preamble',
  ]);
  return {
    guidance: values['lifecycle.guidance.enabled'] === false ? '' : cleanText(values['lifecycle.guidance.global']),
    bootPreamble: cleanText(values['lifecycle.boot.preamble']),
    startupRecallPreamble: cleanText(values['lifecycle.startup_recall.preamble']),
    promptRecallPreamble: cleanText(values['lifecycle.prompt_recall.preamble']),
  };
}
