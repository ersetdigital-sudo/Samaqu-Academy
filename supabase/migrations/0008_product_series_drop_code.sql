-- Product Knowledge — hapus kode seri dari data seri.
--
-- Tidak ada tabel `series` dan tidak ada kolom `code` di database: seri produk disimpan
-- sebagai baris `content_items` dengan `type = 'product'` dan seluruh field-nya di dalam
-- JSONB `data` (lihat AGENTS.md → Data flow). Jadi tidak ada kolom, foreign key, unique
-- index, atau relasi yang perlu di-drop. Yang dibersihkan hanya key `code`
-- (SR-JHK, SR-IMR, SR-BYT, SR-NHW, SR-KRM, SR-IML) pada baris Product Series.
--
-- Kode bahan (B-01) dan kode produk (TH-001) sengaja dibiarkan: keduanya dipakai sebagai
-- referensi silang (produk.fabric -> bahan.code), bukan kode seri.
--
-- Atomic + idempotent (dijalankan ulang tidak mengubah apa pun).

begin;

update public.content_items
  set data = data - 'code',
      updated_at = now()
  where type = 'product'
    and data->>'category' = 'Product Series'
    and data ? 'code';

commit;
