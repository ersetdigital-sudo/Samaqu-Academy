'use client';

import { useEffect, useRef, useState } from 'react';
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
  const wrap = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await wrap.current?.requestFullscreen?.();
  };

  return (
    <div className="series-video" ref={wrap}>
      <video src={src} controls playsInline preload="metadata" aria-label={`Video: ${title}`} />
      <button type="button" className="video-zoom" onClick={toggleFullscreen}>
        <Icon name="scan-search" size={13} />
        Perbesar
      </button>
    </div>
  );
}
