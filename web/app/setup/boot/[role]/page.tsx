import { notFound } from 'next/navigation';
import BootSetupStep from '@/components/setup/BootSetupStep';

export default function SetupBootRolePage({ params }: { params: { role: string } }) {
  if (typeof params.role === 'string' && params.role.trim()) {
    return <BootSetupStep setupSlug={params.role.trim()} />;
  }
  notFound();
}
