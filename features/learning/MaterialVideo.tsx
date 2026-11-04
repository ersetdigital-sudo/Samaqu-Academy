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

  if (playing) {
    return (
      <div className="video-frame mt">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`Video materi: ${title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="video-frame mt"
      onClick={() => setPlaying(true)}
      aria-label={`Putar video materi: ${title}`}
    >
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
      <span className="video-play">
        <Icon name="play" size={22} />
      </span>
    </button>
  );
}
