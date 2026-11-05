'use client';

import type { ReactNode } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { ImageZoom } from '@/components/ui/ImageZoom';
import { PipeTable } from '@/components/ui/PipeTable';
import { ProductStatusTag } from '@/components/ui/badges';
import { MaterialVideo, youtubeVideoId } from '@/features/learning/MaterialVideo';
import { getProductFields, normalizeSeriesTerm } from '@/lib/product-schema';
import type { Product } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { formatDateTime, rupiah } from '@/lib/utils/format';

interface ProductDetailProps {
  product: Product;
  imageUrl?: string;
  products: Product[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenProduct: (id: string) => void;
}

export function ProductDetail({
  product,
  imageUrl,
  products,
  canManage,
  onClose,
  onEdit,
  onDelete,
  onOpenProduct,
}: ProductDetailProps) {
  const { showToast } = useToast();

  const renderValue = (key: keyof Product): ReactNode => {
    const raw = product[key];
    if (key === 'price') return rupiah(raw as string) || null;
    if (key === 'gsm') return raw ? `${String(raw)} GSM` : null;
    // Rows saved with the pre-official wording still show the official term.
    if (key === 'collar' || key === 'placket') {
      const term = normalizeSeriesTerm(String(raw ?? ''));
      return term ? <span>{term}</span> : null;
    }
    if (key === 'fabric') {
      const code = String(raw ?? '');
      if (!code) return null;
      const fabric = products.find(
        (entry) => entry.category === 'Fabric Collection' && entry.code === code,
      );
      if (!fabric) return code;
      return (
        <button className="answer-link" onClick={() => onOpenProduct(fabric.id)}>
          {fabric.name} ({code})
        </button>
      );
    }
    if (key === 'memberIds') {
      const members = (Array.isArray(raw) ? raw : [])
        .map((id) => products.find((entry) => entry.id === id))
        .filter(Boolean) as Product[];
      if (!members.length) return null;
      return (
        <div className="chips">
          {members.map((member) => (
            <button
              key={member.id}
              className="tag"
              onClick={() => onOpenProduct(member.id)}
            >
              {member.name}
            </button>
          ))}
        </div>
      );
    }
    if (key === 'table') {
      return raw ? <PipeTable value={String(raw)} /> : null;
    }
    if (key === 'characteristics' && product.category === 'Product Series') {
      // Kerah/placket/kelompok now have their own fields; drop the duplicated lines.
      const lines = String(raw ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^(Kerah|Placket\/Klep|Kelompok)\s*:/i.test(line));
      if (!lines.length) return null;
      return <span style={{ whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</span>;
    }
    if (key === 'advantages') {
      const lines = String(raw ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return null;
      return (
        <ul style={{ paddingLeft: 18 }}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      );
    }
    const value = String(raw ?? '');
    if (!value) return null;
    return <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>;
  };

  const copyInfo = async () => {
    const lines = getProductFields(product.category).map((field) => {
      if (field.key === 'memberIds') {
        const names = product.memberIds
          .map((id) => products.find((entry) => entry.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        return names ? `${field.label}: ${names}` : '';
      }
      const raw = product[field.key];
      const value =
        field.key === 'price'
          ? rupiah(raw as string)
          : field.key === 'collar' || field.key === 'placket'
            ? normalizeSeriesTerm(String(raw ?? ''))
            : String(raw ?? '');
      return value ? `${field.label}: ${value}` : '';
    });
    const ok = await copyToClipboard(lines.filter(Boolean).join('\n'));
    showToast(ok ? 'Info produk berhasil disalin' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  const isSeries = product.category === 'Product Series';
  const fields = getProductFields(product.category).filter((field) => {
    if (['name', 'description', 'videoUrl'].includes(String(field.key))) return false;
    // Baris "Produk dalam Seri Ini" tidak ditampilkan kalau seri belum punya anggota.
    if (field.key === 'memberIds' && !(Array.isArray(product.memberIds) && product.memberIds.length)) {
      return false;
    }
    return true;
  });
  // Size chart dan lembar bahan tampil berdampingan dengan tabel agar gambarnya besar dan bisa di-zoom.
  const hasMediaPanel =
    product.category === 'Size Chart' || product.category === 'Fabric Collection';

  // Seri: video YouTube 16:9 seperti Learning Center (thumbnail + tombol play).
  // Tanpa video -> foto close-up.
  const seriesHeader = !isSeries ? null : youtubeVideoId(product.videoUrl) ? (
    <MaterialVideo videoUrl={product.videoUrl} title={product.name} />
  ) : imageUrl ? (
    <div className="series-hero mt">
      <img src={imageUrl} alt="" />
    </div>
  ) : null;

  const imageBlock = imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      style={{
        width: '100%',
        maxHeight: 340,
        objectFit: 'contain',
        background: 'var(--gl2)',
        borderRadius: 10,
        marginTop: 14,
      }}
    />
  ) : null;

  const fieldsTable = (
    <table>
      <tbody>
        {fields.map((field) => {
          const value = renderValue(field.key);
          return (
            <tr key={String(field.key)}>
              <th style={{ width: '38%', verticalAlign: 'top' }}>{field.label}</th>
              <td>{value ?? <span className="muted">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="row sp">
        <div className="row">
          <span className="tag">{product.category}</span>
          <ProductStatusTag status={product.status} />
        </div>
        <button className="icb" onClick={onClose} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>

      {isSeries ? seriesHeader : hasMediaPanel ? null : imageBlock}

      <h2 className="mt">{product.name}</h2>
      {product.description ? (
        <p className="sm muted mt1" style={{ whiteSpace: 'pre-wrap' }}>
          {product.description}
        </p>
      ) : null}

      {hasMediaPanel && imageUrl ? (
        <div className="pd-split mt">
          <ImageZoom
            src={imageUrl}
            label={product.category === 'Size Chart' ? 'Perbesar size chart' : 'Perbesar foto bahan'}
          />
          <div>{fieldsTable}</div>
        </div>
      ) : (
        <div className="mt">{fieldsTable}</div>
      )}

      <p className="sm muted mt">
        Terakhir diperbarui: {formatDateTime(product.updatedAt ?? Date.now())}
      </p>

      <div className="row mt wrap">
        <button className="btn" onClick={copyInfo}>
          <Icon name="copy" />
          Copy Info
        </button>
        {canManage ? (
          <>
            <button className="btn p" onClick={onEdit}>
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
    </>
  );
}
