# CATATAN UNTUK AGENT — WA INBOX & BOT CS SAMAQU

Dokumen ini untuk agent berikutnya. Baca dulu sebelum mengubah apa pun.
Terakhir diperbarui: 6 November 2026.

---

## 1. Gambaran besar

Ada **dua bot** dan **satu halaman CRM**:

1. **Bot server (aktif sekarang)**
   - Jalan di **Supabase Edge Function** `wa-agent` (project **Samaqu Academy**, ref `rbjxjdgqtcwwbvuwtlpg`).
   - AI: **MiMo** (`mimo-v2.6-flash`) — **bukan Claude**.
   - Dipicu **cron-job.org** job `Samaqu WA Agent` tiap 1 menit.
   - Membaca/menulis data lewat API SAMAQU `/api/ops/*` (login admin), bukan SQL langsung.
   - Persona & memory dibaca dari **database Academy** setiap run.

2. **Bot laptop (lama, dimatikan)**
   - Folder `C:\Users\DELL\Downloads\Samaqu\tools\wa-agent`.
   - Pakai Claude CLI + MCP `tools/mcp-samaqu`.
   - Task Windows `Samaqu Balas WA` status **Disabled**.
   - Jangan dihapus; bisa dipakai lagi kalau server bermasalah.

3. **Halaman CRM** `https://academy.samaqu.id/wa`
   - Kode: `app/(academy)/wa/page.tsx`, `features/wa/*`.
   - Lihat chat, balas manual, ambil alih, log bot.

---

## 2. Alur bot server

```
Cron 1 menit
  → wa-agent (Supabase)
      → lewati pesan yang nomornya "diambil alih admin"
      → jeda 20-25 detik (kumpulkan pesan beruntun)
      → klaim wa_inbox via GET /api/ops/wa-inbox
      → satu run = satu nomor (pesan lain dikembalikan ke antrean)
      → MiMo + tools (cari_produk, cek_ongkir, cek_pesanan, lead, dll)
      → kirim via POST /api/ops/wa-inbox
      → tandai sent / skipped
      → catat log ke wa_agent_runs
```

### Aturan anti-dobel (jangan diubah tanpa alasan)
- **Satu pesan masuk = satu balasan** (`inbox_id` sama tidak boleh dikirim dua kali).
- **Jeda 20–25 detik** sebelum membalas, supaya pesan beruntun digabung.
- **Kunci per nomor** di tabel `wa_agent_locks`.
- Pesan sisa dari nomor yang sama ditandai `digabung`.
- Pesan yang sudah `sent` ditolak server (409).
- Laporan internal **tidak boleh** ikut terkirim ke customer (ada penyaring `cleanForCustomer`).

---

## 3. Database Academy (yang dipakai bot)

| Tabel | Isi |
|---|---|
| `ai_settings` | `behavior.systemInstructions` = persona bot (juga dipakai AI Academy lain) |
| `memory_items` | fakta/aturan tambahan, hanya status `published` yang dipakai |
| `wa_agent_runs` | log tiap run: mode, masuk, dibalas, sisa, tool, durasi, detail |
| `wa_agent_locks` | kunci per nomor WA |
| `wa_handover` | nomor yang diambil alih admin (bot berhenti membalas) |

Data chat sendiri ada di **Supabase SAMAQU** (project berbeda): tabel `wa_inbox`.

---

## 4. Secret yang dibutuhkan (nama saja)

