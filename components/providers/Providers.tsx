'use client';

import type { ReactNode } from 'react';
import { AuthGate } from './AuthGate';
import { DataProvider } from './DataProvider';
import { ModalProvider } from './ModalProvider';
import { RoleProvider } from './RoleProvider';
import { SessionProvider } from './SessionProvider';
import { ToastProvider } from './ToastProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthGate>
        <RoleProvider>
          <DataProvider>
            <SessionProvider>
              <ModalProvider>{children}</ModalProvider>
            </SessionProvider>
          </DataProvider>
        </RoleProvider>
      </AuthGate>
    </ToastProvider>
  );
}
