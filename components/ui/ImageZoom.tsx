'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';

interface ImageZoomProps {
  src: string;
  alt?: string;
  style?: CSSProperties;
  label?: string;
}

/** Gambar yang bisa diklik untuk dibuka layar penuh, lalu di-zoom 100%. */
export function ImageZoom({ src, alt = '', style, label = 'Perbesar' }: ImageZoomProps) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Capture fase: Escape hanya menutup lightbox, bukan modal produk di belakangnya.
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      setZoomed(false);
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    setZoomed(false);
  };

  return (
    <>
      <button
        type="button"
        className="shot-zoom"
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        <img src={src} alt={alt} style={style} />
        <span className="shot-zoom-hint">
          <Icon name="scan-search" size={13} />
          {label}
        </span>
      </button>

      {open ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button className="lightbox-x" type="button" onClick={close} aria-label="Tutup">
            <Icon name="x" />
          </button>
          <img
            src={src}
            alt={alt}
            className={zoomed ? 'zoomed' : ''}
            onClick={() => setZoomed((value) => !value)}
          />
          <p className="lightbox-tip">
            Klik gambar untuk {zoomed ? 'kembali ke ukuran layar' : 'zoom 100%'}
          </p>
        </div>
      ) : null}
    </>
  );
}
