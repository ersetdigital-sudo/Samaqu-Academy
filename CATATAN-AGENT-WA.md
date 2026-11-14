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
