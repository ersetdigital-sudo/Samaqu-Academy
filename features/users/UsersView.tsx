'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { useAuth } from '@/components/providers/AuthProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  callAdminUsers,
  type AcademyRole,
  type AcademyUser,
} from '@/lib/users/remote';
import { UserForm, type CreatedCredential } from './UserForm';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const ROLE_LABEL: Record<AcademyRole, string> = {
  owner: 'Owner / Super Admin',
  cs: 'Admin CS',
};

export function UsersView() {
  const { canManage, hydrated } = useRole();
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const { openModal, closeModal } = useModal();
  const [items, setItems] = useState<AcademyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [credential, setCredential] = useState<CreatedCredential | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await callAdminUsers<{ items: AcademyUser[] }>('list');
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Gagal memuat daftar pengguna.');
      return;
    }
    setItems(result.data.items);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, hydrated, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.fullName, item.email, ROLE_LABEL[item.role]].join(' ').toLowerCase().includes(term),
    );
  }, [items, search]);

  const openForm = () => {
    openModal(
      <UserForm
        onCancel={closeModal}
        onCreated={(next) => {
          closeModal();
          setCredential(next);
          void load();
          showToast('Pengguna berhasil ditambahkan');
        }}
      />,
      { large: true },
    );
  };

  const changeRole = async (user: AcademyUser, role: AcademyRole) => {
    if (role === user.role) return;
    setBusyId(user.id);
    const result = await callAdminUsers('set_role', { id: user.id, role });
    setBusyId('');
    if (!result.ok) {
      showToast(result.error ?? 'Gagal mengubah role', 'err');
      return;
    }
    setItems((previous) => previous.map((item) => (item.id === user.id ? { ...item, role } : item)));
    showToast(`Role ${user.fullName} diubah menjadi ${ROLE_LABEL[role]}`);
  };

  const toggleActive = async (user: AcademyUser) => {
    setBusyId(user.id);
    const active = !user.active;
    const result = await callAdminUsers('set_active', { id: user.id, active });
    setBusyId('');
    if (!result.ok) {
      showToast(result.error ?? 'Gagal mengubah status akun', 'err');
      return;
    }
    setItems((previous) => previous.map((item) => (item.id === user.id ? { ...item, active } : item)));
    showToast(active ? `Akun ${user.fullName} diaktifkan` : `Akun ${user.fullName} dinonaktifkan`);
  };

  const copyCredential = async () => {
    if (!credential) return;
    const text = credential.password
      ? `Email: ${credential.email}\nPassword: ${credential.password}`
      : `Email: ${credential.email}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Kredensial disalin');
    } catch {
      showToast('Gagal menyalin; salin manual dari kotak di atas', 'err');
    }
  };

  const removeUser = (user: AcademyUser) => {
    openModal(
      <ConfirmDialog
        title="Hapus pengguna permanen?"
        message={
          <>
            <b>{user.fullName || user.email}</b> ({user.email}) akan dihapus dari Supabase Auth,
            profil, dan daftar allowlist. Tindakan ini tidak bisa dibatalkan.
          </>
        }
        onCancel={closeModal}
        onConfirm={async () => {
          const result = await callAdminUsers('delete', { id: user.id });
          if (!result.ok) throw new Error(result.error ?? 'Gagal menghapus pengguna');
          closeModal();
          setItems((previous) => previous.filter((item) => item.id !== user.id));
          showToast('Pengguna dihapus permanen');
        }}
      />,
    );
  };

  if (hydrated && !canManage) {
    return (
      <div className="card ai-denied">
        <div
          className="sic"
          style={{
            margin: '0 auto',
            width: 46,
            height: 46,
            background: 'var(--redl)',
            color: 'var(--red)',
          }}
        >
          <Icon name="lock" size={20} />
        </div>
        <h2 className="mt">Akses terbatas</h2>
        <p className="sm muted mt1">
          Kelola Pengguna hanya dapat dibuka oleh Owner / Super Admin.
        </p>
        <Link className="btn mt2" href="/">
          <Icon name="arrow-left" />
          Kembali ke Overview
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Kelola Pengguna"
        subtitle="Tambah akun, atur role owner/cs, dan nonaktifkan akses tanpa membuka Supabase Dashboard."
        actions={
          <>
            <Link className="btn" href="/settings/ai">
              <Icon name="settings" />
              Pengaturan AI
            </Link>
            <button className="btn p" onClick={openForm} type="button">
              <Icon name="plus" />
              Tambah Pengguna
            </button>
          </>
        }
      />

      <Note variant="neutral" icon="users">
        <b>Owner</b> bisa mengelola materi, pengguna, dan pengaturan AI. <b>Admin CS</b> hanya bisa
        belajar dan membalas WA Inbox; tombol edit materi tidak muncul.
      </Note>

      {credential ? (
        <div className="card mt">
          <div className="row sp">
            <b className="sm">Akun baru dibuat</b>
            <button className="icb" onClick={() => setCredential(null)} aria-label="Tutup" type="button">
              <Icon name="x" />
            </button>
          </div>
          <p className="sm mt1">
            Email: <b>{credential.email}</b>
          </p>
          <p className="sm mt1">
            Password: <b>{credential.password ?? '(memakai password yang diisi)'}</b>
          </p>
          <p className="xs muted mt1">
            Simpan lalu kirim ke pengguna. Password hanya ditampilkan sekali di sini.
          </p>
          <button className="btn mt2" onClick={() => void copyCredential()} type="button">
            <Icon name="copy" />
            Salin kredensial
          </button>
        </div>
      ) : null}

      <div className="toolbar mt">
        <div className="search">
          <Icon name="search" />
          <input
            className="inp"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau email…"
            aria-label="Cari pengguna"
          />
        </div>
        <span className="xs muted">{filtered.length} pengguna</span>
      </div>

      {loading ? (
        <div className="app-loading">
          <div>
            <div className="spinner" />
            Memuat pengguna…
          </div>
        </div>
      ) : error ? (
        <>
          <Note variant="red" icon="shield-alert">
            {error}
          </Note>
          <button className="btn mt" onClick={() => void load()} type="button">
            <Icon name="refresh-cw" />
            Coba lagi
          </button>
        </>
      ) : filtered.length ? (
        <div className="card">
          <table className="mt1">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Terakhir masuk</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName || '-'}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      className="inp"
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(event) => void changeRole(user, event.target.value as AcademyRole)}
                      aria-label={`Role ${user.email}`}
                    >
                      <option value="cs">Admin CS</option>
                      <option value="owner">Owner</option>
                    </select>
                  </td>
                  <td>
                    <span className={user.active ? 'tag gr' : 'tag rd'}>
                      {user.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="xs muted">{formatDate(user.lastSignInAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn sm"
                        onClick={() => void toggleActive(user)}
                        disabled={busyId === user.id}
                        type="button"
                      >
                        <Icon name={user.active ? 'ban' : 'check'} />
                        {user.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      {!user.active && user.id !== currentUser?.id ? (
                        <button
                          className="btn sm"
                          onClick={() => removeUser(user)}
                          disabled={busyId === user.id}
                          type="button"
                          style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                        >
                          <Icon name="trash-2" />
                          Hapus
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <div className="ai-usage-empty">
            <Icon name="users" size={26} />
            <p className="mt1">
              {items.length ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
