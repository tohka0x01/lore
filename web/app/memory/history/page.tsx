import React, { Suspense } from 'react';
import MemoryHistoryPage from './MemoryHistoryPage';

export const metadata = {
  title: 'Memory History · Lore',
  description: 'Inspect Lore memory write and update history',
};

export default function Page(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <MemoryHistoryPage />
    </Suspense>
  );
}
