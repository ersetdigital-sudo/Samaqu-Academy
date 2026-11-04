-- Fase 1 Learning Center — tindak lanjut.
-- 1) Bersihkan progres materi hasil normalisasi 0006 (10% -> 50%).
-- 2) Tegaskan lagi hak tulis konten belajar hanya untuk owner (CS diblokir di RLS).
-- Atomic + idempotent.

begin;

-- 1. Progres palsu ---------------------------------------------------------
-- Migration 0006 menaikkan semua baris material berstatus 'progress' dari 10% ke 50%.
-- Progres hanya boleh lahir dari aktivitas user, jadi baris hasil normalisasi dihapus
-- (status kembali "Belum", 0%). Batas waktu membuat migrasi ini aman dijalankan ulang
-- tanpa menghapus aktivitas asli sesudahnya.

delete from public.progress
  where kind = 'material'
    and status = 'progress'
    and coalesce(progress, 0) <= 50
    and updated_at < timestamptz '2026-11-05 00:00:00+00';

-- 2. Hak tulis konten belajar ---------------------------------------------
-- Owner = role pengelola (tidak ada role leader terpisah di schema ini).
-- Admin CS tidak punya izin tulis ke materi, level, maupun soal kuis.

drop policy if exists content_items_write on public.content_items;
create policy content_items_write
  on public.content_items for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists learning_levels_write on public.learning_levels;
create policy learning_levels_write
  on public.learning_levels for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists quiz_questions_write on public.quiz_questions;
create policy quiz_questions_write
  on public.quiz_questions for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

commit;
