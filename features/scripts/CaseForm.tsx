'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { RecordForm, type RecordValues } from '@/components/ui/RecordForm';
import { CASE_FIELDS } from '@/lib/form-schemas';
import type { CaseStudy } from '@/lib/types';
import { anonymize, piiScan, piiTotal } from '@/lib/utils/anonymize';
import { newId } from '@/lib/utils/id';

interface CaseFormProps {
  current?: CaseStudy;
  defaults?: Partial<CaseStudy>;
  onSubmit: (item: CaseStudy) => Promise<void>;
  onCancel: () => void;
}

export function CaseForm({ current, defaults, onSubmit, onCancel }: CaseFormProps) {
  const [anonymizeOn, setAnonymizeOn] = useState(current ? current.anonymized : true);
  const [names, setNames] = useState('');
  const [privacyOk, setPrivacyOk] = useState(false);
  const [preview, setPreview] = useState(false);
  const nameList = names
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const handleSubmit = async (values: RecordValues) => {
    if (!privacyOk) {
      throw new Error('Centang konfirmasi pemeriksaan anonimisasi terlebih dahulu');
    }
    const clean = (key: string) => String(values[key] ?? '');
    const finalValue = (key: string) => {
      const value = clean(key);
      return anonymizeOn ? anonymize(value, nameList) : value;
    };
    const item: CaseStudy = {
      id: current?.id ?? newId('case'),
      title: finalValue('title'),
      category: String(values.category),
      mark: values.mark as CaseStudy['mark'],
      situation: finalValue('situation'),
      customerMessage: finalValue('customerMessage'),
      adminPrevious: finalValue('adminPrevious'),
      finding: finalValue('finding'),
      cause: finalValue('cause'),
      recommendation: finalValue('recommendation'),
      lesson: finalValue('lesson'),
      anonymized: anonymizeOn,
      sample: false,
      updatedAt: Date.now(),
    };
    await onSubmit(item);
  };

  return (
    <RecordForm
      key={current?.id ?? 'new-case'}
      title={current ? 'Edit Studi Kasus' : 'Tambah Studi Kasus'}
      subtitle="Kolom bertanda * wajib diisi."
      fields={CASE_FIELDS}
      initial={current ?? defaults ?? {}}
      defaults={{ category: 'Greeting & Opening', mark: 'Materi Pembelajaran' }}
      submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      renderExtra={(values) => (
        <div className="card mt" style={{ background: 'var(--gl2)', boxShadow: 'none' }}>
          <label className="row sm" style={{ gap: 8, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={anonymizeOn}
              onChange={(event) => setAnonymizeOn(event.target.checked)}
            />
            <span className="row" style={{ gap: 6 }}>
              <Icon name="shield-check" size={16} />
              Samarkan identitas customer
            </span>
          </label>
          <p className="sm muted mt1">
            Nomor HP, email, rekening, ID transaksi, dan alamat otomatis disamarkan saat disimpan.
            Tulis nama customer di bawah agar ikut diganti menjadi [Customer]. Nama ini tidak
            disimpan.
          </p>
          <input
            className="inp mt1"
            value={names}
            onChange={(event) => setNames(event.target.value)}
            placeholder="Nama customer (pisahkan dengan koma jika lebih dari satu)"
          />
          <div className="row mt1 wrap">
            <button className="btn sm" type="button" onClick={() => setPreview(true)}>
              Cek Anonimisasi
            </button>
          </div>

          {preview ? <PrivacyPreview values={values} names={nameList} anonymizeOn={anonymizeOn} /> : null}

          <label className="row sm mt1" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={privacyOk}
              onChange={(event) => setPrivacyOk(event.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              Saya sudah memeriksa hasil anonimisasi dan tidak ada data pribadi customer yang
              tersisa. <span style={{ color: 'var(--red)' }}>*</span>
            </span>
          </label>
        </div>
      )}
    />
  );
}

function PrivacyPreview({
  values,
  names,
  anonymizeOn,
}: {
  values: RecordValues;
  names: string[];
  anonymizeOn: boolean;
}) {
  const keys: { key: string; label: string }[] = [
    { key: 'situation', label: 'Situasi' },
    { key: 'customerMessage', label: 'Pesan customer' },
    { key: 'adminPrevious', label: 'Respons admin' },
    { key: 'recommendation', label: 'Rekomendasi' },
  ];
  const raw = keys.map((entry) => String(values[entry.key] ?? '')).join('\n');
  const found = piiScan(raw, names);
  const total = piiTotal(found);
  const summary = [
    found.hp ? `HP: ${found.hp}` : '',
    found.email ? `Email: ${found.email}` : '',
    found.rekening ? `Rekening: ${found.rekening}` : '',
    found.transaksi ? `ID transaksi: ${found.transaksi}` : '',
    found.alamat ? `Alamat: ${found.alamat}` : '',
    found.nama ? `Nama: ${found.nama}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const variant = total && !anonymizeOn ? 'rd' : total ? 'gn' : 'nt';

  return (
    <div className={`note ${variant} mt1`} style={{ display: 'block' }}>
      <b>{total ? `${total} data pribadi terdeteksi` : 'Tidak ada pola data pribadi terdeteksi'}</b>
      {summary ? ` (${summary})` : ''}
      {total && !anonymizeOn ? ' — aktifkan "Samarkan identitas customer".' : ''}
      {total && anonymizeOn ? ' — akan disamarkan saat disimpan.' : ''}
      <div style={{ marginTop: 6, borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 4 }}>
        {keys.map((entry) => {
          const value = String(values[entry.key] ?? '');
          if (!value) return null;
          return (
            <div key={entry.key}>
              <div className="xs muted" style={{ marginTop: 8 }}>
                {entry.label}
              </div>
              <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {anonymizeOn ? anonymize(value, names) : value}
              </div>
            </div>
          );
        })}
      </div>
      <div className="xs muted" style={{ marginTop: 6 }}>
        Deteksi berbasis pola dan bisa terlewat. Tetap periksa manual sebelum menyimpan.
      </div>
    </div>
  );
}
