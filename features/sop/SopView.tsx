'use client';

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

export function SopView() {
  const { snapshot, upsertContent, deleteContent } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();

  const sops = snapshot.content.sops;

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
        subtitle="Prosedur resmi tim CS: tujuan, langkah pengerjaan, dan catatan pentingnya."
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
        <div className="grid g2">
          {sops.map((item) => (
            <div className="card" key={item.id}>
              <div className="row sp" style={{ gap: 8, alignItems: 'flex-start' }}>
                <div className="kh" style={{ margin: 0 }}>
                  <Icon name="shield-check" />
                  <h3>{item.title}</h3>
                </div>
                {canManage ? (
                  <span className="row" style={{ gap: 4 }}>
                    <button className="icb" onClick={() => openForm(item)} aria-label="Edit">
                      <Icon name="pencil" size={15} />
                    </button>
                    <button className="icb" onClick={() => confirmDelete(item)} aria-label="Hapus">
                      <Icon name="trash-2" size={15} />
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="sm muted mt1">{item.purpose}</p>

              <ol className="steps mt1">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              {item.notes ? (
                <div className="note mt1">
                  <Icon name="alert-triangle" />
                  <div>
                    <b>Catatan penting</b>
                    <div>{item.notes}</div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
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
