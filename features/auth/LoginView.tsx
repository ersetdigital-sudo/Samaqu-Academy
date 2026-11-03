'use client';

import { GateScreen } from '@/components/layout/GateScreen';
import { useAuth } from '@/components/providers/AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

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
