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

/** Video Shorts (9:16 vertikal) butuh bingkai portrait, bukan 16:9. */
export function isYoutubeShort(url?: string): boolean {
  return /\/shorts\//i.test(String(url ?? ''));
}

interface MaterialVideoProps {
  videoUrl?: string;
  title: string;
  /** Halaman materi: video langsung diputar tanpa klik tambahan. */
  autoPlay?: boolean;
  /** Video vertikal (Shorts): bingkai 9:16 + thumbnail crop portrait. */
  vertical?: boolean;
}

export function MaterialVideo({ videoUrl, title, autoPlay = false, vertical = false }: MaterialVideoProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const id = youtubeVideoId(videoUrl);
  if (!id) return null;

  // Shorts: `oar2.jpg` sudah 9:16; `hqdefault.jpg` (4:3, berbingkai hitam) hanya untuk video biasa.
  const thumb = vertical ? `https://i.ytimg.com/vi/${id}/oar2.jpg` : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const frameClass = `video-frame mt${vertical ? ' is-vert' : ''}`;

  if (playing) {
    return (
      <div className={frameClass}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={vertical ? `Shorts: ${title}` : `Video: ${title}`}
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
