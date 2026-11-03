'use client';

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Role } from '@/lib/types';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface AuthProfile {
  id: string;
  fullName: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  role: Role;
  loading: boolean;
  configured: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function fallbackProfile(user: User): AuthProfile {
  return {
    id: user.id,
    fullName:
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split('@')[0] ||
      'User',
    role: user.app_metadata?.role === 'owner' ? 'owner' : 'cs',
  };
}

async function loadProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<AuthProfile> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        fullName: data.full_name || fallbackProfile(user).fullName,
        role: data.role === 'owner' ? 'owner' : 'cs',
      };
    }
    if (attempt === 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
    }
  }
  return fallbackProfile(user);
}

function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'Email atau password salah.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Email belum dikonfirmasi. Hubungi owner untuk konfirmasi akun.';
  }
  if (/fetch|network/i.test(message)) {
    return 'Tidak bisa menghubungi Supabase. Periksa koneksi lalu coba lagi.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(isSupabaseConfigured());
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async (supabase: SupabaseClient, nextUser: User) => {
    setUser(nextUser);
    const nextProfile = await loadProfile(supabase, nextUser);
    setProfile(nextProfile);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setConfigured(false);
      setLoading(false);
      setError(
        'Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      );
      return;
    }

    let active = true;
    setConfigured(true);

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        await hydrate(supabase, data.session.user);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      void hydrate(supabase, session.user);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [hydrate]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        const message = 'Supabase belum dikonfigurasi.';
        setError(message);
        return { error: message };
      }
      setError(null);
      setLoading(true);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        const message = authErrorMessage(signInError.message);
        setError(message);
        setLoading(false);
        return { error: message };
      }
      if (data.user) {
        await hydrate(supabase, data.user);
        return {};
      }
      setLoading(false);
      return { error: 'Login gagal. Coba lagi.' };
    },
    [hydrate],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setError(null);
  }, []);

  const role: Role = profile?.role ?? (user?.app_metadata?.role === 'owner' ? 'owner' : 'cs');

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      loading,
      configured,
      error,
      signIn,
      signOut,
    }),
    [user, profile, role, loading, configured, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
