'use client';

import type { Role } from '@/lib/types';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth, type AuthProfile } from './AuthProvider';

interface RoleContextValue {
  role: Role;
  hydrated: boolean;
  canManage: boolean;
  profile: AuthProfile | null;
  signOut: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { role, loading, profile, signOut } = useAuth();
  const hydrated = !loading;

  const value = useMemo(
    () => ({
      role,
      hydrated,
      canManage: hydrated && role === 'owner',
      profile,
      signOut,
    }),
    [role, hydrated, profile, signOut],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used inside RoleProvider');
  return context;
}