Di Supabase Academy → Edge Functions → Secrets:
- `SAMAQU_BASE_URL` (https://www.samaqu.id)
- `SAMAQU_SUPABASE_URL`
- `SAMAQU_SUPABASE_ANON_KEY`
- `SAMAQU_ADMIN_EMAIL`
- `SAMAQU_ADMIN_PASSWORD`
- `SAMAQU_ADMIN_WA` (6289601062990)
- `SAMAQU_SERVICE_ROLE_KEY`
- `WA_AGENT_SECRET` (header `x-wa-secret`)
- `WA_AGENT_DRY` (`0` = live, `1` = uji)
- `WA_AGENT_BATCH` (jumlah pesan diklaim per run, sekarang 5)
- `AI_SETTINGS_ENCRYPTION_KEY` (sudah ada, untuk buka API key MiMo)

API key MiMo **tidak** disimpan di secret; ada terenkripsi di `ai_settings`.

---

## 5. Endpoint function `wa-agent`

- `GET` → health: `{ok, dry, batch, base_url}` (butuh secret).
- `POST` biasa → jalan live (klaim `wa_inbox`, balas).
- `POST ?dry=1` → mode uji: butuh body `{pesan, pengirim, nama}`, **tidak kirim WA**, hasil balasan di `outbox`.
- `POST ?test=1` → kirim nyata ke nomor di body **tanpa** klaim antrean.

Semua butuh header `x-wa-secret` atau `?key=`.

Contoh tes aman:
```powershell
$url = "https://rbjxjdgqtcwwbvuwtlpg.supabase.co/functions/v1/wa-agent?dry=1&key=<WA_AGENT_SECRET>"
Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' `
  -Body '{"pesan":"harga thobe navy?","pengirim":"6281234567890","nama":"Uji"}'
```

---

## 6. Halaman CRM `/wa`

Fitur:
- Daftar percakapan (nama, nomor, pesan terakhir, badge belum dibalas).
- Riwayat chat (bubble putih = customer, hijau = balasan).
- Balas manual → otomatis **ambil alih** nomor itu.
- Tombol **Ambil alih / Kembalikan ke bot**.
- Tab **Log Bot** (isi per run + detail balasan).
- Tombol **Instruksi & Contoh AI** (owner) → `/settings/memory`.

Catatan UI:
- Kelas CSS memakai prefix `wa-`. **Jangan pakai kelas generik** seperti `chat`, `card`, dll. di komponen ini — pernah bentrok dengan `.chat { height: 460px }` dan merusak layout saat ambil alih.
- Tinggi panel dihitung dari posisi layar nyata (`shellRef`), bukan hanya CSS `calc`, supaya kotak balasan selalu terlihat.

---

## 7. Aturan perilaku bot (ringkas)

- Sapaan **"Ka"** (bukan "Kak"), nama hanya kalau customer menyebut.
- Harga wajib dari `cari_produk`; jangan bulatkan.
- Produk yang **tidak muncul** di `cari_produk` (belum tampil di katalog) tidak boleh ditawarkan.
- Stok tidak boleh disebut angkanya; pakai "ready / tinggal sedikit / habis".
- Ongkir wajib lewat `cek_ongkir`; hanya tawarkan layanan yang muncul.
- Status pesanan hanya dari `cek_pesanan` (termasuk retur/tukar size).
- Data tidak ditemukan → satu kalimat: "Baik Ka, saya catat ya. Admin kami akan bantu cek." Jangan menjelaskan panjang.
- Jangan menulis "sudah diteruskan ke admin".
- Jangan pernah mengirim laporan internal/status tool ke customer.
- `teruskan_admin` hanya untuk komplain, refund/retur, ubah alamat, minta diskon, data tidak ditemukan. Bukan untuk chat biasa atau laporan bug.
- Pesan penutup ("ok", "siap", "ditunggu") tidak dibalas berulang.
- Lead baru: sumber **Meta ads** kalau pesan pembuka berpola iklan (`info lebih lanjut` + `cara order`, atau `Create Your Price`); nomor `62…` disimpan `0…`.
- Satu inbox = satu pesan; kalau perlu 2 paragraf, pakai baris baru dalam satu pesan.

---

## 8. Batas kirim & kuota

- `WA_SEND_MAX_PER_DAY` = **200** (di Vercel project samaqu), `WA_SEND_MAX_PER_HOUR` = 40, jeda 8 detik.
- Fonnte paket **Lite** → **tidak bisa kirim gambar**; kuota total terbatas (cek di dashboard Fonnte).
- Kalau limit penuh, pesan dikembalikan ke antrean, tidak hilang.

---

## 9. Laporan ke admin

- **Harian 07.00** dari laptop: `tools/wa-agent/laporan-harian.mjs`, task Windows `Samaqu Laporan Harian`.
- Isi: nomor ditangani, pesan masuk, dibalas, lead baru, sisa antrean.
- **Teruskan chat** dari bot (syarat di bagian 7).
- Log per-run tidak dikirim ke WA; lihat tab **Log Bot**.

---

## 10. Cara deploy & tes

**Function:**
```powershell
npx supabase functions deploy wa-agent wa-admin --project-ref rbjxjdgqtcwwbvuwtlpg --use-api --no-verify-jwt --yes
```
Butuh env `SUPABASE_ACCESS_TOKEN`.

**Frontend:**
- Push ke `origin/main` repo Academy → Vercel auto-deploy ke `academy.samaqu.id`.
- Sebelum push: `npm run typecheck` dan `npm run build` (wajib lolos).

**Cek cepat:**
- Health function, lalu `?dry=1` untuk uji balasan tanpa kirim.
- Log run di `/wa` → Log Bot.

---

## 11. Masalah yang pernah terjadi (jangan diulang)

1. **Balasan dobel** — penyebab: auto-send mengirim walau model sudah kirim; pesan beruntun diproses terpisah. Solusi: satu run satu nomor + auto-send hanya jika belum ada kiriman.
2. **Laporan internal terkirim ke customer** — prompt lama menyuruh menulis laporan run. Solusi: instruksi dihapus + penyaring baris laporan.
3. **Layout rusak saat ambil alih** — badge memakai kelas `chat` yang bentrok dengan CSS global. Solusi: kelas `wa-flag-head`.
4. **Bot menawarkan produk non-katalog (Koko)** — parameter `hanya_terbit` bisa dimatikan model. Solusi: dipaksa hanya produk publish.
5. **Pesan nyangkut `processing`** — run putus setelah klaim. Solusi: reset otomatis >3 menit + kembalikan sisa ke antrean.
6. **Bot spam `teruskan_admin`** — dipakai untuk chat biasa/masalah sistem. Solusi: aturan pembatas.
7. **Wrapper PowerShell & SQL** — heredoc/quoting sering rusak; tulis SQL ke file `.ps1`/temp lalu jalankan, jangan inline panjang.

---

## 12. Yang belum selesai / perlu keputusan pemilik

1. `memory.md` versi baru belum diserahkan (fakta bot belum diperbarui).
2. Kirim **gambar** (size chart) belum bisa — Fonnte Lite tanpa attachment. Opsi: naik paket, atau kirim link.
3. **Jadwal bot 17.00–08.00** belum diotomatiskan; saat ini pemilik menyalakan/mematikan manual dari cron-job.org.
4. **Ambil alih otomatis saat chat dibuka** (biar admin tidak perlu klik) — baru usulan, belum dibuat.
5. Laporan harian masih bergantung laptop nyala.
6. Kuota Fonnte perlu dipantau/top up.

---

## 13. Batasan kerja untuk agent

- Jangan mengubah kode web SAMAQU (`C:\Users\DELL\Downloads\Samaqu\samaqu`) kecuali diminta eksplisit.
- Jangan menyentuh materi Academy: `content_items`, learning, SOP, job desk, quiz.
- Jangan menaruh persona/memory bot di file repo Academy (repo publik) — simpan di database.
- Sebelum mengubah, sebutkan file + rencana, lalu tunggu izin pemilik.
- Jangan menebak; kalau ragu, tanya.

---

## 14. Profil provider AI (Xiaomi / Command Code / Custom) — 14 Nov 2026

**Tujuan:** pindah provider dari UI tanpa menyentuh logika bot. Semua fungsi (`ai`, `ai-admin`, `wa-agent`) tetap membaca satu baris `ai_settings` (id=1). Profil hanya "tempat parkir" pengaturan; mengaktifkan profil = menyalin ke `ai_settings`.

**File:**
- `supabase/migrations/20261114_ai_provider_profiles.sql` — tabel `ai_provider_profiles` + fungsi `activate_ai_profile()` + seed otomatis dari `ai_settings` saat ini. Idempotent. Rollback: `supabase/rollback/20261114_ai_provider_profiles_rollback.sql` (hanya hapus tabel & fungsi; `ai_settings` tidak disentuh).
- `supabase/functions/_shared/ai-profiles.ts` — aksi baru di `ai-admin`: `list_profiles`, `save_profile`, `delete_profile_key`, `test_profile`, `list_profile_models`, `activate_profile`, `rollback_profile`.
- `features/ai-admin/ProfilesPanel.tsx` — tab Provider & API (3 kartu profil + editor). Tab Model jadi ringkasan.

**Aturan keselamatan:**
- Pindah profil dan simpan perubahan pada profil AKTIF selalu di-tes dulu (1 request kecil). Gagal = tidak berubah. Ada tombol "Tetap lanjutkan tanpa tes" bila memang disengaja.
- Kunci API tiap profil tersimpan terpisah (terenkripsi, kunci enkripsi sama), jadi bolak-balik tidak perlu mengetik ulang.
- Profil aktif tidak bisa dihapus kuncinya. Tombol "Kembali ke <sebelumnya>" ada setelah pernah pindah.
- Bila migrasi belum diterapkan, UI otomatis memakai tampilan lama (`profilesReady=false`).
- Command Code: model WAJIB berawalan penyedia (`xiaomi/mimo-v2.6-flash`). Xiaomi langsung: tanpa awalan (`mimo-v2.6-pro`). Seed migrasi memperbaiki awalan otomatis.
- Mode bot (`wa_bot_control`) TIDAK disentuh fitur ini.

**Cara menerapkan (urutan):**
1. Supabase SQL Editor (project Academy) → jalankan isi file migrasi.
2. `supabase functions deploy ai-admin`
3. Deploy frontend Academy.
4. Cek: tab Provider menampilkan 3 kartu, satu berlabel Aktif; `ai_settings.default_model` = `xiaomi/mimo-v2.6-flash` bila aktif di Command Code.
Sebaiknya di luar jam AI (Senin–Sabtu 07.30–16.30).

**Diuji:** SQL di PGlite (28 cek, termasuk idempotent & rollback), handler (51 cek), UI di jsdom dengan klik/ketik sungguhan (35 cek), `tsc` bersih. BELUM diuji: panggilan nyata ke Command Code/Xiaomi lewat UI produksi.

**Status penerapan (14 Nov 2026):**
- Migrasi `20261114_ai_provider_profiles.sql` SUDAH dijalankan di produksi (project `rbjxjdgqtcwwbvuwtlpg`). Terverifikasi: 3 profil, Command Code aktif dan mewarisi kunci lama (4 digit akhir `dfoL`), `ai_settings.provider` = `command-code`, `default_model` = `xiaomi/mimo-v2.6-flash` (sebelumnya `mimo-v2.6-flash` tanpa awalan, ditolak Command Code). RLS aktif; `anon`/`authenticated` tidak punya akses ke tabel maupun fungsi aktivasi.
- Keadaan `ai_settings` SEBELUM migrasi (untuk rollback manual): provider `xiaomi-mimo`, base_url `https://api.commandcode.ai/provider/v1`, default_model `mimo-v2.6-flash`, feature_models `{}`, pricing USD 0.435 / 0.87 per 1M. Kunci tidak berubah.
- Edge Function `ai-admin` di-deploy ke versi 15 (`verify_jwt=false`) lewat `supabase functions deploy ai-admin --remote=<ref> --no-verify-jwt --use-api --yes`. Deploy ini ikut membawa versi terbaru file `_shared` (hitung biaya MiMo per model, token cache) ke `ai-admin`.
- Rollback fungsi: deploy ulang dari commit `f13c925`. Rollback SQL: `supabase/rollback/20261114_ai_provider_profiles_rollback.sql`.
- Belum teruji di produksi: klik UI sebagai owner dan panggilan nyata ke Xiaomi langsung (kunci Xiaomi belum diisi).

## Perbaikan bot: pertanyaan terpotong & closing tidak tercatat (14 Nov 2026)

**Kejadian:** customer mengirim bukti transfer sebelum alamatnya lengkap. Balasan kami (231 karakter) berakhir dengan "kode posnya berapa ya?", tetapi riwayat yang dilihat model dipotong di 180 karakter, jadi saat customer menjawab "10230" model bertanya balik "itu apa?". Setelah alamat lengkap, model juga tidak tahu `inbox_id` bukti transfer lama sehingga `catat_closing` tidak pernah dipanggil, padahal balasannya sudah berkata "langsung kami proses". Satu run sempat abort (timeout) dan barisnya baru dilepas 3 menit kemudian.

**Perbaikan (Tahap 1, sudah live):**
- `wa-agent/history.ts` (baru, murni & teruji): balasan riwayat dipotong di 1200 karakter dan yang dipertahankan UJUNGNYA (pertanyaan terakhir), pesan bergambar menampilkan `inbox_id`-nya, `collectProofs` + `resolveProofInboxId` membetulkan `inbox_id` di `catat_closing` memakai gambar terbaru dari nomor yang sama bila model kosong/menunjuk pesan teks. Nomor lain tidak pernah dipinjam.
- `index.ts`: aturan prompt "ATURAN KONTEKS & CLOSING LANJUTAN" (jawaban singkat = jawaban pertanyaan terakhir kami; panggil `catat_closing` dengan bukti lama; jangan klaim "diproses" sebelum berhasil). Bila run error, baris `processing` milik run itu langsung dikembalikan ke `pending` (attempts < 3) tanpa menunggu 3 menit.
- SAMAQU `/api/ops/wa-inbox` GET: riwayat kini menyertakan `id` (commit 137c32af). Penambahan kolom saja, kompatibel mundur.

**Diuji:** 24 cek unit `history.ts`; replay model asli (Command Code, data karangan, tool dipalsukan, tanpa WA): cara lama 0/3 benar (2 tanya balik), cara baru 3/3 `catat_closing` dengan `inbox_id` bukti yang benar. Health check + dry-run (harga, ukuran, salam) normal setelah deploy.
**Belum teruji:** pelepasan baris saat error pada produksi nyata, dan percakapan nyata end-to-end.

**Tahap 2 (belum):** jaring pengaman: bila bukti transfer masuk tapi tidak ada closing/draft setelah beberapa waktu, munculkan kasus di Perlu Review / notifikasi admin.

## Jaring pengaman bukti transfer + log lengkap Log Bot (15 November 2026)

**Latar:** kejadian Dinna (14 Nov): bukti transfer masuk tapi `catat_closing` tidak pernah jalan dan tidak ada yang tahu. Perbaikan Tahap 1 menutup penyebabnya; ini menutup AKIBATNYA apa pun penyebabnya.

**Jaring pengaman (live):** `wa-agent/safety-net.ts` (murni, diuji) + `maybeSweep` di `index.ts`.
- Tiap ±5 menit (menit kelipatan 5 dari panggilan cron per menit), dibatasi 8 detik, tidak pernah menggagalkan run, jalan di semua mode bot dan di luar jam kerja AI, tidak jalan di mode uji (dry/test).
- Aturan: gambar dari nomor pribadi, **sudah dibalas bot** (`status=sent`), dan (bot mengirim rekening ≤24 jam sebelumnya — pola bank + nomor ≥7 digit — ATAU balasan atas gambar itu menyebut "bukti transfer/pembayaran … diterima"), sudah **≥ 20 menit**, dan untuk nomor itu tidak ada: closing (Academy `wa_closings`), draft (`source_inbox_id` atau nomor), order, atau kasus Perlu Review (dibuat ≥ 30 menit sebelum bukti sampai sekarang), dan nomor tidak sedang diambil alih admin. Satu kasus per nomor (gambar terlama yang belum tercakup).
- Gambar yang dilewati (`skipped`, admin yang menangani) TIDAK dihitung. Karena itu chat yang diambil alih admin (mis. Syamsudin, Amirah) tidak memicu kasus.
- Hasil: kasus `wa_escalations` (reason `bukti_tanpa_closing`) lewat `/api/ops/perlu-review` aksi `escalation_create` (tidak ada WA, tidak ada panel baru); dedupe per pesan lewat indeks unik + cek semua status 24 jam terakhir. Kalau ada kasus dibuat, satu baris tercatat di Log Bot.
- Kalau salah satu sumber data gagal dibaca, TIDAK ada kasus dibuat (lebih baik terlambat daripada kasus palsu).
- Perilaku nyata pertama (15 Nov 19.35 WIB): 1 kasus untuk nomor yang bot-nya berkata "bukti transfernya saya catat dulu" tanpa closing.
- Replay data nyata 6 hari: aturan awal terlalu longgar (foto produk ikut tertandai karena pola "a.n"); sudah diperketat. Sisa penandaan 20 menit yang kemudian dicatat admin (closing terlambat) adalah wajar, admin tinggal menutup kasusnya.

**Log Bot lengkap:** `wa-agent/trace.ts` (`RunTrace`). Kolom `wa_agent_runs.detail` kini berisi: ringkasan (balasan terkirim, tool), lalu LANGKAH BOT: konteks yang dilihat model, tiap ronde (durasi, token, cache, alasan berhenti, teks yang ditulis model), tiap tool (argumen ringkas, `proof_url` tidak ditampilkan, hasilnya, durasi), dan kejadian khusus (pengaman balasan otomatis, batas ronde, lampiran gagal diunduh). **Run yang error ikut menyimpan langkah yang sudah terjadi** (dulu kosong). Tab Log Bot melipat rincian (`<details>`); run error langsung terbuka. Tanpa migrasi database.
- **Soal "reasoning":** model dipanggil dengan `thinking: 'disabled'` (lebih cepat dan murah; run sudah 40–106 dtk), jadi tidak ada rantai pikiran tersembunyi. Yang tampil adalah teks model + tool + hasilnya. Mengaktifkan thinking akan memperlambat run; tidak dilakukan.

**Diuji:** 32 uji jaring pengaman (sintetis + kasus Dinna), 13 uji jejak, replay data nyata 6 hari, dry-run produksi (jejak tersimpan), sapuan produksi pertama membuat 1 kasus. **Belum terverifikasi:** tampilan visual tab Log Bot (lipatan) di layar live; perilaku sapuan saat model/API lambat; apakah 20 menit pas untuk ritme admin (bisa diubah di `SAFETY_WAIT_MS`).

## Redesign tab Log Bot (WA Inbox)
- Satu kartu per AKTIVITAS bot, bukan per pengecekan cron. Komponen: `features/wa/LogBotView.tsx` (memuat data sendiri, polling 30 dtk), parser murni: `features/wa/log-parse.ts` (kind: dibalas/perhatian/gagal/jaring/diambil_alih/uji/mode/berjalan/kosong). Gaya: blok `wl-*` di `styles/components.css`.
- Run kosong (live, handled 0, held 0, tanpa error, bukan jaring pengaman; sekitar 70% isi tabel) disembunyikan di server: `wa-admin` action `logs` dengan `compact: true` mengembalikan `{ items, idle: { count, since } }`. Tanpa `compact` perilakunya sama seperti dulu. Checkbox "Tampilkan run kosong" meminta 200 baris tanpa compact.
- Filter: Perlu perhatian (default) / Semua aktivitas / Gagal / Jaring pengaman. Ringkasan atas: dibalas hari ini (WIB), run gagal, kasus jaring pengaman, rata-rata waktu jawab.
- Penyebab gagal diterjemahkan ke bahasa biasa di `plainError` (timeout, saldo, 401/403, 429, 5xx, run tidak selesai); pesan teknis asli tetap ada di bawah "Lihat detail teknis".
- Rincian ronde AI, tool, hasil dilipat di "Lihat langkah AI". Run lama tanpa jejak langkah menampilkan catatan mentah.
- Tidak ada perubahan di bot, database, atau menu.

## Retensi log (pembersihan otomatis wa_agent_runs)
- `maybePurgeRuns` di `wa-agent/index.ts`, jalan di menit 17 dan 47 tiap jam (cron memanggil tiap menit; tidak jalan di mode uji/dry). Tidak pernah menggagalkan run.
- Run KOSONG (mode live, handled 0, held 0, tanpa error, bukan catatan jaring pengaman) dihapus setelah 2 hari. Semua run lain dihapus setelah 14 hari. Konstanta: `IDLE_RUN_KEEP_MS`, `RUN_KEEP_MS`.
- Definisi "kosong" harus tetap sama dengan filter `compact` di `wa-admin` (`runs()`); kalau salah satu diubah, ubah keduanya.
- `pg_cron` tidak terpasang di database Academy, makanya dipasang di wa-agent. Hasil dicatat di log fungsi ("purge log: N kosong, M lama") hanya kalau ada yang terhapus.
- Dry-run sebelum diterapkan (15 Nov 2026): 4.133 baris kosong > 2 hari akan terhapus, 0 baris > 14 hari; 7.517 total, 1.579 aktif dipertahankan.

## Langkah AI sebagai urutan kerja (Log Bot)
- `features/wa/log-timeline.ts` (murni): `buildTimeline(steps)` mengubah ronde/tool/hasil jadi langkah berbahasa biasa ("Cek apakah 0899… sudah tercatat sebagai lead → Sudah ada 1 lead", "Kirim balasan WhatsApp ke … → Terkirim", "Selesai"). Satu tool = satu langkah; tool baru yang belum dikenal otomatis tampil dengan nama yang dirapikan (tambah kasus di `describe()` kalau mau kalimat khusus).
- Waktu mikir model dibebankan ke langkah pertama tiap ronde; badge "N dtk" hanya muncul kalau langkah > 3 dtk.
- Angka teknis (ronde, token, cache, milidetik, ID, argumen penuh) dipindah ke lipatan "Detail teknis". Format sumber ditulis `wa-agent/trace.ts`; kalau format itu diubah, sesuaikan `parseCall` / `parseSteps`.

## Ronde kosong terpotong `length` (kasus 15 Nov 2026, run 7529)
- Gejala: AI menulis 1.500 token (batas `maxTokens`) tanpa teks dan tanpa tool (`selesai: length`) → tidak ada balasan, pesan dikembalikan ke antrean, customer menunggu ±6 menit. Jarang (1 dari 247 run aktif/24 jam); percobaan ulang pesan yang sama langsung berhasil (184 token).
- Perbaikan: di loop ronde `wa-agent/index.ts`, ronde kosong + `finishReason === 'length'` diulang SEKALI di run yang sama (`emptyLengthRetries`), dicatat sebagai kejadian di jejak. Batas 1.500 sengaja tidak dinaikkan.
- Log Bot: ronde seperti itu tampil kuning "AI tidak menghasilkan balasan", bukan "Selesai" hijau. Label "Bot" di kartu diganti "Agent".
- Belum diketahui: kenapa run 7525 (19.53) menggantung tanpa jejak sebelum run 7529.

## Pelajaran AI, Fase 1 (16 Nov 2026) — rekam jejak + tab baca-saja
Rencana besar: agent belajar dari kesalahannya lewat usulan pelajaran yang disetujui owner (Fase 2+). Fase 1 TIDAK mengubah perilaku agent.
- **Migrasi** `supabase/migrations/20261116_wa_tool_calls.sql` (tambahan murni, sudah diterapkan): kolom `wa_agent_runs.inbox_ids text[]` (kunci penghubung ke eskalasi/draft di SAMAQU, tanpa FK lintas DB) dan tabel `wa_tool_calls` (satu baris per panggilan tool; `on delete cascade` dari run; RLS aktif tanpa policy, hanya service_role).
- **Pencatatan** (`wa-agent`): `RunTrace.tool()` kini juga menyimpan catatan terstruktur (`toolCallRecords()`); `finishRun` memanggil `recordRunExtras` (`run-extras.ts`) SESUDAH log utama tersimpan, hanya untuk run `live`/`error`, dibungkus try/catch (tabel/kolom hilang atau jaringan putus hanya tercatat di log fungsi). Format teks Log Bot tidak berubah.
- **Penyamaran** (`wa-agent/redact.ts`): nomor HP dan angka panjang (rekening) → 2 digit awal + bintang + 3 akhir; email, Bearer, query URL bertanda tangan dibuang; kunci `nama/alamat/rekening` → `[disamarkan]`; `proof_url` dibuang. UUID (inbox_id) DILINDUNGI (segmen akhir 12 digit pernah ikut tersamarkan di tes). Nomor order dan resi sengaja dibiarkan. Batas: nama/alamat di dalam teks bebas (mis. isi `pesan`) tidak dikenali.
- **Retensi baru** (`maybePurgeRuns`): run kosong 2 hari (tetap); kolom `detail` dan `wa_tool_calls` 90 hari (detail dikosongkan, baris run tetap sebagai metadata); metadata run 1 tahun. Dulu semua run dihapus setelah 14 hari. DB Academy hanya 18 MB saat ini.
- **Tab "Pelajaran AI"** (WA Inbox, `features/wa/LessonsView.tsx`) memanggil aksi `lessons` di `wa-admin` (BACA SAJA; semua user login, belum ada persetujuan): eskalasi dikelompokkan dengan kata kunci (`_shared/lessons-analysis.ts`, KINDS berurut: gosend, lampiran, komplain, pembayaran, pengiriman, stok, ukuran, promo, produk, lainnya), kasus unik vs kembar, customer berulang (≥3), tinjauan pelajaran terbit (terlalu panjang >300 karakter, memuat order/resi/rekening/nominal, berbentuk dokumen), ringkasan tool 7 hari. Database SAMAQU dibaca lewat `serviceFetch` yang sudah ada di wa-admin.
- Jebakan yang sudah ketemu: kata kunci `custom` cocok di "Customer" dan `potong` di "potongan" (pakai batas kata `\b`). Pelajaran global dikirim UTUH ke SETIAP pesan (`/api/ops/wa-inbox` GET → `wa-agent/index.ts` ±baris 250), tanpa batas: Fase 3 perlu anggaran/pemilihan relevan.
- Cara memastikan pencatatan jalan: setelah ada customer yang dibalas agent, `select count(*) from wa_tool_calls` > 0 dan `wa_agent_runs.inbox_ids` terisi untuk run berpesan.

## Pelajaran AI, Fase 2a/2b (16 Nov 2026) — usulan, terbit, tarik
- Migrasi `20261116_wa_lessons.sql` (diterapkan): `wa_lesson_proposals` (+ indeks unik anti-ganda `dedupe_key`) dan `wa_lesson_events` (audit). RLS aktif, hanya service_role.
- `_shared/lessons-core.ts` (scrub, lintLesson, buildCases, prompt, parseModelLessons), `_shared/lessons-actions.ts` (generate/edit/reject/publish/retire; semua aksi ubah HANYA owner; terbit = klaim atomik lalu POST ke SAMAQU `wa_learnings`; tarik = status `archived`, tidak ada DELETE). `wa-admin`: aksi `lessons_proposals|generate|edit|reject|publish|retire`. Biaya AI dicatat sebagai `admin_test` (bukan `wa`).
- Tab "Pelajaran AI": owner dapat susun/edit/setujui/tolak/tarik/tulis ulang; CS hanya melihat. Pengaman keras (telepon, rekening, order/resi, email, tautan asing, kalimat mengubah aturan) diperiksa ulang di server saat terbit.
- BELUM: 2c uji sebelum-sesudah; nomor/nama utuh di layar (sekarang masih `62********813`, penyamaran seharusnya hanya untuk AI dan log tool); wa-admin yang ter-deploy masih versi bernomor tersamarkan.

## Jawab pertanyaan AI di Academy, panel admin pensiun (16 Nov 2026)
- **Alur baru:** eskalasi (`wa_escalations`, dibuat bot lewat `/api/ops/perlu-review` aksi `escalation_create`) dijawab di tab **Chat** Academy. Kotak kuning "Pertanyaan AI menunggu" tampil di atas percakapan customer. Membalas = semua eskalasi `open`/`claimed` milik nomor itu jadi `answered` dan balasan tersimpan di `reply_text` (bahan Pelajaran AI). Tombol "Tandai selesai" = `closed`. Kode: `supabase/functions/_shared/escalations.ts` (`pendingFor`, `markAnswered`, `closeEscalation`), aksi `wa-admin`: `escalations`, `escalation_close`; `reply` memanggil `markAnswered` di dalam try/catch SETELAH pesan terkirim (kegagalan tidak membuat balasan terlihat gagal).
- **Tidak ada pelajaran otomatis lagi.** Dulu panel admin SAMAQU (Perlu Review → Pertanyaan AI → Kirim) menyimpan instruksi admin langsung ke `wa_learnings` (global kalau kotak dicentang) tanpa saringan; dari situ lahir pelajaran bermasalah (rekening + nominal, dokumen kain 2.017 karakter). Jalur itu DIHAPUS di SAMAQU (commit `bce0ad70`: aksi `escalation_draft|send|close` dan `makeAiReply`). Pelajaran hanya lahir dari tab Pelajaran AI (usulan, disetujui owner).
- **Tetap di panel admin SAMAQU:** tab Transaksi (draft transaksi AI: setujui/tolak/hapus/edit) dan `escalation_create` (dipakai bot WA dan MCP `teruskan_admin` — JANGAN dihapus). `escalation_claim` dan `escalation_instruction` masih ada di route tetapi tidak ada pemanggilnya (kandidat dibersihkan nanti).
- **Tombol "Buka chat"** di bagian "Customer yang berulang kali dieskalasi" (tab Pelajaran AI) membuka percakapan customer di tab Chat. Daftar pelajaran terbit hanya memuat status `published`, dengan tombol "Lihat isi". Layar owner menampilkan nama + nomor utuh; penyamaran hanya untuk teks ke AI dan log `wa_tool_calls`.
- Belum: 91 eskalasi lama berstatus `open` (banyak yang basi) belum ditutup massal; harus dry-run dulu.
