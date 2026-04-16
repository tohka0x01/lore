import {
  getSetupStepPath,
  type BootNodeRole,
  type SetupFlowStatus,
  type SetupFlowStep,
  type SetupRuntimeStatus,
} from '@/lib/bootSetup';
import { getSettings } from '@/server/lore/config/settings';
import { bootView, type BootViewResult } from '@/server/lore/memory/boot';
import { resolveViewLlmConfig } from '@/server/lore/llm/config';

function isConfiguredValue(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

function buildBootStep(role: BootNodeRole, boot: BootViewResult): SetupFlowStep {
  const node = boot.nodes.find((entry) => entry.role === role);
  const stepId = role === 'agent' ? 'boot-agent' : role === 'soul' ? 'boot-soul' : 'boot-user';
  return {
    id: stepId,
    path: getSetupStepPath(stepId),
    complete: node?.state === 'initialized',
    role,
    uri: node?.uri,
  };
}

function findNextStep(steps: SetupFlowStep[]): string | null {
  return steps.find((step) => !step.complete)?.path || null;
}

export function buildSetupFlowStatus(input: {
  embedding: SetupRuntimeStatus;
  llm: SetupRuntimeStatus;
  boot: BootViewResult;
}): SetupFlowStatus {
  const steps: SetupFlowStep[] = [
    {
      id: 'embedding',
      path: getSetupStepPath('embedding'),
      complete: input.embedding.configured,
    },
    {
      id: 'llm',
      path: getSetupStepPath('llm'),
      complete: input.llm.configured,
    },
    buildBootStep('agent', input.boot),
    buildBootStep('soul', input.boot),
    buildBootStep('user', input.boot),
  ];

  const next_step = findNextStep(steps);
  return {
    complete: next_step === null,
    next_step,
    steps,
    embedding: input.embedding,
    llm: input.llm,
    boot: {
      overall_state: input.boot.overall_state,
      nodes: input.boot.nodes,
      loaded: input.boot.loaded,
      total: input.boot.total,
      remaining_count: input.boot.remaining_count,
      draft_generation_available: input.boot.draft_generation_available,
      draft_generation_reason: input.boot.draft_generation_reason,
    },
  };
}

export async function getSetupFlowStatus(): Promise<SetupFlowStatus> {
  const [settings, boot, resolvedViewLlm] = await Promise.all([
    getSettings([
      'embedding.base_url',
      'embedding.api_key',
      'embedding.model',
      'view_llm.base_url',
      'view_llm.api_key',
      'view_llm.model',
    ]),
    bootView(),
    resolveViewLlmConfig(),
  ]);

  const embeddingConfigured = isConfiguredValue(settings['embedding.base_url'])
    && isConfiguredValue(settings['embedding.api_key'])
    && isConfiguredValue(settings['embedding.model']);
  const llmConfigured = isConfiguredValue(settings['view_llm.base_url'])
    && isConfiguredValue(settings['view_llm.api_key'])
    && isConfiguredValue(settings['view_llm.model']);

  return buildSetupFlowStatus({
    embedding: {
      configured: embeddingConfigured,
      runtime_ready: embeddingConfigured,
    },
    llm: {
      configured: llmConfigured,
      runtime_ready: Boolean(resolvedViewLlm),
    },
    boot,
  });
}
