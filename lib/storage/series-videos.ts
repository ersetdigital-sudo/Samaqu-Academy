import { getSupabaseClient } from '@/lib/supabase/client';

/** Bucket video seri: public read, tulis hanya owner (RLS `series_videos_*`). */
export const SERIES_VIDEO_BUCKET = 'series-videos';
export const SERIES_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const PUBLIC_PREFIX = `/storage/v1/object/public/${SERIES_VIDEO_BUCKET}/`;

/** True kalau URL menunjuk file di bucket kita (link YouTube lama tidak dihitung). */
export function isStoredSeriesVideo(url?: string): boolean {
  return String(url ?? '').includes(PUBLIC_PREFIX);
}

function storagePath(url: string): string | null {
  const index = url.indexOf(PUBLIC_PREFIX);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + PUBLIC_PREFIX.length).split('?')[0]);
}

/** Upload MP4 lalu kembalikan URL publik yang disimpan di kolom `video_url`. */
export async function uploadSeriesVideo(file: File): Promise<string> {
  if (file.size > SERIES_VIDEO_MAX_BYTES) throw new Error('Ukuran video maksimal 50 MB');
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi');

  const path = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}.mp4`;
  const bucket = supabase.storage.from(SERIES_VIDEO_BUCKET);
  const { error } = await bucket.upload(path, file, {
    contentType: file.type || 'video/mp4',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Hapus file video lama dari storage; link YouTube/luar diabaikan. */
export async function deleteSeriesVideo(url?: string): Promise<void> {
  const path = url ? storagePath(url) : null;
  const supabase = getSupabaseClient();
  if (!path || !supabase) return;
  await supabase.storage.from(SERIES_VIDEO_BUCKET).remove([path]);
}
