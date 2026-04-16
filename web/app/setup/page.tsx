'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@/components/ui';
import { SetupFlowShell } from '@/components/setup/SetupFlowShell';
import { getSetupFlowStatus } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { SetupFlowStatus } from '@/lib/bootSetup';

export default function SetupLandingPage(): React.JSX.Element {
  const router = useRouter();
  const { t } = useT();
  const [setupStatus, setSetupStatus] = React.useState<SetupFlowStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getSetupFlowStatus()
      .then((next) => {
        if (!mounted) return;
        setSetupStatus(next);
        router.replace(next.next_step || '/memory');
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : t('Failed to load'));
      });
    return () => {
      mounted = false;
    };
  }, [router, t]);

  return (
    <SetupFlowShell
      stepId="embedding"
      setupStatus={setupStatus}
      title={t('First-run setup')}
      description={t('Lore will guide you through the next required step automatically.')}
    >
      {error ? (
        <Notice tone="danger" title={t('Failed to load')}>
          {error}
        </Notice>
      ) : (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-fill-tertiary border-t-sys-blue" />
        </div>
      )}
    </SetupFlowShell>
  );
}
