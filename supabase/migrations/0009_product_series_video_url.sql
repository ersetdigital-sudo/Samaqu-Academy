-- Product Knowledge — video YouTube per seri.
--
-- Seri produk tetap baris `content_items` (`type = 'product'`, `data.category = 'Product Series'`),
-- tetapi link video diberi kolom sendiri: `video_url text` nullable. Nullable = seri tanpa video
-- memakai foto close-up di modal detail.
--
-- Isi link (kolom + `data.videoUrl` sekaligus, supaya SQL dan form menunjuk nilai yang sama):
--
--   update public.content_items
--      set video_url = 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
--          data = data || jsonb_build_object('videoUrl', 'https://www.youtube.com/watch?v=XXXXXXXXXXX'),
--          updated_at = now()
--    where type = 'product'
--      and data->>'category' = 'Product Series'
--      and data->>'name' = 'Jiharkah';   -- Imron, Bayati, Nahawand, Karim, Imalah
--
-- Atomic + idempotent.

begin;

alter table public.content_items
  add column if not exists video_url text;

comment on column public.content_items.video_url is
  'Link video YouTube untuk baris Product Series. Nullable; kosong = modal memakai foto close-up.';

commit;
