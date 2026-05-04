import type { SetupFlowStatus, SetupStepId } from '@/lib/bootSetup';

export function isLastSetupStep(setupStatus: SetupFlowStatus | null | undefined, stepId: SetupStepId): boolean {
  const steps = setupStatus?.steps || [];
  if (steps.length === 0) return false;
  return steps[steps.length - 1]?.id === stepId;
}

export function getSetupAdvanceTarget(setupStatus: SetupFlowStatus | null | undefined, stepId: SetupStepId): string {
  const steps = setupStatus?.steps || [];
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) return setupStatus?.next_step || '/memory';
  return steps[index + 1]?.path || '/memory';
}

export function setupAdvanceLabel(
  setupStatus: SetupFlowStatus | null | undefined,
  stepId: SetupStepId,
  t: (key: string) => string,
): string {
  return isLastSetupStep(setupStatus, stepId) ? t('Complete') : t('Next step');
}
