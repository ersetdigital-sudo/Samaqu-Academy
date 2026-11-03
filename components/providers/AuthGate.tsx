'use client';

import { GateScreen } from '@/components/layout/GateScreen';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user, configured, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace('/login');
    }
  }, [configured, loading, router, user]);

  if (!configured) {
    return (
      <GateScreen
        title="Supabase belum dikonfigurasi"
        subtitle={
          error ??
          'Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local lalu build ulang.'
        }
      />
    );
  }

  if (loading || !user) {
    return (
      <GateScreen
        title="Memuat sesi…"
        subtitle="Menghubungkan ke Samaqu CS Academy."
        loading
      />
    );
  }

  return <>{children}</>;
}
