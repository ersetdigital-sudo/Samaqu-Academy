-- Pelabelan chat customer per tahap — konten SOP + Job Desk.
--
-- Latar: owner menetapkan aturan baru, setiap chat customer wajib punya label tahap
-- (Leads Baru → Proses → Closing → Dikirim → Selesai) supaya posisi semua customer terlihat
-- dari daftar chat. Aturan & kriteria tiap label tampil di menu baru `/labels`; migration ini
-- menaruh prosedurnya di halaman SOP dan menjadikannya kewajiban harian di Job Desk.
--
-- Tidak ada DDL: tipe `sop` dan `jobdesk` sudah diizinkan constraint dari 0011, dan datanya
-- JSONB. Atomic + idempotent:
--   * baris SOP memakai `on conflict (id) do nothing` (editan owner tidak tertimpa),
--   * tugas Job Desk hanya ditambahkan kalau teksnya belum ada.

begin;

insert into public.content_items (id, type, sort_order, data)
values (
  'sop_label_chat_tahapan',
  'sop',
  0,
  jsonb_build_object(
    'title', 'Pelabelan Chat Customer per Tahap',
    'purpose',
      'Memastikan setiap chat customer diberi label tahap yang benar, supaya posisi tiap customer '
      'terlihat dari daftar chat tanpa harus membuka chat satu per satu.',
    'steps', jsonb_build_array(
      'Saat chat pertama masuk, pasang label "Leads Baru" sebelum menutup chat.',
      'Lengkapi data customer (nama, ukuran, alamat, nomor WhatsApp), lalu kirim form atau invoice. Begitu form/invoice terkirim, ganti label jadi "Proses".',
      'Saat bukti transfer masuk, pastikan nominalnya sesuai dan transaksi sudah diinput di ops, lalu ganti label jadi "Closing".',
      'Saat resi sudah diinfokan ke customer, ganti label jadi "Dikirim" dan pantau posisi paketnya.',
      'Saat customer konfirmasi paket diterima, ganti label jadi "Selesai".',
      'Di tahap Selesai jalankan tiga tindak lanjut: minta testimoni, cek apakah ukurannya pas, lalu kirim promo repeat order.',
      'Akhir shift: cek chat yang belum berlabel dan chat yang labelnya tidak berubah lebih dari 3 hari.',
      'Pakai nama label persis: Leads Baru, Proses, Closing, Dikirim, Selesai. Satu customer hanya punya satu label aktif, yaitu label terakhir.',
      'Kriteria lengkap tiap label ada di menu Label Chat.'
    ),
    'notes',
      'Label menempel di chat, bukan di nama kontak. Jangan membuat varian nama (Leads, Prospek, '
      'Done) karena rekap jadi pecah. Label Selesai bukan arsip: chat tetap disimpan untuk riwayat '
      'repeat order. Repeat order mulai lagi dari Proses, tidak kembali ke Leads Baru.'
  )
)
on conflict (id) do nothing;

-- Admin CS: kewajiban mengisi label dan tiga tindak lanjut tahap Selesai.
update public.content_items
set data = jsonb_set(
  data,
  '{responsibilities}',
  coalesce(data->'responsibilities', '[]'::jsonb)
    || to_jsonb('Menjaga label tahap setiap chat customer tetap akurat dan terbaru.'::text)
)
where type = 'jobdesk'
  and id = 'jbd_admin_cs'
  and not coalesce(data->'responsibilities', '[]'::jsonb)
    ? 'Menjaga label tahap setiap chat customer tetap akurat dan terbaru.';

update public.content_items
set data = jsonb_set(
  data,
  '{tasks}',
  coalesce(data->'tasks', '[]'::jsonb)
    || to_jsonb('Beri atau ganti label tahap di setiap chat: Leads Baru → Proses → Closing → Dikirim → Selesai.'::text)
)
where type = 'jobdesk'
  and id = 'jbd_admin_cs'
  and not coalesce(data->'tasks', '[]'::jsonb)
    ? 'Beri atau ganti label tahap di setiap chat: Leads Baru → Proses → Closing → Dikirim → Selesai.';

update public.content_items
set data = jsonb_set(
  data,
  '{tasks}',
  coalesce(data->'tasks', '[]'::jsonb)
    || to_jsonb('Tahap Selesai: minta testimoni, cek ukuran pas, lalu kirim promo repeat order.'::text)
)
where type = 'jobdesk'
  and id = 'jbd_admin_cs'
  and not coalesce(data->'tasks', '[]'::jsonb)
    ? 'Tahap Selesai: minta testimoni, cek ukuran pas, lalu kirim promo repeat order.';

-- Leader CS: pengecekan harian label antar admin.
update public.content_items
set data = jsonb_set(
  data,
  '{tasks}',
  coalesce(data->'tasks', '[]'::jsonb)
    || to_jsonb('Cek label chat tim setiap akhir shift: tidak ada chat tanpa label, dan tidak ada label tertahan lebih dari 3 hari.'::text)
)
where type = 'jobdesk'
  and id = 'jbd_leader_cs'
  and not coalesce(data->'tasks', '[]'::jsonb)
    ? 'Cek label chat tim setiap akhir shift: tidak ada chat tanpa label, dan tidak ada label tertahan lebih dari 3 hari.';

commit;
