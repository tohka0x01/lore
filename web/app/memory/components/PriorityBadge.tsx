'use client';

import React from 'react';
import { Badge, type BadgeTone, type BadgeSize } from '../../../components/ui';

interface PriorityBadgeProps {
  priority: number | null | undefined;
  size?: 'sm' | 'lg';
}

const SIZE_MAP: Record<'sm' | 'lg', BadgeSize> = { sm: 'sm', lg: 'md' };

const PriorityBadge = ({ priority, size = 'sm' }: PriorityBadgeProps): React.JSX.Element | null => {
  if (priority === null || priority === undefined) return null;

  const tone: BadgeTone =
    priority === 0 ? 'red'
    : priority <= 2 ? 'orange'
    : priority <= 5 ? 'teal'
    : 'soft';

  return (
    <Badge tone={tone} size={SIZE_MAP[size]} mono>
      <span className="opacity-70">P</span>{priority}
    </Badge>
  );
};

export default PriorityBadge;
