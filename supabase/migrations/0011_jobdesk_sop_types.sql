-- Job Desk & SOP — dua tipe konten baru di `content_items`.
--
-- Kedua halaman menyimpan datanya sebagai baris `content_items` (JSONB `data`), sama seperti
-- konten lain, jadi tidak ada tabel baru. Yang perlu diubah hanya check constraint
-- `content_items_type_check` (0001) yang masih membatasi 10 tipe lama:
--
--   new row for relation "content_items" violates check constraint "content_items_type_check"
--
-- Constraint dibuat ulang dengan daftar yang sama + 'jobdesk' dan 'sop'. Atomic + idempotent:
-- tidak ada baris yang diubah atau dihapus, aman dijalankan ulang.

begin;

alter table public.content_items
  drop constraint if exists content_items_type_check;

alter table public.content_items
  add constraint content_items_type_check check (type in (
    'material','script','case','before_after','flow','guide','problem','scenario','quiz','product',
    'jobdesk','sop'
  ));

commit;
