import { notFound } from 'next/navigation';
import BootSetupStep from '@/components/setup/BootSetupStep';

export default function SetupBootRolePage({ params }: { params: { role: string } }) {
  if (params.role === 'agent' || params.role === 'soul' || params.role === 'user') {
    return <BootSetupStep role={params.role} />;
  }
  notFound();
}
