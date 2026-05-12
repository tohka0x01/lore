import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Maintenance · Lore',
  description: 'Lore maintenance console entry',
};

export default function Maintenance() {
  redirect('/memory');
}
