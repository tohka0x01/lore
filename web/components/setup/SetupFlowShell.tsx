'use client';

import React from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card, PageCanvas, PageTitle } from '@/components/ui';
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
  right?: React.ReactNode;
}

function stepPillClass(current: boolean, complete: boolean): string {
  if (current) return 'border-sys-blue/40 bg-sys-blue/10 text-txt-primary';
  if (complete) return 'border-sys-green/25 bg-sys-green/10 text-txt-primary';
  return 'border-separator-hairline bg-bg-raised text-txt-secondary';
}

function stepDotClass(current: boolean, complete: boolean): string {
  if (current) return 'bg-sys-blue shadow-[0_0_0_3px_rgba(64,156,255,0.16)]';
  if (complete) return 'bg-sys-green';
  return 'bg-fill-primary';
}

export function SetupFlowShell({
  stepId,
  setupStatus,
  title,
  description,
  children,
  topNotice,
  footer,
  right,
}: SetupFlowShellProps): React.JSX.Element {
  const { t } = useT();
  const totalSteps = setupStatus?.steps.length || 5;
  const currentIndex = Math.max(0, setupStatus?.steps.findIndex((step) => step.id === stepId) ?? 0) + 1;
  const completedCount = setupStatus?.steps.filter((step) => step.complete).length || 0;
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <PageCanvas maxWidth="5xl">
      <PageTitle
        compact
        eyebrow={t('First-run setup')}
        title={title}
        description={description}
        right={right}
      />

      {setupStatus && (
        <Card padded={false} className="mb-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-separator-hairline px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-txt-tertiary">{t('Setup progress')}</div>
              <div className="mt-1 text-[13px] font-medium text-txt-primary">
                {t('Step')} {currentIndex}/{totalSteps} · {t(setupStatus.steps[currentIndex - 1]?.label || '')}
              </div>
            </div>
            <Badge tone={setupStatus.complete ? 'green' : 'blue'} className="px-2.5 py-1 text-[12px]">
              {completedCount}/{totalSteps}
            </Badge>
          </div>
          <div className="px-4 py-4 md:px-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-fill-tertiary">
              <div className="h-full rounded-full bg-sys-blue transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-0.5">
              {setupStatus.steps.map((step, index) => {
                const current = step.id === stepId;
                return (
                  <div
                    key={step.id}
                    className={clsx(
                      'flex min-w-[150px] items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                      stepPillClass(current, step.complete),
                    )}
                  >
                    <span className={clsx('h-2 w-2 shrink-0 rounded-full', stepDotClass(current, step.complete))} aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium leading-snug">{t(step.label)}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-txt-quaternary">{String(index + 1).padStart(2, '0')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
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
