'use client';

import { useState, type ReactNode } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from './Icon';

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Hapus',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Gagal menghapus data', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <div
        className="sic"
        style={{
          margin: '0 auto',
          width: 44,
          height: 44,
          background: 'var(--redl)',
          color: 'var(--red)',
        }}
      >
        <Icon name="trash-2" size={19} />
      </div>
      <h2 className="mt">{title}</h2>
      <div className="sm muted mt1">{message}</div>
      <div className="row mt2" style={{ justifyContent: 'center' }}>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Batal
        </button>
        <button
          className="btn p"
          type="button"
          style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
          onClick={handleConfirm}
          disabled={busy}
        >
          <Icon name="trash-2" />
          {busy ? 'Menghapus…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
