'use client';

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { MEMORY_CATEGORY_OPTIONS } from './memory-labels';
import { createMemory, updateMemory, type MemoryItem, type MemoryStatus } from './memory-repository';

export function MemoryForm({
  item,
  userId,
  onCancel,
  onSaved,
}: {
  item?: MemoryItem;
  userId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(item?.title ?? '');
  const [category, setCategory] = useState(item?.category ?? 'Operasional');
  const [content, setContent] = useState(item?.content ?? '');
  const [source, setSource] = useState(item?.source ?? '');
  const [status, setStatus] = useState<MemoryStatus>(item?.status ?? 'draft');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      showToast('Judul dan isi memory wajib diisi', 'err');
      return;
    }
    setSaving(true);
    try {
      const input = { title, category, content, source, status };
      if (item) {
        await updateMemory(item.id, item.version, input, userId);
      } else {
        await createMemory(input, userId);
      }
      await onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan memory';
      showToast(message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="row sp">
        <h2>{item ? 'Edit Memory' : 'Tambah Memory'}</h2>
        <button className="icb" onClick={onCancel} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>
      <p className="sm muted mt1">
        Simpan hanya informasi yang sudah diverifikasi. Draft tidak akan dipakai AI sebagai sumber
        resmi.
      </p>

      <div className="ai-form-grid mt">
        <div className="full">
          <label className="flab" htmlFor="mem-title">
            Judul
          </label>
          <input
            id="mem-title"
            className="inp"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="mis. Penanganan keterlambatan pengiriman ekspedisi"
          />
        </div>
        <div>
          <label className="flab" htmlFor="mem-category">
            Kategori
          </label>
          <input
            id="mem-category"
            className="inp"
            list="mem-category-options"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <datalist id="mem-category-options">
            {MEMORY_CATEGORY_OPTIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="flab" htmlFor="mem-status">
            Status
          </label>
          <select
            id="mem-status"
            className="inp"
            value={status}
            onChange={(event) => setStatus(event.target.value as MemoryStatus)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="full">
          <label className="flab" htmlFor="mem-source">
            Sumber
          </label>
          <input
            id="mem-source"
            className="inp"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="mis. Review kasus WhatsApp #A-102 (anonim)"
          />
        </div>
        <div className="full">
          <label className="flab" htmlFor="mem-content">
            Isi memory
          </label>
          <textarea
            id="mem-content"
            className="inp"
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Tulis pembelajaran, praktik terbaik, atau SOP yang sudah diverifikasi…"
          />
        </div>
      </div>

      <div className="mfoot">
        <button className="btn" onClick={onCancel} disabled={saving}>
          Batal
        </button>
        <button className="btn p" onClick={() => void save()} disabled={saving}>
          <Icon name="save" />
          {saving ? 'Menyimpan…' : item ? 'Simpan Perubahan' : 'Tambahkan'}
        </button>
      </div>
    </>
  );
}
