-- Learning path (Fase 1): level, materi wajib, kuis per materi, attempt per user.
-- Atomic + idempotent: aman dijalankan ulang.

begin;

-- 1. Level / learning path ---------------------------------------------------

create table if not exists public.learning_levels (
  id integer primary key,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.learning_levels (id, title, description, sort_order)
values
  (1, 'Onboarding & Fundamental', 'Dasar brand, nilai pelayanan, dan standar komunikasi Samaqu.', 1),
  (2, 'Product & Business Knowledge', 'Series thobe, perbedaan thobe dan kandora, serta harga dan open order.', 2),
  (3, 'Customer Service Operations', 'Alur layanan harian, pemrosesan pesanan, dan koordinasi dengan tim.', 3),
  (4, 'Problem Solving & Communication', 'Menangani pertanyaan sulit, keberatan customer, dan eskalasi.', 4),
  (5, 'Practice & Assessment', 'Latihan simulasi dan asesmen akhir sebelum terjun ke percakapan nyata.', 5)
on conflict (id) do nothing;

-- Kolom level + wajib pada tabel materi (materi disimpan di content_items).
alter table public.content_items
  add column if not exists level_id integer references public.learning_levels (id) on delete set null,
  add column if not exists is_required boolean not null default true;

create index if not exists content_items_level_idx
  on public.content_items (level_id, sort_order);

-- Materi 1-3 masuk Level 1, materi 4-6 masuk Level 2 (berdasarkan urutan belajar).
update public.content_items
  set level_id = 1
  where type = 'material' and level_id is null and sort_order between 1 and 3;

update public.content_items
  set level_id = 2
  where type = 'material' and level_id is null and sort_order between 4 and 6;

-- Perbaikan data: Teknik Komunikasi Efektif pindah ke Communication Guidelines.
update public.content_items
  set data = jsonb_set(data, '{category}', '"Communication Guidelines"'::jsonb),
      updated_at = now()
  where type = 'material'
    and data->>'title' = 'Teknik Komunikasi Efektif'
    and data->>'category' is distinct from 'Communication Guidelines';

-- Progres jujur: angka 10% bawaan lama dihapus, materi yang sudah dibuka = 50%.
update public.progress
  set progress = 50, updated_at = now()
  where kind = 'material'
    and status = 'progress'
    and (progress is null or progress < 50);

-- 2. Kuis per materi --------------------------------------------------------

create table if not exists public.quiz_questions (
  id text primary key,
  material_id text not null,
  question text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct_index integer not null check (correct_index >= 0),
  explanation text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_questions_material_idx
  on public.quiz_questions (material_id, sort_order);

create table if not exists public.quiz_attempts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id text not null,
  score integer not null check (score between 0 and 100),
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_material_idx
  on public.quiz_attempts (user_id, material_id, created_at desc);

-- 3. RLS -------------------------------------------------------------------

alter table public.learning_levels enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

drop policy if exists learning_levels_select on public.learning_levels;
create policy learning_levels_select
  on public.learning_levels for select
  to authenticated
  using (true);

drop policy if exists learning_levels_write on public.learning_levels;
create policy learning_levels_write
  on public.learning_levels for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists quiz_questions_select on public.quiz_questions;
create policy quiz_questions_select
  on public.quiz_questions for select
  to authenticated
  using (true);

drop policy if exists quiz_questions_write on public.quiz_questions;
create policy quiz_questions_write
  on public.quiz_questions for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists quiz_attempts_select on public.quiz_attempts;
create policy quiz_attempts_select
  on public.quiz_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_insert on public.quiz_attempts;
create policy quiz_attempts_insert
  on public.quiz_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_update on public.quiz_attempts;
create policy quiz_attempts_update
  on public.quiz_attempts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists quiz_attempts_delete on public.quiz_attempts;
create policy quiz_attempts_delete
  on public.quiz_attempts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 4. Bank soal — hanya dari isi materi terkait ------------------------------

-- Materi 2: Gaya Komunikasi Samaqu
insert into public.quiz_questions (id, material_id, question, options, correct_index, explanation, sort_order)
values
  ('qz_mat_2_1', 'mat_2', 'Pola standar memberikan respons kepada customer menurut materi adalah…',
   '["Respons → Informasi → Langkah Berikutnya","Informasi → Harga → Penawaran","Sapaan → Emoji → Closing","Tanya → Tunggu → Konfirmasi"]'::jsonb, 0,
   'Bagian "Standar Memberikan Respons" menetapkan pola Respons → Informasi → Langkah Berikutnya.', 1),
  ('qz_mat_2_2', 'mat_2', 'Sapaan yang harus dipakai secara konsisten oleh admin Samaqu adalah…',
   '["Kakak/Sir bergantian","Kak","Bro","Anda"]'::jsonb, 1,
   'Prinsip komunikasi nomor 1: gunakan sapaan "Kak" secara konsisten.', 2),
  ('qz_mat_2_3', 'mat_2', 'Customer menanyakan ukuran yang sedang kosong. Jawaban yang sesuai materi adalah…',
   '["Nanti kita usahakan ya Kak.","Stoknya habis, coba cek sendiri di web ya Kak.","Untuk ukuran tersebut saat ini belum tersedia, Kak. Kalau berkenan, kami bisa bantu informasikan ketika stoknya tersedia kembali.","Kosong Kak."]'::jsonb, 2,
   'Contoh "Ketika produk kosong" menekankan informasi ketersediaan plus tawaran langkah berikutnya.', 3),
  ('qz_mat_2_4', 'mat_2', 'Kalimat yang termasuk hal yang harus dihindari menurut materi adalah…',
   '["Kami bantu konfirmasi dulu ke tim terkait","Kakak mau kami bantu proses pesanannya?","Untuk produk ini harganya Rp359.000, Kak","Nanti kita usahakan ya"]'::jsonb, 3,
   'Prinsip komunikasi nomor 4 melarang jawaban menggantung seperti "nanti kita usahakan ya".', 4),
  ('qz_mat_2_5', 'mat_2', 'Ketika admin belum mengetahui jawabannya, langkah yang benar adalah…',
   '["Kami bantu konfirmasi terlebih dahulu kepada tim terkait agar informasi yang kami berikan akurat","Menjawab seadanya agar customer cepat dapat balasan","Mengabaikan pesan sampai tahu jawabannya","Menebak jawaban yang paling mungkin benar"]'::jsonb, 0,
   'Contoh "Ketika belum mengetahui jawaban" memakai kalimat konfirmasi ke tim terkait.', 5)
on conflict (id) do update set
    question = excluded.question,
    options = excluded.options,
    correct_index = excluded.correct_index,
    explanation = excluded.explanation,
    sort_order = excluded.sort_order;

-- Materi 3: Teknik Komunikasi Efektif
insert into public.quiz_questions (id, material_id, question, options, correct_index, explanation, sort_order)
values
  ('qz_mat_3_1', 'mat_mw209f3fi3kj', 'Komunikasi efektif menurut materi adalah…',
   '["Jumlah pesan yang dikirim ke customer","Cara menyusun pesan supaya customer cepat paham dan mudah mengambil keputusan","Cara berbicara yang mencerminkan karakter brand","Kecepatan membalas pesan customer"]'::jsonb, 1,
   'Materi membedakan Tone of Voice (cara kita berbicara) dari komunikasi efektif (cara menyusun pesan).', 1),
  ('qz_mat_3_2', 'mat_mw209f3fi3kj', 'Konfirmasi ulang sebelum memproses pesanan merangkum detail apa saja?',
   '["Nama customer dan nomor HP","Metode pembayaran dan kurir","Produk, series, warna, ukuran, dan alamat","Harga, diskon, dan ongkir"]'::jsonb, 2,
   'Teknik nomor 4: rangkum produk, series, warna, ukuran, dan alamat untuk mencegah salah kirim.', 2),
  ('qz_mat_3_3', 'mat_mw209f3fi3kj', 'Contoh memberi kepastian waktu yang benar adalah…',
   '["Nanti kami kabari ya Kak.","Tunggu saja, Kak.","Segera kami proses, Kak.","Kami cek stoknya dulu ya, Kak. Paling lambat 10 menit lagi kami kabari."]'::jsonb, 3,
   'Teknik nomor 5: sebutkan kapan customer akan dikabari, lalu tepati.', 3),
  ('qz_mat_3_4', 'mat_mw209f3fi3kj', 'Mana yang merupakan pertanyaan terarah?',
   '["Kakak lebih suka kerah bulat atau kerah kemeja?","Kakak mau yang mana?","Kakak butuh apa lagi?","Ada lagi, Kak?"]'::jsonb, 0,
   'Teknik nomor 3: berikan pilihan yang jelas supaya customer cepat memutuskan.', 4),
  ('qz_mat_3_5', 'mat_mw209f3fi3kj', 'Saat menerima instruksi dari tim, kebiasaan yang dianjurkan materi adalah…',
   '["Mencatat sambil menebak maksud instruksi","Mengulangi instruksi untuk memastikan, misalnya: Baik, berarti saya cek stok dulu, lalu kirim laporannya ke tim, betul?","Langsung mengerjakan tanpa konfirmasi","Menunggu instruksi berikutnya"]'::jsonb, 1,
   'Bagian "Komunikasi dengan Tim": ulangi instruksi untuk memastikan pemahaman.', 5)
on conflict (id) do update set
    question = excluded.question,
    options = excluded.options,
    correct_index = excluded.correct_index,
    explanation = excluded.explanation,
    sort_order = excluded.sort_order;

-- Materi 4: Mengenal 6 Series Thobe SAMAQU
insert into public.quiz_questions (id, material_id, question, options, correct_index, explanation, sort_order)
values
  ('qz_mat_4_1', 'mat_mw1kvsemkqyt', 'Series Imron memiliki ciri…',
   '["Kerah bulat dengan aksesoris eyelet berlubang","Kerah kemeja dengan aksesoris pin collar","Kerah bulat dengan placket beraksen kancing diamond","Kerah kemeja dengan placket polos"]'::jsonb, 2,
   'Kelompok kerah bulat: Imron adalah placket dengan aksesoris kancing diamond.', 1),
  ('qz_mat_4_2', 'mat_mw1kvsemkqyt', 'Series kerah kemeja dengan placket polos adalah…',
   '["Karim","Imron","Bayati","Nahawand"]'::jsonb, 3,
   'Kelompok kerah kemeja: Nahawand placket polos, Karim placket kancing diamond, Imalah pin collar.', 2),
  ('qz_mat_4_3', 'mat_mw1kvsemkqyt', 'Aksesoris pin collar dengan placket polos menandai series…',
   '["Imalah","Jiharkah","Karim","Bayati"]'::jsonb, 0,
   'Imalah: kerah kemeja dengan aksesoris pin collar dan placket polos.', 3),
  ('qz_mat_4_4', 'mat_mw1kvsemkqyt', 'Cara membuka semua series Thobe SAMAQU adalah dengan…',
   '["Tali tarboosh","Zipper, sementara kancing diamond dan eyelet hanya aksesoris","Kancing diamond yang bisa dibuka","Eyelet yang berfungsi sebagai bukaan"]'::jsonb, 1,
   'Yang wajib diingat: semua series memakai zipper; kancing diamond dan eyelet hanya aksesoris.', 4),
  ('qz_mat_4_5', 'mat_mw1kvsemkqyt', 'Series Bayati memiliki placket dengan aksesoris…',
   '["Pin collar","Tidak beraksen","Eyelet berlubang","Kancing diamond"]'::jsonb, 2,
   'Kelompok kerah bulat: Bayati adalah placket dengan aksesoris eyelet berlubang.', 5)
on conflict (id) do update set
    question = excluded.question,
    options = excluded.options,
    correct_index = excluded.correct_index,
    explanation = excluded.explanation,
    sort_order = excluded.sort_order;

-- Materi 5: Perbedaan Thobe dan Kandora
insert into public.quiz_questions (id, material_id, question, options, correct_index, explanation, sort_order)
values
  ('qz_mat_5_1', 'mat_7f9b798ed1ef', 'Kerah Kandora berbentuk…',
   '["Kerah bulat","Kerah kemeja","Kerah shanghai","Tanpa kerah (kerah oblong)"]'::jsonb, 3,
   'Tabel perbandingan: Thobe berkerah, Kandora tanpa kerah (kerah oblong).', 1),
  ('qz_mat_5_2', 'mat_7f9b798ed1ef', 'Placket dada Kandora berbeda dari Thobe karena…',
   '["Tanpa kain keras dan memakai resleting","Memakai kain keras seperti Thobe","Tidak ada placket sama sekali","Memakai kancing diamond"]'::jsonb, 0,
   'Placket Thobe memakai kain keras; Kandora tanpa kain keras dan memakai resleting.', 2),
  ('qz_mat_5_3', 'mat_7f9b798ed1ef', 'Letak kantong pada Kandora adalah…',
   '["Kantong di lengan","Tidak ada kantong dada, kantong ada di sisi pinggang","Kantong di dada seperti Thobe","Tanpa kantong sama sekali"]'::jsonb, 1,
   'Kantong: Thobe di dada; Kandora tanpa kantong dada, kantong di sisi pinggang.', 3),
  ('qz_mat_5_4', 'mat_7f9b798ed1ef', 'Lengan Kandora dijelaskan sebagai…',
   '["Bermanset dengan kancing diamond","Tanpa bukaan di lengan","Tanpa manset, memakai resleting yang bisa dibuka saat wudhu","Bermanset dan bisa memakai cufflink"]'::jsonb, 2,
   'Lengan: Thobe bermanset (bisa cufflink/kabak); Kandora tanpa manset dengan resleting untuk wudhu.', 4),
  ('qz_mat_5_5', 'mat_7f9b798ed1ef', 'Tali tarboosh pada Kandora…',
   '["Tidak bisa dilepas","Hanya ada pada Thobe","Berfungsi sebagai pengganti resleting","Bisa dilepas dan dipasang"]'::jsonb, 3,
   'Ciri khas Kandora: tali tarboosh yang bisa dilepas dan dipasang.', 5)
on conflict (id) do update set
    question = excluded.question,
    options = excluded.options,
    correct_index = excluded.correct_index,
    explanation = excluded.explanation,
    sort_order = excluded.sort_order;

-- Materi 6: Open Order & Create Your Price
insert into public.quiz_questions (id, material_id, question, options, correct_index, explanation, sort_order)
values
  ('qz_mat_6_1', 'mat_989a6bbdf390', 'Harga Thobe kain B-01 untuk series polos (Jiharkah, Nahawand) di katalog adalah…',
   '["Rp 359.000","Rp 374.000","Rp 329.000","Rp 399.000"]'::jsonb, 0,
   'Katalog ready stock: series polos Rp 359.000, series variasi Rp 374.000, acuan size M.', 1),
  ('qz_mat_6_2', 'mat_989a6bbdf390', 'Harga minimum pada program Create Your Price Open Order Kandora adalah…',
   '["Tidak ada harga minimum","Rp 329.000","Rp 359.000","Rp 374.000"]'::jsonb, 1,
   'Create Your Price minimal Rp 329.000 dan tertulis "Harga Minimum" di web.', 2),
  ('qz_mat_6_3', 'mat_989a6bbdf390', 'Create Your Price berlaku untuk…',
   '["Thobe series polos","Semua pesanan yang sudah dibayar","Open Order Kandora, tidak untuk produk ready stock di katalog","Semua produk katalog"]'::jsonb, 2,
   'Materi menegaskan Create Your Price tidak berlaku untuk produk ready stock.', 3),
  ('qz_mat_6_4', 'mat_989a6bbdf390', 'Untuk memastikan Open Order masih dibuka, admin harus…',
   '["Menyebut tanggal tutup dari ingatan","Menanyakan ke customer","Menganggap Open Order selalu buka","Mengecek hitung mundur di halaman produk"]'::jsonb, 3,
   'Periode Open Order terbatas; cek hitung mundur di halaman produk sebelum menjawab.', 4),
  ('qz_mat_6_5', 'mat_989a6bbdf390', 'Jika customer bertanya estimasi pengiriman Open Order, admin sebaiknya…',
   '["Konfirmasi dulu ke leader sebelum menjawab","Menyebut estimasi paling cepat","Menjanjikan pengiriman minggu depan","Mengatakan pengiriman tidak bisa dilacak"]'::jsonb, 0,
   'Estimasi pengiriman Open Order belum ditetapkan di materi; konfirmasi ke leader dulu.', 5)
on conflict (id) do update set
    question = excluded.question,
    options = excluded.options,
    correct_index = excluded.correct_index,
    explanation = excluded.explanation,
    sort_order = excluded.sort_order;

commit;
