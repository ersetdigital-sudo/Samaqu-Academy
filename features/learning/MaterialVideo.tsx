'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

// youtu.be/ID · watch?v=ID · embed/ID · shorts/ID · live/ID
const YOUTUBE_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/;

export function youtubeVideoId(url?: string): string | null {
  const match = String(url ?? '')
    .trim()
    .match(YOUTUBE_ID);
  return match ? match[1] : null;
}

/** Shorts = video vertikal (9:16), jadi bingkainya tidak boleh 16:9. */
export function youtubeVideoIsShort(url?: string): boolean {
  return /\/shorts\//.test(String(url ?? '').trim());
}

interface MaterialVideoProps {
  videoUrl?: string;
  title: string;
  /** Halaman materi: video langsung diputar tanpa klik tambahan. */
  autoPlay?: boolean;
  /** Tombol "Perbesar video": membuka pemutar setinggi layar. */
  zoomable?: boolean;
}

export function MaterialVideo({ videoUrl, title, autoPlay = false, zoomable = false }: MaterialVideoProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const [zoom, setZoom] = useState(false);
  const id = youtubeVideoId(videoUrl);

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

  if (!id) return null;

  // `hqdefault` untuk Shorts masih berpilar hitam, tapi `object-fit: cover` di bingkai
  // 9:16 memotong pilarnya; `oar2` tidak tersedia untuk semua video.
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const frameClass = youtubeVideoIsShort(videoUrl) ? 'video-frame is-vert mt' : 'video-frame mt';
  const playerSrc = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
  // Saat pemutar besar terbuka, video di halaman dilepas dari DOM supaya tidak ada dua video berjalan.
  const showInlinePlayer = playing && !zoom;

  const frame = (
    <div className={frameClass}>
      {showInlinePlayer ? (
        <iframe
          src={playerSrc}
          title={`Video: ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="video-poster"
          onClick={() => setPlaying(true)}
          aria-label={`Putar video: ${title}`}
        >
          <img src={thumb} alt="" loading="lazy" />
          <span className="video-play">
            <Icon name="play" size={22} />
          </span>
        </button>
      )}
      {zoomable ? (
        <button type="button" className="video-zoom" onClick={() => setZoom(true)}>
          <Icon name="scan-search" size={13} />
          Perbesar
        </button>
      ) : null}
    </div>
  );

  if (!zoomable) return frame;

  return (
    <>
      {frame}
      {zoom ? (
        <div
          className="lightbox video-lightbox"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoom(false);
          }}
        >
          <button className="lightbox-x" type="button" onClick={() => setZoom(false)} aria-label="Tutup">
            <Icon name="x" />
          </button>
          <div className={frameClass}>
            <iframe
              src={playerSrc}
              title={`Video: ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
