'use client';

import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import type { Script } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';

interface ScriptDetailProps {
  script: Script;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ScriptDetail({ script, canManage, onClose, onEdit, onDelete }: ScriptDetailProps) {
  const { showToast } = useToast();

  const copy = async (text: string, message = 'Berhasil disalin ke clipboard') => {
    const ok = await copyToClipboard(text);
    showToast(ok ? message : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  return (
    <>
      <div className="row sp">
        <div className="row" style={{ gap: 6 }}>
          <span className="tag gr">{script.category}</span>
        </div>
        <button className="icb" onClick={onClose} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>
      <h2 className="mt">{script.title}</h2>
      {script.situation ? (
        <>
          <h3 className="mt">Situasi Penggunaan</h3>
          <p className="sm muted">{script.situation}</p>
        </>
      ) : null}
      <h3 className="mt">Contoh Respons</h3>
      <div className="after mt1" style={{ whiteSpace: 'pre-wrap' }}>
        {script.response}
      </div>
      <div className="row mt wrap">
        <button className="btn p" onClick={() => copy(script.response, 'Respons berhasil disalin')}>
          <Icon name="copy" />
          Copy Respons
        </button>
        {canManage ? (
          <>
            <button className="btn" onClick={onEdit}>
              <Icon name="pencil" />
              Edit
            </button>
            <button className="btn danger" onClick={onDelete}>
              <Icon name="trash-2" />
              Hapus
            </button>
          </>
        ) : null}
      </div>

      {script.variants.length ? (
        <>
          <h3 className="mt2">Variasi Respons</h3>
          {script.variants.map((variant, index) => (
            <div className="row sp li" key={`${index}-${variant}`}>
              <span className="sm">{variant}</span>
              <button
                className="icb"
                title="Copy"
                onClick={() => copy(variant, 'Variasi berhasil disalin')}
              >
                <Icon name="copy" />
              </button>
            </div>
          ))}
        </>
      ) : null}

      {script.notes ? (
        <>
          <h3 className="mt">Catatan Penggunaan</h3>
          <ul className="sm muted notes-list">
            {script.notes
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
          </ul>
        </>
      ) : null}

      {script.tags.length ? (
        <div className="chips mt">
          {script.tags.map((tag) => (
            <span className="tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <Note className="mt">
        Sesuaikan dengan konteks percakapan. Bagian dalam [kurung] wajib diganti dengan data resmi.
      </Note>
    </>
  );
}
