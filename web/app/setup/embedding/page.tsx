import SettingsSetupStep from '@/components/setup/SettingsSetupStep';

export const metadata = {
  title: 'Embedding Setup · Lore',
  description: 'Configure Lore embedding settings',
};

export default function SetupEmbeddingPage() {
  return <SettingsSetupStep sectionId="embedding" />;
}
