'use client';

import { useState } from 'react';
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
}

export function MaterialVideo({ videoUrl, title, autoPlay = false }: MaterialVideoProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const id = youtubeVideoId(videoUrl);
  if (!id) return null;

  // `hqdefault` untuk Shorts masih berpilar hitam, tapi `object-fit: cover` di bingkai
  // 9:16 memotong pilarnya; `oar2` tidak tersedia untuk semua video.
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const frameClass = youtubeVideoIsShort(videoUrl) ? 'video-frame is-vert mt' : 'video-frame mt';

  if (playing) {
    return (
      <div className={frameClass}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={`Video: ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={frameClass}
      onClick={() => setPlaying(true)}
      aria-label={`Putar video: ${title}`}
    >
      <img src={thumb} alt="" loading="lazy" />
      <span className="video-play">
        <Icon name="play" size={22} />
      </span>
    </button>
  );
}
