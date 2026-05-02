'use client';

import React, { type ReactNode } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import LobeThemeProvider from '@lobehub/ui/es/ThemeProvider/index';
import { motion } from 'motion/react';
import { useTheme } from '../../lib/theme';

export function AppUIProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <ConfigProvider motion={motion}>
      <LobeThemeProvider appearance={theme === 'light' ? 'light' : 'dark'}>
        {children}
      </LobeThemeProvider>
    </ConfigProvider>
  );
}
