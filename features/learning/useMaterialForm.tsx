'use client';

import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { RecordForm } from '@/components/ui/RecordForm';
import { MATERIAL_FIELDS } from '@/lib/form-schemas';
import type { Material } from '@/lib/types';
import { newId } from '@/lib/utils/id';

export function useMaterialForm() {
  const { openModal, closeModal } = useModal();
  const { snapshot, upsertContent } = useData();
  const { showToast } = useToast();

  const openMaterialForm = (material?: Material, defaults?: Partial<Material>) => {
    const nextSortOrder =
      snapshot.content.materials.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 0) + 1;
    openModal(
      <RecordForm
        key={material?.id ?? 'new-material'}
        title={material ? 'Edit Materi' : 'Tambah Materi'}
        subtitle={
          material ? 'Perbarui informasi lalu simpan.' : 'Kolom bertanda * wajib diisi.'
        }
        fields={MATERIAL_FIELDS}
        initial={material ?? defaults ?? {}}
        defaults={{
          category: 'Introduction to Samaqu',
          durationMinutes: 10,
          sortOrder: nextSortOrder,
        }}
        submitLabel={material ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: Material = {
            id: material?.id ?? newId('mat'),
            title: String(values.title),
            category: String(values.category),
            durationMinutes: Number(values.durationMinutes),
            description: String(values.description),
            objectives: Array.isArray(values.objectives) ? values.objectives : [],
            body: String(values.body),
            contributor: String(values.contributor ?? '').trim(),
            videoUrl: String(values.videoUrl ?? '').trim(),
            videoDuration: String(values.videoDuration ?? '').trim(),
            sortOrder: Number(values.sortOrder) || nextSortOrder,
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('materials', item);
          closeModal();
          showToast(material ? 'Perubahan berhasil disimpan' : 'Materi berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  return { openMaterialForm };
}
