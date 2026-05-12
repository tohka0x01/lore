import './globals.css';
import AppShell from '../components/AppShell';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Lore',
  description: 'Lore fixed-boot memory console and structural audit',
};

// Runs before React hydration to avoid a light/dark flash on first paint.
const noFlashScript = `(function(){try{var t=localStorage.getItem('lore-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
