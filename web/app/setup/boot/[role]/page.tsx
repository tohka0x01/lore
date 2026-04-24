import { notFound } from 'next/navigation';
import BootSetupStep from '@/components/setup/BootSetupStep';

export default async function SetupBootRolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (typeof role === 'string' && role.trim()) {
    return <BootSetupStep setupSlug={role.trim()} />;
  }
  notFound();
}
