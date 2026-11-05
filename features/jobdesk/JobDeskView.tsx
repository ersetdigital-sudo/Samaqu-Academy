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
import { JOB_DESK_FIELDS } from '@/lib/form-schemas';
import type { JobDeskRole } from '@/lib/types';
import { newId } from '@/lib/utils/id';

export function JobDeskView() {
  const { snapshot, upsertContent, deleteContent } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();

  const roles = snapshot.content.jobdesk;

  const openForm = (current?: JobDeskRole) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-jobdesk'}
        title={current ? 'Edit Job Desk' : 'Tambah Job Desk'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={JOB_DESK_FIELDS}
        initial={current ?? {}}
        defaults={{ responsibilities: [''], tasks: [''] }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: JobDeskRole = {
            id: current?.id ?? newId('jbd'),
            role: String(values.role),
            summary: String(values.summary),
            responsibilities: Array.isArray(values.responsibilities) ? values.responsibilities : [],
            tasks: Array.isArray(values.tasks) ? values.tasks : [],
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('jobdesk', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Job desk berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDelete = (item: JobDeskRole) => {
    openModal(
      <ConfirmDialog
        title="Hapus job desk ini?"
        message={`"${item.role}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('jobdesk', item.id);
          closeModal();
          showToast('Job desk berhasil dihapus');
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Job Desk"
        subtitle="Tanggung jawab dan checklist tugas harian setiap jabatan di tim Samaqu."
        actions={
          canManage ? (
            <button className="btn p" onClick={() => openForm()}>
              <Icon name="plus" />
              Tambah Job Desk
            </button>
          ) : null
        }
      />

      {roles.length ? (
        <div className="grid g2">
          {roles.map((item) => (
            <div className="card" key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="row sp" style={{ gap: 8, alignItems: 'flex-start' }}>
                <div className="kh" style={{ margin: 0 }}>
                  <Icon name="briefcase" />
                  <h3>{item.role}</h3>
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
              <p className="sm muted mt1">{item.summary}</p>

              <div className="kh mt">
                <Icon name="list-checks" />
                <h3>Tanggung Jawab</h3>
              </div>
              <ul className="dots">
                {item.responsibilities.map((entry) => (
                  <li key={entry}>
                    <Icon name="circle-dot" />
                    {entry}
                  </li>
                ))}
              </ul>

              <div className="kh mt">
                <Icon name="clipboard-check" />
                <h3>Checklist Tugas Harian</h3>
              </div>
              <ul className="dots">
                {item.tasks.map((entry) => (
                  <li key={entry}>
                    <Icon name="check-circle-2" style={{ color: 'var(--g)' }} />
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="briefcase"
          title="Belum ada job desk"
          subtitle="Tambahkan jabatan pertama beserta tanggung jawab dan tugas hariannya."
          action={
            canManage ? (
              <button className="btn sm" onClick={() => openForm()}>
                <Icon name="plus" />
                Tambah Job Desk
              </button>
            ) : null
          }
        />
      )}
    </>
  );
}
