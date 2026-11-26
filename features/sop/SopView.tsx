'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecordForm } from '@/components/ui/RecordForm';
import { SOP_FIELDS } from '@/lib/form-schemas';
import type { Sop } from '@/lib/types';
import { newId } from '@/lib/utils/id';
import { SopDetail } from './SopDetail';

/** Teks yang dicari: judul, tujuan, langkah, dan catatan. */
function sopHaystack(item: Sop): string {
  return [item.title, item.purpose, ...item.steps, item.notes].join(' ').toLowerCase();
}

export function SopView() {
  const { snapshot, upsertContent, deleteContent } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  const sops = snapshot.content.sops;
  const openId = searchParams.get('open');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? sops.filter((item) => sopHaystack(item).includes(needle)) : sops;
  }, [sops, query]);

  // SOP terpilih ikut ?open=<id>; kalau kosong/tidak cocok jatuh ke yang pertama di daftar.
  const selected = filtered.find((item) => item.id === openId) ?? filtered[0] ?? null;

  const selectSop = (item: Sop) => {
    router.replace(`/sop?open=${encodeURIComponent(item.id)}`, { scroll: false });
    // Layar sempit menumpuk daftar di atas detail, jadi detailnya digulir ke pandangan.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('sop-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };

  const openForm = (current?: Sop) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-sop'}
        title={current ? 'Edit SOP' : 'Tambah SOP'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={SOP_FIELDS}
        initial={current ?? {}}
        defaults={{ steps: [''] }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: Sop = {
            id: current?.id ?? newId('sop'),
            title: String(values.title),
            purpose: String(values.purpose),
            steps: Array.isArray(values.steps) ? values.steps : [],
            notes: String(values.notes ?? ''),
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('sops', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'SOP berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDelete = (item: Sop) => {
    openModal(
      <ConfirmDialog
        title="Hapus SOP ini?"
        message={`"${item.title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('sops', item.id);
          closeModal();
          showToast('SOP berhasil dihapus');
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="SOP"
        subtitle="Kumpulan Standar Operasional Prosedur tim CS SAMAQU."
        actions={
          canManage ? (
            <button className="btn p" onClick={() => openForm()}>
              <Icon name="plus" />
              Tambah SOP
            </button>
          ) : null
        }
      />

      {sops.length ? (
        <div className="sop-layout">
          <aside className="sop-side">
            <div className="search">
              <Icon name="search" />
              <input
                className="inp"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari SOP…"
                aria-label="Cari SOP"
              />
            </div>
            <div className="sop-count">
              {query.trim() ? `${filtered.length} dari ${sops.length} SOP` : `${sops.length} SOP`}
            </div>
            <div className="sop-list">
              {filtered.length ? (
                filtered.map((item) => {
                  const on = item.id === selected?.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`sop-item${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => selectSop(item)}
                    >
                      <span className="sop-item-ic">
                        <Icon name="shield-check" />
                      </span>
                      <span className="sop-item-tx">
                        <b>{item.title}</b>
                        <span>{item.steps.length} langkah</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="sop-none">Tidak ada SOP yang cocok dengan pencarian.</div>
              )}
            </div>
          </aside>

          {selected ? (
            <SopDetail item={selected} canManage={canManage} onEdit={openForm} onDelete={confirmDelete} />
          ) : (
            <div className="card sop-detail sop-none">Pilih SOP dari daftar.</div>
          )}
        </div>
      ) : (
        <EmptyState
          icon="shield-check"
          title="Belum ada SOP"
          subtitle="Tambahkan prosedur resmi pertama beserta langkah-langkahnya."
          action={
            canManage ? (
              <button className="btn sm" onClick={() => openForm()}>
                <Icon name="plus" />
                Tambah SOP
              </button>
            ) : null
          }
        />
      )}
    </>
  );
}
