'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MaterialVideo, youtubeVideoId } from '@/features/learning/MaterialVideo';

interface SeriesVideoProps {
  videoUrl?: string;
  title: string;
}

/**
 * Pemutar video seri. Video yang di-host sendiri diputar dengan <video> native supaya tidak ada
 * overlay YouTube yang menutupi teks; data lama yang masih link YouTube tetap memakai embed lama.
 */
export function SeriesVideo({ videoUrl, title }: SeriesVideoProps) {
  const url = String(videoUrl ?? '').trim();
  if (!url) return null;
  if (youtubeVideoId(url)) {
    return <MaterialVideo videoUrl={url} title={title} zoomable />;
  }
  return <NativeSeriesVideo src={url} title={title} />;
}

function NativeSeriesVideo({ src, title }: { src: string; title: string }) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    // Capture fase: Escape hanya menutup pemutar besar, bukan modal/halaman di belakangnya.
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setZoom(false);
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [zoom]);

  // Pemutar besar memakai overlay layar penuh (bukan Fullscreen API) supaya tetap jalan di dalam
  // iframe preview yang memblokir permintaan fullscreen. Elemen <video> tidak dilepas, jadi posisi
  // putar ikut terbawa dan tidak ada dua video berjalan bersamaan.
  return (
    <div className={`series-video${zoom ? ' is-zoomed' : ''}`}>
      <video src={src} controls playsInline preload="metadata" aria-label={`Video: ${title}`} />
      {zoom ? (
        <button type="button" className="lightbox-x" onClick={() => setZoom(false)} aria-label="Tutup">
          <Icon name="x" />
        </button>
      ) : (
        <button type="button" className="video-zoom" onClick={() => setZoom(true)}>
          <Icon name="scan-search" size={13} />
          Perbesar
        </button>
      )}
    </div>
  );
}
