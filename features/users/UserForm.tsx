'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { callAdminUsers, type AcademyRole, type AcademyUser } from '@/lib/users/remote';

export interface CreatedCredential {
  email: string;
  password: string | null;
}

export function UserForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (credential: CreatedCredential) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AcademyRole>('cs');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Email wajib diisi.');
      return;
    }
    setSaving(true);
    const result = await callAdminUsers<{ user: AcademyUser; password: string | null }>('create', {
      email: email.trim(),
      fullName: fullName.trim(),
      role,
      password: password.trim(),
    });
    setSaving(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Gagal menambah pengguna.');
      return;
    }
    onCreated({ email: result.data.user.email, password: result.data.password });
  };

  return (
    <>
      <div className="row sp">
        <h2>Tambah Pengguna</h2>
        <button className="icb" onClick={onCancel} aria-label="Tutup" type="button">
          <Icon name="x" />
        </button>
      </div>
      <p className="sm muted mt1">
        Akun langsung aktif. Role <b>cs</b> hanya bisa belajar dan membalas WA; role <b>owner</b>
        bisa mengelola materi dan pengguna.
      </p>

      {error ? (
        <Note variant="red" icon="shield-alert">
          {error}
        </Note>
      ) : null}

      <div className="ai-form-grid mt">
        <div className="full">
          <label className="flab" htmlFor="user-email">
            Email
          </label>
          <input
            id="user-email"
            className="inp"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@samaqu.id"
          />
        </div>
        <div className="full">
          <label className="flab" htmlFor="user-name">
            Nama lengkap
          </label>
          <input
            id="user-name"
            className="inp"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="mis. Lea Virani"
          />
        </div>
        <div>
          <label className="flab" htmlFor="user-role">
            Role
          </label>
          <select
            id="user-role"
            className="inp"
            value={role}
            onChange={(event) => setRole(event.target.value as AcademyRole)}
          >
            <option value="cs">Admin CS (read-only materi)</option>
            <option value="owner">Owner / Super Admin</option>
          </select>
        </div>
        <div>
          <label className="flab" htmlFor="user-password">
            Password (opsional)
          </label>
          <input
            id="user-password"
            className="inp"
            type="text"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Kosongkan = dibuat otomatis"
          />
        </div>
      </div>

      <div className="mfoot">
        <button className="btn" onClick={onCancel} disabled={saving} type="button">
          Batal
        </button>
        <button className="btn p" onClick={() => void submit()} disabled={saving} type="button">
          <Icon name="plus" />
          {saving ? 'Menyimpan…' : 'Tambah Pengguna'}
        </button>
      </div>
    </>
  );
}
