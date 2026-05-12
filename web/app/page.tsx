export const metadata = {
  title: 'Lore',
  description: 'Lore fixed-boot memory console and structural audit',
};

export default function HomePage() {
  // AppShell (in root layout) handles auth + redirect to /memory
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-fill-tertiary border-t-sys-blue" />
    </div>
  );
}
