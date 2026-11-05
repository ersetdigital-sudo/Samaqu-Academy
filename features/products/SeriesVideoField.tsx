'use client';

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { uploadSeriesVideo } from '@/lib/storage/series-videos';

interface SeriesVideoFieldProps {
  value: string;
  onChange: (url: string) => void;
}

/** Upload video seri ke Supabase Storage; URL publiknya yang disimpan di form. */
export function SeriesVideoField({ value, onChange }: SeriesVideoFieldProps) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset supaya file yang sama bisa dipilih ulang setelah gagal.
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadSeriesVideo(file));
      showToast('Video berhasil diunggah');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Gagal mengunggah video', 'err');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input className="inp" type="file" accept="video/mp4" onChange={pick} disabled={uploading} />
      <div className="sm muted" style={{ marginTop: 3 }}>
        File MP4, maksimal 50 MB. Video tampil vertikal (9:16) dengan tombol perbesar.
      </div>
      {uploading ? (
        <div className="sm muted" style={{ marginTop: 6 }}>
          Mengunggah video…
        </div>
      ) : null}
      {value && !uploading ? (
        <div className="row mt" style={{ gap: 8, alignItems: 'center' }}>
          <span
            className="sm muted"
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {value}
          </span>
          <button type="button" className="btn sm ghost" onClick={() => onChange('')}>
            <Icon name="trash-2" size={14} />
            Hapus video
          </button>
        </div>
      ) : null}
    </div>
  );
}
