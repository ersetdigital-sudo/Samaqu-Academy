-- Product Knowledge — video seri di-host sendiri di Supabase Storage.
--
-- Bucket `series-videos`: public read (pemutar <video> mengambil file langsung dari URL publik),
-- tulis hanya owner/admin lewat `public.is_owner()`. Batas 50 MB dan hanya MP4, sama dengan
-- validasi form Tambah/Edit Seri. URL publiknya disimpan di `public.content_items.video_url`.
--
-- Atomic + idempotent.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'series-videos',
  'series-videos',
  true,
  52428800,
  array['video/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Baca publik: video diputar tanpa sesi login.
drop policy if exists series_videos_read on storage.objects;
create policy series_videos_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'series-videos');

-- Upload/ubah/hapus hanya owner (admin). Role CS ditolak RLS, bukan cuma disembunyikan di UI.
drop policy if exists series_videos_insert on storage.objects;
create policy series_videos_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'series-videos' and public.is_owner());

drop policy if exists series_videos_update on storage.objects;
create policy series_videos_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'series-videos' and public.is_owner())
  with check (bucket_id = 'series-videos' and public.is_owner());

drop policy if exists series_videos_delete on storage.objects;
create policy series_videos_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'series-videos' and public.is_owner());

commit;
