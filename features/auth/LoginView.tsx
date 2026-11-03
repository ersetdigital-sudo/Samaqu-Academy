'use client';

import { GateScreen } from '@/components/layout/GateScreen';
import { useAuth } from '@/components/providers/AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export function LoginView() {
  const { user, loading, configured, error, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, router, user]);

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

  if (user) {
    return <GateScreen title="Mengalihkan…" loading />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setFormError('Email dan password wajib diisi.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    router.replace('/');
  };

  const handleGoogle = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFormError('Supabase belum dikonfigurasi.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        setFormError(
          /provider is not enabled/i.test(error.message)
            ? 'Login Google belum diaktifkan di Supabase.'
            : error.message,
        );
        setSubmitting(false);
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Login Google gagal. Coba lagi.');
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">S</div>
          <div>
            <b>Samaqu CS Academy</b>
            <small>Internal Learning Platform</small>
          </div>
        </div>

        <h1 className="auth-title">Masuk ke dashboard</h1>
        <p className="auth-sub">
          Gunakan akun yang diberikan Owner / Super Admin untuk mengakses materi dan data academy.
        </p>

        <button
          className="auth-google"
          type="button"
          onClick={() => void handleGoogle()}
          disabled={submitting}
        >
          <GoogleIcon />
          Lanjutkan dengan Google
        </button>

        <div className="auth-divider">atau masuk dengan email</div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="inp"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="nama@samaqu.academy"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="inp"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {formError || error ? (
            <div className="note rd auth-error">
              <Icon name="shield-alert" />
              <div>{formError || error}</div>
            </div>
          ) : null}

          <button className="btn p auth-submit" type="submit" disabled={submitting}>
            <Icon name={submitting ? 'refresh-cw' : 'log-out'} />
            {submitting ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <div className="auth-foot">
          Akun dikelola oleh Owner / Super Admin. Hubungi owner jika belum punya akses.
        </div>
      </div>
    </div>
  );
}
