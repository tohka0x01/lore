'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings } from 'lucide-react';
import { Badge, Button, Card, PageCanvas, PageTitle, StatCard } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { SetupFlowStatus, SetupStepId } from '@/lib/bootSetup';

interface SetupFlowShellProps {
  stepId: SetupStepId;
  setupStatus: SetupFlowStatus | null;
  title: string;
  description: string;
  children: React.ReactNode;
  topNotice?: React.ReactNode;
  footer?: React.ReactNode;
}

function stepTone(current: boolean, complete: boolean): 'blue' | 'green' | 'default' {
  if (current) return 'blue';
  if (complete) return 'green';
  return 'default';
}

export function SetupFlowShell({
  stepId,
  setupStatus,
  title,
  description,
  children,
  topNotice,
  footer,
}: SetupFlowShellProps): React.JSX.Element {
  const { t } = useT();
  const router = useRouter();
  const totalSteps = setupStatus?.steps.length || 5;
  const currentIndex = Math.max(0, setupStatus?.steps.findIndex((step) => step.id === stepId) ?? 0) + 1;
  const completedCount = setupStatus?.steps.filter((step) => step.complete).length || 0;

  return (
    <PageCanvas maxWidth="5xl">
      <PageTitle
        eyebrow={t('First-run setup')}
        title={title}
        description={description}
        right={
          <Button variant="secondary" onClick={() => router.push('/settings')}>
            <Settings size={14} />
            {t('Open settings')}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <StatCard label={t('Current step')} value={`${currentIndex}/${totalSteps}`} tone="blue" compact />
        <StatCard label={t('Complete')} value={completedCount} tone={completedCount === totalSteps ? 'green' : 'default'} compact />
        <StatCard label={t('Remaining')} value={Math.max(totalSteps - completedCount, 0)} tone={completedCount === totalSteps ? 'green' : 'orange'} compact />
      </div>

      {setupStatus && (
        <Card className="mb-6">
          <div className="flex flex-wrap gap-2">
            {setupStatus.steps.map((step) => (
              <Badge
                key={step.id}
                tone={stepTone(step.id === stepId, step.complete)}
                className="px-2.5 py-1 text-[12px]"
              >
                {t(step.label)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {topNotice ? <div className="mb-6">{topNotice}</div> : null}

      <div className="space-y-6">
        {children}
        {footer ? <div className="flex items-center justify-between gap-3">{footer}</div> : null}
      </div>
    </PageCanvas>
  );
}

export function SetupBackButton({ href }: { href: string }): React.JSX.Element {
  const router = useRouter();
  const { t } = useT();
  return (
    <Button variant="ghost" onClick={() => router.push(href)}>
      <ArrowLeft size={14} />
      {t('Back')}
    </Button>
  );
}
