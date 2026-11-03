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
import { MemoryCard } from './MemoryCard';
import { MemoryForm } from './MemoryForm';
import { MEMORY_FILTERS, MEMORY_STATUS_LABELS } from './memory-labels';
import {
  deleteMemory,
  fetchMemoryItems,
  type MemoryItem,
  type MemoryStatus,
} from './memory-repository';

export function MemoryView() {
  const { canManage, hydrated } = useRole();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { openModal, closeModal } = useModal();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemoryStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchMemoryItems());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Gagal memuat memory organisasi.',
      );
    } finally {
      setLoading(false);
    }
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
    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!term) return true;
      return [item.title, item.category, item.content, item.source]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [filter, items, search]);

  const openForm = (item?: MemoryItem) => {
    if (!user) return;
    openModal(
      <MemoryForm
        item={item}
        userId={user.id}
        onCancel={closeModal}
        onSaved={async () => {
          closeModal();
          await load();
          showToast(item ? 'Memory berhasil diperbarui' : 'Memory berhasil ditambahkan');
        }}
      />,
      { large: true },
    );
  };

  const remove = (item: MemoryItem) => {
    openModal(
      <ConfirmDialog
        title="Hapus memory ini?"
        message={`"${item.title}" akan dihapus permanen dari organizational memory.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteMemory(item.id);
          closeModal();
          setItems((previous) => previous.filter((entry) => entry.id !== item.id));
          showToast('Memory berhasil dihapus');
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
          Memory organisasi hanya dapat dikelola oleh Owner / Super Admin.
        </p>
        <Link className="btn mt2" href="/settings/ai">
          <Icon name="arrow-left" />
          Kembali ke Pengaturan AI
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Memory Organisasi"
        subtitle="Ingatan kolektif Samaqu yang sudah melalui review dan persetujuan. Hanya status Published yang dipakai AI."
        actions={
          <>
            <Link className="btn" href="/settings/ai">
              <Icon name="settings" />
              Pengaturan AI
            </Link>
            <button className="btn p" onClick={() => openForm()}>
              <Icon name="plus" />
              Tambah Memory
            </button>
          </>
        }
      />

      <Note variant="neutral" icon="brain">
        Alur pembentukan: percakapan nyata → anonimisasi → analisis → review supervisor → persetujuan
        → Published. Percakapan customer tidak otomatis menjadi kebijakan resmi.
      </Note>

      <div className="toolbar mt">
        <div className="search">
          <Icon name="search" />
          <input
            className="inp"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari judul, kategori, isi, atau sumber…"
            aria-label="Cari memory organisasi"
          />
        </div>
        <div className="seg" aria-label="Filter status memory">
          {MEMORY_FILTERS.map((value) => (
            <button
              key={value}
              className={filter === value ? 'on' : ''}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'Semua' : MEMORY_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="app-loading">
          <div>
            <div className="spinner" />
            Memuat memory…
          </div>
        </div>
      ) : error ? (
        <>
          <Note variant="red" icon="shield-alert">
            {error}
          </Note>
          <button className="btn mt" onClick={() => void load()}>
            <Icon name="refresh-cw" />
            Coba lagi
          </button>
        </>
      ) : filtered.length ? (
        <div className="card">
          <div className="row sp">
            <b className="sm">{filtered.length} memory</b>
            <span className="xs muted">
              {items.filter((item) => item.status === 'published').length} published
            </span>
          </div>
          {filtered.map((item) => (
            <MemoryCard key={item.id} item={item} onEdit={openForm} onDelete={remove} />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="ai-usage-empty">
            <Icon name="brain" size={26} />
            <p className="mt1">
              {items.length
                ? 'Tidak ada memory yang cocok dengan pencarian.'
                : 'Belum ada organizational memory. Tambahkan hasil pembelajaran yang sudah diverifikasi.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
