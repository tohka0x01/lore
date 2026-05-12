import { Suspense } from 'react';
import DreamPage from './DreamPage';

export const metadata = {
  title: 'Dream · Lore',
  description: 'Review and run Lore dream maintenance workflows',
};

export default function Dream() {
  return (
    <Suspense fallback={null}>
      <DreamPage />
    </Suspense>
  );
}
