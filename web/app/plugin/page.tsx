import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Plugin · Lore',
  description: 'Lore plugin console entry',
};

export default function PluginPage() {
  redirect('/recall');
}
