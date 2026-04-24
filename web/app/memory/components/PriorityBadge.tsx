'use client';

import React from 'react';
import clsx from 'clsx';
import { Badge, type BadgeTone } from '../../../components/ui';

interface PriorityBadgeProps {
  priority: number | null | undefined;
  size?: 'sm' | 'lg';
}

const PriorityBadge = ({ priority, size = 'sm' }: PriorityBadgeProps): React.JSX.Element | null => {
  if (priority === null || priority === undefined) return null;

  const tone: BadgeTone =
    priority === 0 ? 'red'
    : priority <= 2 ? 'orange'
    : priority <= 5 ? 'teal'
    : 'soft';

  return (
    <Badge
      tone={tone}
      className={clsx(
        'font-mono tabular-nums',
        size === 'lg' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]',
      )}
    >
      <span className="opacity-70">P</span>{priority}
    </Badge>
  );
};

export default PriorityBadge;
