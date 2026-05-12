import SettingsSetupStep from '@/components/setup/SettingsSetupStep';

export const metadata = {
  title: 'LLM Setup · Lore',
  description: 'Configure Lore language model settings',
};

export default function SetupLlmPage() {
  return <SettingsSetupStep sectionId="view_llm" />;
}
