import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js';
import { z } from 'npm:zod@4.6.7';
import {
  buildAcademyPhotoMap,
  buildAcademyProductMap,
  buildAcademyVideoMap,
  buildOngkirText,
  buildProductText,
  fetchJntStatus,
  formatAcademyProductDetail,
} from '../_shared/wa/tools-core.mjs';

/**
 * MCP SAMAQU versi online (Streamable HTTP, tanpa sesi).
 *
 * Port dari `tools/mcp-samaqu/index.mjs` (MCP lokal yang tetap jalan). Tool saat ini (12):
 * baca-saja: `cek_ongkir`, `cari_produk`, `cari_area_ongkir` (wilayah + kode pos), `cek_pesanan`,
 * `cek_resi`, `info_series`, `info_bahan`, `detail_produk`, `rekomendasi_size` (tabel TB x BB),
 * `cek_pelanggan` (baru/lama + promo cover), `info_rekening` (dari secret MCP_REKENING),
 * `cek_lead_duplikat`, `daftar_lead`, `opsi_lead`; satu-satunya yang MENULIS: `catat_lead` (PIC wajib diisi).
 * SENGAJA tidak ada: kirim_wa, teruskan_admin, pesan_wa_masuk, lewati_wa (alur bot WA), serta
 * catat_closing dan buat_draft_transaksi (butuh inbox_id WA dan catat_closing mengirim WA ke admin).
 *
 * Keamanan:
 * - Setiap permintaan wajib membawa token (`Authorization: Bearer <token>`, atau `x-api-key` /
 *   `x-auth-token` karena Claude mengunci header Authorization). Yang disimpan di server
 *   hanya hash SHA-256 token: secret `MCP_TOKENS` (`nama:<hash>,nama2:<hash>`) dan/atau satu secret
 *   per orang `MCP_TOKEN_<NAMA>=<hash>`, jadi token asli tidak bisa dibaca dari Supabase.
 *   Mencabut satu orang = menghapus satu entri/secret.
 * - Akses data lewat API /api/ops/* situs SAMAQU dengan akun layanan `MCP_LOGIN_EMAIL`
 *   (akun bot terpisah), BUKAN akun orang.
 */

const BASE_URL = (Deno.env.get('SAMAQU_BASE_URL') || 'https://www.samaqu.id').replace(/\/+$/, '');
const SITE_SUPABASE_URL = (Deno.env.get('SAMAQU_SUPABASE_URL') || '').replace(/\/+$/, '');
const SITE_ANON_KEY = Deno.env.get('SAMAQU_SUPABASE_ANON_KEY') || '';
const LOGIN_EMAIL = Deno.env.get('MCP_LOGIN_EMAIL') || '';
const LOGIN_PASSWORD = Deno.env.get('MCP_LOGIN_PASSWORD') || '';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (value: string) => ({ isError: true, content: [{ type: 'text' as const, text: value }] });

/* ─────────────────────────── token ─────────────────────────── */

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mengembalikan nama pemilik token, atau null kalau token tidak dikenal. */
async function identify(req: Request): Promise<string | null> {
  // Claude (konektor kustom) mengunci header `Authorization` untuk OAuth miliknya sendiri, jadi token
  // juga diterima lewat `x-api-key` / `x-auth-token`. Awalan "Bearer " di nilai boleh ada atau tidak.
  const raw =
    req.headers.get('authorization') || req.headers.get('x-api-key') || req.headers.get('x-auth-token') || '';
  const match = raw.trim().match(/^(?:Bearer\s+)?(\S+)$/i);
  if (!match) return null;

  const presented = await sha256Hex(match[1]);
  let owner: string | null = null;
  // Dua bentuk secret (hanya HASH SHA-256, tanpa tanda kutip supaya aman di env-file):
  //   MCP_TOKENS=nama:hash,nama2:hash2     (daftar)
  //   MCP_TOKEN_<NAMA>=hash                (satu secret per orang: tambah/cabut tanpa menyentuh yang lain)
  // Semua entri diperiksa (tanpa berhenti dini) supaya waktu respons tidak membocorkan apa pun.
  const candidates: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (key === 'MCP_TOKENS') {
      for (const entry of value.split(',')) {
        const sep = entry.indexOf(':');
        if (sep > 0) candidates.push([entry.slice(0, sep).trim(), entry.slice(sep + 1).trim().toLowerCase()]);
      }
    } else {
      const single = key.match(/^MCP_TOKEN_(.+)$/);
      if (single) candidates.push([single[1].toLowerCase(), value.trim().toLowerCase()]);
    }
  }
  for (const [name, hash] of candidates) {
    if (name && /^[0-9a-f]{64}$/.test(hash) && safeEqual(presented, hash)) owner = name;
  }
  return owner;
}

/* ─────────────────────────── login ke API situs ─────────────────────────── */

let session: { token: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  const missing = [
    ['SAMAQU_SUPABASE_URL', SITE_SUPABASE_URL],
    ['SAMAQU_SUPABASE_ANON_KEY', SITE_ANON_KEY],
    ['MCP_LOGIN_EMAIL', LOGIN_EMAIL],
    ['MCP_LOGIN_PASSWORD', LOGIN_PASSWORD],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Secret belum diisi: ${missing.join(', ')}`);

  const res = await fetch(`${SITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SITE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    throw new Error(`Login akun layanan MCP gagal (${res.status})`);
  }
  session = {
    token: String(body.access_token),
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60_000,
  };
  return session.token;
}

async function accessToken(): Promise<string> {
  if (session && session.expiresAt > Date.now()) return session.token;
  return login();
}

async function opsFetch(pathname: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (res.status === 401 && retry) {
    session = null;
    return opsFetch(pathname, init, false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Permintaan ke ${pathname} gagal (HTTP ${res.status})`);
  return body;
}

/* ─────────────────────────── helper leads ─────────────────────────── */

// Port dari tools/mcp-samaqu/index.mjs supaya perilakunya identik.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const rupiah = (n: unknown) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

function wibParts(date = new Date()) {
  const w = new Date(date.getTime() + WIB_OFFSET_MS);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), min: w.getUTCMinutes() };
}
const wibToday = () => {
  const p = wibParts();
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};
const wibClockNow = () => {
  const p = wibParts();
  return `${pad(p.h)}.${pad(p.min)}`;
};
const defaultFollowupIso = () => {
  const p = wibParts();
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1, 10 - 7, 0, 0)).toISOString();
};
function wibInputToIso(value: string | undefined): string | null {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[:.](\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`).toISOString();
}

function formatTanggal(value: unknown): string {
  const raw = String(value || '');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+07:00` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw || '-';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(d);
}

function formatWaktu(iso: unknown): string {
  if (!iso) return '-';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '-';
  const jam = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).format(d).replace(':', '.');
  return `${formatTanggal(d.toISOString())} ${jam}`;
}

function normalizeKontak(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase().replace(/^[=@"'\s]+|[@"'\s]+$/g, '');
  if (!s) return '';
  if (/[a-z]/.test(s.replace(/^@/, ''))) return s.replace(/^@+/, '');
  const digits = s.replace(/\D/g, '');
  const n = digits.replace(/^0+/, '');
  if (n.startsWith('62') && n[2] === '8') return n.slice(2);
  return n || digits;
}

async function findLeadsByKontak(kontak: string): Promise<any[]> {
  const target = normalizeKontak(kontak);
  const needle = /^\d+$/.test(target) ? target.slice(-9) : target;
  const json = await opsFetch(`/api/ops/leads?search=${encodeURIComponent(needle || kontak)}&limit=200&options=0`);
  return ((json?.items || []) as any[]).filter((l) => normalizeKontak(l.kontak) === target);
}

/* ─────────────────────────── helper pesanan, produk, wilayah ─────────────────────────── */

/** Nomor HP tanpa awalan negara/0, supaya 08xx = 628xx = 8xx. */
const normPhone = (raw: unknown): string => String(raw || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^62/, '');

/** Kata kunci pencarian pesanan. Nomor HP murni dikirim tanpa awalan 0/62. */
function searchTerm(raw: string): string {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  const bareDigits = s.replace(/[\s+.\-()]/g, '') === digits;
  return bareDigits && digits.length >= 8 ? normPhone(digits) : s;
}

const PESANAN_STATUS_LABEL: Record<string, string> = {
  pending: 'Belum Bayar',
  diproses: 'Lunas',
  dikirim: 'Dikirim',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};
const RETUR_TYPE_LABEL: Record<string, string> = { tukar_size: 'Tukar Size', return: 'Retur' };
const RETUR_STATUS_LABEL: Record<string, string> = {
  diajukan: 'Diajukan',
  disetujui: 'Disetujui',
  barang_diterima: 'Barang diterima',
  pengganti_dikirim: 'Pengganti dikirim',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
};

/** Semua baris Product Knowledge Academy (tabel content_items, type=product). */
async function academyProductRows(): Promise<any[]> {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('Database Academy tidak tersedia.');
  const res = await fetch(`${url}/rest/v1/content_items?type=eq.product&select=data`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Academy ${res.status}`);
  return (await res.json()) as any[];
}

/** Nama wilayah dibandingkan tanpa tanda baca dan dengan "KAB." dibaca "KABUPATEN". */
const normWilayah = (s: unknown): string =>
  String(s || '')
    .toUpperCase()
    .replace(/\bKAB\.?(?=\s|$)/g, 'KABUPATEN')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let kotaCache: Array<{ province: string; city: string }> | null = null;
async function semuaKota(): Promise<Array<{ province: string; city: string }>> {
  if (kotaCache) return kotaCache;
  const prov = await opsFetch('/api/ops/wilayah');
  const provinces: string[] = prov?.provinces || [];
  const lists = await Promise.all(
    provinces.map(async (province) => {
      const j = await opsFetch(`/api/ops/wilayah?province=${encodeURIComponent(province)}`);
      return ((j?.cities || []) as string[]).map((city) => ({ province, city }));
    }),
  );
  kotaCache = lists.flat();
  return kotaCache;
}

/**
 * Kunci pembanding: tanpa awalan Kota/Kab./Adm. dan tanpa spasi. Sistem menganggap "Kota Bogor",
 * "Kab. Bogor", dan "Bogor" sebagai satu nama, dan "Sawah Lunto" = "Sawahlunto".
 */
const kunciWilayah = (s: unknown): string =>
  normWilayah(s).replace(/^(KOTA ADM |KOTA |KABUPATEN |ADM )/, '').replace(/ /g, '');

/** Cari satu entri dalam daftar nama: sama (versi kunci) lebih dulu, lalu yang memuat kata itu. */
function cocokkan(input: string, names: string[]): { exact?: string; candidates: string[] } {
  const q = kunciWilayah(input);
  if (!q) return { candidates: [] };
  const sama = names.filter((n) => kunciWilayah(n) === q);
  if (sama.length === 1) return { exact: sama[0], candidates: sama };
  if (sama.length > 1) return { candidates: sama };
  const memuat = names.filter((n) => {
    const k = kunciWilayah(n);
    return k !== '' && (k.includes(q) || q.includes(k));
  });
  return { candidates: memuat };
}

/* ─────────────────────────── pelanggan baru/lama + promo cover ─────────────────────────── */

/** Status pesanan yang membuat customer dianggap LAMA. Belum Bayar dan Dibatalkan tidak dihitung (aturan bot). */
const STATUS_TERHITUNG = new Set(['diproses', 'dikirim', 'selesai']);
const COVER_THOBE = 'Cover Thobe + Hanger';
const COVER_KOKO = 'Cover Koko + Hanger';

/** Stok efektif tiap varian cover (nama varian -> jumlah). null = tidak terbaca. */
async function stokCover(): Promise<Map<string, number> | null> {
  try {
    const j = await opsFetch('/api/ops/product-variants?for=sale');
    const items = ((j?.items || []) as any[]).filter((v) => String(v.product_id) === 'cover-hanger');
    if (!items.length) return null;
    const m = new Map<string, number>();
    for (const v of items) {
      const stok =
        v.stock && typeof v.stock === 'object'
          ? Object.values(v.stock as Record<string, unknown>).reduce<number>((a, n) => a + (Number(n) || 0), 0)
          : Number(v.stock) || 0;
      const key = String(v.color);
      m.set(key, (m.get(key) || 0) + stok);
    }
    return m;
  } catch {
    return null;
  }
}

/* ─────────────────────────── tabel size Thobe/Kandora ─────────────────────────── */

// Sumber: gambar resmi "Rekomendasi Size Thobe" (6 Nov 2026), sama dengan tabel di
// Samaqu-Academy/supabase/functions/_shared/wa/memory.md. Kolom BB 45..120 per 5 kg.
const SIZE_BB = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120];
const SIZE_TB = [160, 165, 170, 175, 180, 185];
const BB_85_UP_TINGGI = ['L', 'L/XL', 'XL', 'XL/2XL', '2XL', '2XL', '2XL/3XL', '3XL']; // TB 170-185
const BB_85_UP_PENDEK = ['L', 'L/XL', 'XL', 'XL/2XL', '2XL', '2XL/3XL', '3XL', '3XL']; // TB 160-165
const SIZE_GRID: Record<number, string[]> = {
  185: ['M/L', 'M/L', 'M/L', 'L', 'L', 'L', 'L', 'L', ...BB_85_UP_TINGGI],
  180: ['M', 'M', 'M', 'M', 'M', 'M/L', 'L', 'L', ...BB_85_UP_TINGGI],
  175: ['M', 'M', 'M', 'M', 'M', 'M/L', 'L', 'L', ...BB_85_UP_TINGGI],
  170: ['S/M', 'S/M', 'S', 'M', 'M', 'M', 'M/L', 'L', ...BB_85_UP_TINGGI],
  165: ['S', 'S', 'S', 'S/M', 'M', 'M', 'M/L', 'L', ...BB_85_UP_PENDEK],
  160: ['XS', 'XS/S', 'S', 'S/M', 'M', 'M', 'L', 'L', ...BB_85_UP_PENDEK],
};
const SIZE_URUT = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
// Size chart baju (cm): Bahu / Lebar dada / Panjang. Thobe dan Kandora sama.
const SIZE_CM: Record<string, string> = {
  XS: '39/48/137', S: '41/50/140', M: '43/53/142', L: '45/56/144', XL: '48/59/147', '2XL': '50/62/147', '3XL': '52/65/147',
};

/** Nilai grid terdekat di atas dan di bawah: [bawah, atas]; angka pas ada di grid -> keduanya sama. */
function bracket(value: number, grid: number[]): [number, number] {
  const lo = Math.max(...grid.filter((g) => g <= value), grid[0]);
  const hi = Math.min(...grid.filter((g) => g >= value), grid[grid.length - 1]);
  return [lo, hi];
}

type HasilSize = {
  cells: Array<{ tb: number; bb: number; value: string }>;
  sizes: string[];
  luarTabel: boolean;
};

function hitungSize(tbMin: number, tbMax: number, bbMin: number, bbMax: number): HasilSize {
  const luarTabel = tbMin < SIZE_TB[0] || tbMax > SIZE_TB[SIZE_TB.length - 1] || bbMin < SIZE_BB[0] || bbMax > SIZE_BB[SIZE_BB.length - 1];
  const [tbLo] = bracket(tbMin, SIZE_TB);
  const [, tbHi] = bracket(tbMax, SIZE_TB);
  const [bbLo] = bracket(bbMin, SIZE_BB);
  const [, bbHi] = bracket(bbMax, SIZE_BB);
  const cells: HasilSize['cells'] = [];
  for (const tb of SIZE_TB.filter((t) => t >= tbLo && t <= tbHi)) {
    SIZE_BB.forEach((bb, idx) => {
      if (bb >= bbLo && bb <= bbHi) cells.push({ tb, bb, value: SIZE_GRID[tb][idx] });
    });
  }
  const set = new Set<string>();
  for (const c of cells) for (const s of c.value.split('/')) set.add(s);
  const sizes = [...set].sort((a, b) => SIZE_URUT.indexOf(a) - SIZE_URUT.indexOf(b));
  return { cells, sizes, luarTabel };
}

/* ─────────────────────────── server MCP ─────────────────────────── */

function buildServer(): McpServer {
  const server = new McpServer({ name: 'samaqu-online', version: '0.1.0' });

  server.registerTool(
    'cek_ongkir',
    {
      title: 'Cek ongkir J&T',
      description:
        'Hitung tarif pengiriman J&T dari Depok ke kota + kecamatan tujuan. Pakai nama kota dan kecamatan ' +
        'Indonesia. Berat dalam gram, mis. 1000 untuk 1 kg.',
      inputSchema: {
        kota: z.string().min(1).describe('Kota/kabupaten tujuan, mis. Depok, Kab. Bogor, Kota Bandung'),
        kecamatan: z.string().min(1).describe('Kecamatan tujuan, mis. Sukmajaya, Cibinong'),
        berat_gram: z.number().int().positive().describe('Berat paket dalam gram (contoh: 1200)'),
      },
    },
    async ({ kota, kecamatan, berat_gram }) => {
      try {
        const res = await fetch(`${BASE_URL}/api/shipping/jnt-cost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: kota, district: kecamatan, weight: berat_gram }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          return failure(`Gagal cek ongkir: ${body?.error || `HTTP ${res.status}`}. Cek ejaan kota/kecamatan.`);
        }
        return text(
          buildOngkirText({
            rows: Array.isArray(body?.data) ? body.data : [],
            kota,
            kecamatan,
            berat_gram,
            configured: body?.configured,
          }),
        );
      } catch (error) {
        return failure(`Gagal cek ongkir: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  server.registerTool(
    'cari_produk',
    {
      title: 'Cari produk, harga, stok',
      description:
        'Cari produk SAMAQU berdasarkan nama/series/kain/kategori, lengkap dengan harga dan sisa stok per ukuran. ' +
        'Stok yang ditampilkan adalah stok efektif (sama dengan yang dipakai checkout). HARGA yang dikembalikan ' +
        "adalah harga final: jangan diubah, dibulatkan, atau ditulis 'mulai dari' kalau semua ukuran sama.",
      inputSchema: {
        cari: z.string().optional().describe("Kata kunci nama produk / series / kain, mis. 'navy' atau 'jiharkah'"),
        kategori: z.string().optional().describe('Filter kategori: Thobe, Kandora, Koko, Vest, Kabak'),
        limit: z.number().int().min(1).max(20).optional().describe('Jumlah produk maksimal (default 5)'),
      },
    },
    async ({ cari, kategori, limit }) => {
      try {
        const [produkJson, varianJson] = await Promise.all([
          opsFetch('/api/ops/products'),
          opsFetch('/api/ops/product-variants?for=sale'),
        ]);

        let academyPhotos = new Map();
        let academyVideos = new Map();
        let academyProducts = new Map();
        try {
          const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          if (url && key) {
            const res = await fetch(`${url}/rest/v1/content_items?type=eq.product&select=data`, {
              headers: { apikey: key, Authorization: `Bearer ${key}` },
            });
            if (res.ok) {
              const rows = await res.json();
              academyPhotos = buildAcademyPhotoMap(rows);
              academyVideos = buildAcademyVideoMap(rows);
              academyProducts = buildAcademyProductMap(rows);
            }
          }
        } catch {
          // fallback ke foto katalog
        }

        return text(
          buildProductText({
            produkJson,
            varianJson,
            cari,
            kategori,
            limit: limit || 5,
            academyPhotos,
            academyVideos,
            academyProducts,
          }),
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  /* ───── leads ───── */

  server.registerTool(
    'cek_lead_duplikat',
    {
      title: 'Cek lead duplikat',
      description:
        'Cek apakah nomor HP / username IG sudah pernah tercatat sebagai lead. Nomor dinormalisasi ' +
        '(08xx = 628xx = 8xx), jadi format berbeda tetap terdeteksi.',
      inputSchema: { kontak: z.string().min(3).describe('Nomor HP atau username IG yang mau dicek') },
    },
    async ({ kontak }) => {
      try {
        const items = await findLeadsByKontak(kontak);
        if (items.length === 0) return text(`Tidak ada lead dengan kontak ${kontak}.`);
        return text(
          `Sudah ada ${items.length} lead dengan kontak itu:\n` +
            items
              .map(
                (l) =>
                  `• ${formatTanggal(l.tanggal)} · ${l.kontak} · ${l.sumber || '-'} · ${
                    l.status === 'closing' ? 'Closing' : 'Belum Closing'
                  }${l.pic ? ` · PIC ${l.pic}` : ''}`,
              )
              .join('\n'),
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'daftar_lead',
    {
      title: 'Daftar lead',
      description: 'Lihat lead terbaru dari menu Leads /ops, bisa difilter tanggal dan kontak.',
      inputSchema: {
        mulai: z.string().optional().describe('Tanggal awal YYYY-MM-DD'),
        sampai: z.string().optional().describe('Tanggal akhir YYYY-MM-DD'),
        cari: z.string().optional().describe('Cari berdasarkan potongan nomor/kontak'),
        limit: z.number().int().min(1).max(100).optional().describe('Jumlah baris (default 20)'),
      },
    },
    async ({ mulai, sampai, cari, limit }) => {
      try {
        const qs = new URLSearchParams();
        qs.set('limit', String(limit || 20));
        qs.set('options', '0');
        if (mulai) qs.set('start', mulai);
        if (sampai) qs.set('end', sampai);
        if (cari) qs.set('search', cari);
        const json = await opsFetch(`/api/ops/leads?${qs.toString()}`);
        const items: any[] = json?.items || [];
        if (items.length === 0) return text('Tidak ada lead pada filter itu.');
        return text(
          `${items.length} lead (total ${json?.count ?? items.length}):\n` +
            items
              .map(
                (l) =>
                  `• ${formatTanggal(l.tanggal)} ${l.jam || ''} · ${l.kontak} · ${l.sumber || '-'} · ${l.pic || '-'} · ${
                    l.status === 'closing' ? 'Closing' : 'Belum Closing'
                  }`,
              )
              .join('\n'),
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'opsi_lead',
    {
      title: 'Pilihan PIC & produk',
      description: 'Ambil daftar sumber, PIC/penanggung jawab, dan nama produk katalog untuk mengisi form lead.',
      inputSchema: {},
    },
    async () => {
      try {
        const [leadJson, productJson] = await Promise.all([
          opsFetch('/api/ops/leads?limit=1&options=1'),
          opsFetch('/api/ops/products'),
        ]);
        const pics: string[] = leadJson?.options?.pics || [];
        const products = [...new Set(((productJson?.items || []) as any[]).map((p) => p.name).filter(Boolean))];
        return text(
          `Sumber: Website, IG, WA, Meta ads\n` +
            `PIC: ${pics.length ? pics.join(', ') : '-'}\n` +
            `Produk: ${products.length ? products.join(', ') : '-'}`,
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'catat_lead',
    {
      title: 'Catat lead baru',
      description:
        'Simpan lead baru ke menu Leads dashboard /ops. Nomor duplikat ditolak server (sama seperti form). ' +
        'Lead otomatis masuk jadwal Follow-up Center: default besok 10.00 WIB. ' +
        'PIC WAJIB diisi dengan nama depan admin yang mengerjakan lead ini (mis. Lea atau Surya); kalau user ' +
        'belum menyebut nama PIC, TANYAKAN dulu, jangan menebak (akun MCP ini bukan orang). ' +
        'Pakai kering=true untuk uji tanpa menyimpan.',
      inputSchema: {
        kontak: z.string().min(3).describe('No HP atau username IG, mis. 081234567890 atau @username'),
        pic: z.string().min(2).describe('PIC / penanggung jawab = nama depan admin, mis. Lea atau Surya. WAJIB, tanyakan ke user kalau belum disebut.'),
        tanggal: z.string().optional().describe('Tanggal lead masuk, format YYYY-MM-DD. Kosong = hari ini (WIB)'),
        jam: z.string().optional().describe('Jam lead masuk, mis. 10.00. Kosong = jam sekarang (WIB)'),
        sumber: z.enum(['Website', 'IG', 'WA', 'Meta ads']).optional().describe('Sumber lead. Default Website'),
        produk: z.string().optional().describe('Produk yang diminati, boleh nama bebas'),
        status: z.enum(['belum_closing', 'closing']).optional().describe('Status lead, default belum_closing'),
        nominal: z.number().optional().describe('Nominal transaksi (hanya dipakai kalau status closing)'),
        catatan: z.string().optional().describe('Catatan tambahan'),
        followup_wib: z.string().optional().describe('Jadwal follow-up pertama waktu WIB, format YYYY-MM-DDTHH:mm. Kosong = besok 10.00 WIB'),
        kering: z.boolean().optional().describe('true = hanya validasi & cek duplikat, tidak menyimpan'),
      },
    },
    async (input) => {
      try {
        const status = input.status || 'belum_closing';
        const rawKontak = input.kontak.trim();
        const digits = rawKontak.replace(/\D/g, '');
        const kontak =
          digits.length >= 8
            ? digits.startsWith('62')
              ? `0${digits.slice(2)}`
              : digits.startsWith('0')
                ? digits
                : `0${digits}`
            : rawKontak;
        const row = {
          tanggal: input.tanggal || wibToday(),
          jam: input.jam || wibClockNow(),
          kontak,
          sumber: input.sumber || 'Website',
          status,
          nominal: status === 'closing' ? Number(input.nominal) || 0 : 0,
          catatan: (input.catatan || '').trim(),
          produk: input.produk?.trim() || null,
          pic: input.pic.trim(),
          next_followup_at: (input.followup_wib && wibInputToIso(input.followup_wib)) || defaultFollowupIso(),
        };

        if (input.kering) {
          const dup = await findLeadsByKontak(row.kontak);
          return text(
            `DRY-RUN (tidak disimpan):\n` +
              `• ${formatTanggal(row.tanggal)} ${row.jam} · ${row.kontak} · ${row.sumber}\n` +
              `• PIC: ${row.pic} · Produk: ${row.produk || '-'} · ${status === 'closing' ? 'Closing ' + rupiah(row.nominal) : 'Belum Closing'}\n` +
              `• Follow-up: ${formatWaktu(row.next_followup_at)}\n` +
              `• Duplikat: ${dup.length ? `ADA (${dup.length} lead)` : 'tidak ada'}`,
          );
        }

        const json = await opsFetch('/api/ops/leads', {
          method: 'POST',
          body: JSON.stringify({ rows: [row], blockDuplicates: true }),
        });
        const saved = json?.items?.[0];
        if (!saved) return failure('Lead gagal disimpan.');
        return text(
          `Lead tersimpan.\n` +
            `• ${formatTanggal(saved.tanggal)} ${saved.jam || '-'} · ${saved.kontak} · ${saved.sumber || '-'}\n` +
            `• PIC: ${saved.pic || '-'} · Produk: ${saved.produk || '-'} · ${
              saved.status === 'closing' ? 'Closing ' + rupiah(saved.nominal) : 'Belum Closing'
            }\n` +
            `• Follow-up: ${formatWaktu(saved.next_followup_at)}`,
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  /* ───── pesanan, resi, info produk, wilayah (semua baca-saja) ───── */

  server.registerTool(
    'cari_area_ongkir',
    {
      title: 'Cari kota, kecamatan, dan kode pos',
      description:
        'Cari ejaan wilayah yang dipakai sistem (data area J&T) dan kode pos. Tanpa isian: daftar provinsi. ' +
        'Isi `provinsi`: daftar kota/kabupaten. Isi `kota`: daftar kecamatan. Isi `kota` + `kecamatan`: kode pos ' +
        'kecamatan itu. Pakai sebelum cek_ongkir atau saat merapikan alamat supaya ejaan kota/kecamatan sama dengan sistem.',
      inputSchema: {
        provinsi: z.string().optional().describe('Nama provinsi, mis. Jawa Barat'),
        kota: z.string().optional().describe('Kota/kabupaten, mis. Kota Depok, Kab. Bogor, Sawah Lunto'),
        kecamatan: z.string().optional().describe('Kecamatan, mis. Sukmajaya (butuh `kota`)'),
      },
    },
    async ({ provinsi, kota, kecamatan }) => {
      try {
        if (!provinsi && !kota) {
          const j = await opsFetch('/api/ops/wilayah');
          return text(`Provinsi:\n${((j?.provinces || []) as string[]).join(', ')}`);
        }
        if (provinsi && !kota) {
          const prov = await opsFetch('/api/ops/wilayah');
          const m = cocokkan(provinsi, (prov?.provinces || []) as string[]);
          if (!m.exact) {
            return text(
              m.candidates.length
                ? `Provinsi "${provinsi}" belum pasti. Mungkin: ${m.candidates.join(', ')}.`
                : `Provinsi "${provinsi}" tidak dikenali.`,
            );
          }
          const j = await opsFetch(`/api/ops/wilayah?province=${encodeURIComponent(m.exact)}`);
          return text(`Kota/kabupaten di ${m.exact}:\n${((j?.cities || []) as string[]).join(', ')}`);
        }

        const kotaList = await semuaKota();
        const pool = provinsi
          ? kotaList.filter((k) => normWilayah(k.province) === normWilayah(provinsi))
          : kotaList;
        const mk = cocokkan(String(kota), pool.map((k) => k.city));
        if (!mk.exact) {
          if (!mk.candidates.length) {
            return text(`Kota "${kota}" tidak dikenali di data area J&T. Coba nama lain (mis. "Kota Depok", "Kab. Bogor").`);
          }
          const lines = mk.candidates
            .slice(0, 15)
            .map((c) => `• ${c} (${pool.find((k) => k.city === c)?.province || '-'})`);
          return text(`Nama "${kota}" cocok dengan beberapa kota/kabupaten. Pilih salah satu:\n${lines.join('\n')}`);
        }
        const city = mk.exact;
        const province = pool.find((k) => k.city === city)?.province || '-';
        const dj = await opsFetch(`/api/ops/wilayah?city=${encodeURIComponent(city)}`);
        const districts: string[] = dj?.districts || [];
        if (!kecamatan) {
          return text(`Kecamatan di ${city} (${province}):\n${districts.join(', ') || '-'}`);
        }
        const md = cocokkan(kecamatan, districts);
        if (!md.exact) {
          return text(
            md.candidates.length
              ? `Kecamatan "${kecamatan}" belum pasti di ${city}. Mungkin: ${md.candidates.slice(0, 15).join(', ')}.`
              : `Kecamatan "${kecamatan}" tidak ada di ${city}. Kecamatan yang ada: ${districts.join(', ') || '-'}.`,
          );
        }
        const pj = await opsFetch(
          `/api/ops/wilayah?city=${encodeURIComponent(city)}&district=${encodeURIComponent(md.exact)}`,
        );
        const codes: string[] = pj?.postal_codes || [];
        return text(
          `Provinsi: ${province}\nKota/Kabupaten: ${city}\nKecamatan: ${md.exact}\n` +
            `Kode pos: ${codes.length ? codes.join(', ') : 'belum ada di data (jangan ditebak)'}`,
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'cek_pesanan',
    {
      title: 'Cek pesanan, retur & status kirim (baca-saja)',
      description:
        'Cari pesanan SAMAQU berdasarkan nomor WhatsApp, nomor pesanan, nomor retur, atau nomor resi (resi masuk/keluar ' +
        'retur). HANYA MEMBACA. Hasilnya berisi status pesanan, nomor resi, status pengiriman J&T, dan data retur/tukar ' +
        'size kalau ada. Resi kosong berarti pesanan belum diserahkan ke J&T: jangan bilang sudah dikirim.',
      inputSchema: {
        cari: z.string().min(3).describe('Nomor WhatsApp (08xx/628xx), nomor pesanan (SMQ-/CYO-/OPS-), nomor retur (RTS-), atau nomor resi. Jangan nama saja.'),
        limit: z.number().int().min(1).max(10).optional().describe('Jumlah pesanan maksimal (default 5)'),
      },
    },
    async ({ cari, limit }) => {
      try {
        // WAJIB identitas unik: nama saja bisa cocok ke pesanan customer lain.
        const raw = String(cari).trim();
        const digits = raw.replace(/\D/g, '');
        const isPhone = digits.length >= 8 && raw.replace(/[\s+.\-()]/g, '') === digits;
        const isOrderNo = /^(SMQ|CYO|OPS)-/i.test(raw);
        const isReturnNo = /^RTS-/i.test(raw);
        const isAwb = /^JO[0-9A-Z]{6,}$/i.test(raw);
        if (!isPhone && !isOrderNo && !isReturnNo && !isAwb) {
          return text(
            'Pencarian pesanan harus memakai nomor WhatsApp, nomor pesanan (SMQ-/CYO-/OPS-), nomor retur (RTS-), atau nomor resi. Jangan pakai nama saja. Tanya nomor HP customer dulu.',
          );
        }
        const term = searchTerm(raw);
        const qs = new URLSearchParams();
        qs.set('search', term);
        qs.set('limit', String(limit || 5));
        qs.set('include_items', '1');
        const [json, returJson] = await Promise.all([
          opsFetch(`/api/ops/orders?${qs.toString()}`),
          opsFetch('/api/ops/returns?limit=1000'),
        ]);

        const phone = isPhone ? normPhone(raw) : '';
        const needle = term.toLowerCase();
        const awbNeedle = raw.toUpperCase().replace(/\s+/g, '');
        const orders = ((json?.orders || []) as any[]).filter((o) => {
          if (isPhone) return normPhone(o.customer_whatsapp) === phone;
          return [o.order_number, o.customer_name, o.awb_no]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle));
        });
        const returns = ((returJson?.items || []) as any[]).filter((r) => {
          if (isPhone) return normPhone(r.customer_whatsapp) === phone;
          const awbs = [r.shipping_in_awb, r.shipping_out_awb]
            .filter(Boolean)
            .map((v) => String(v).toUpperCase().replace(/\s+/g, ''));
          if (awbNeedle && awbs.some((v) => v.includes(awbNeedle))) return true;
          return [r.return_number, r.order_number, r.customer_name]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle));
        });

        if (!orders.length && !returns.length) {
          return text(
            `Tidak ada pesanan atau retur yang cocok dengan "${cari}". Minta nomor pesanan (OPS-...), nomor retur (RTS-...), nomor resi, atau nomor HP pemesan.`,
          );
        }

        const trackingByAwb = new Map<string, string>();
        await Promise.all(
          orders
            .filter((o) => o.awb_no)
            .slice(0, 5)
            .map(async (o) => {
              const status = await fetchJntStatus(BASE_URL, o.awb_no);
              if (status) trackingByAwb.set(String(o.awb_no), status);
            }),
        );

        const blocks: string[] = [];
        if (orders.length) {
          const lines = orders.map((o) => {
            const items = ((o.order_items || []) as any[])
              .map(
                (i) =>
                  `${i.product_name || '-'}${i.series ? ` ${i.series}` : ''}${i.kain ? ` ${i.kain}` : ''}` +
                  `${i.color && i.color !== 'default' ? ` ${i.color}` : ''}${i.size ? ` ${i.size}` : ''}` +
                  ` x${i.quantity || 0} @ ${rupiah(i.price)}`,
              )
              .join(' · ');
            const kirim =
              [o.shipping_status, trackingByAwb.get(String(o.awb_no)) || o.tracking_status_text]
                .filter(Boolean)
                .join(' · ') || '-';
            return (
              `• ${o.order_number} · ${o.customer_name || '-'} · ${formatWaktu(o.created_at)}\n` +
              `  Status pesanan: ${PESANAN_STATUS_LABEL[String(o.status || '')] || o.status || '-'}\n` +
              `  Resi J&T: ${o.awb_no || 'belum ada'} · Status kirim: ${kirim}\n` +
              `  Item: ${items || '-'} · Total: ${rupiah(o.total)}`
            );
          });
          blocks.push(`${orders.length} pesanan ditemukan (baca-saja):\n${lines.join('\n')}`);
        }
        if (returns.length) {
          const lines = returns.map((r) => {
            const items = ((r.items || []) as any[])
              .map(
                (i) =>
                  `${i.product_name || '-'}${i.color && i.color !== 'default' ? ` ${i.color}` : ''}` +
                  `${i.size ? ` ${i.size}` : ''}${i.replacement_size ? ` → ${i.replacement_size}` : ''} x${i.qty || 0}`,
              )
              .join(' · ');
            return (
              `• ${r.return_number} · ${RETUR_TYPE_LABEL[String(r.type || '')] || r.type || '-'} · ` +
              `${RETUR_STATUS_LABEL[String(r.status || '')] || r.status || '-'} · ${formatWaktu(r.created_at)}\n` +
              `  Pesanan: ${r.order_number || '-'} · ${r.customer_name || '-'} · ${r.customer_whatsapp || '-'}\n` +
              `  Resi masuk: ${r.shipping_in_awb || 'belum ada'} · Resi keluar: ${r.shipping_out_awb || 'belum ada'}\n` +
              `  Pengganti diterima: ${r.replacement_delivered_at ? formatWaktu(r.replacement_delivered_at) : 'belum'}\n` +
              `  Alasan: ${r.reason || '-'}\n  Item: ${items || '-'}`
            );
          });
          blocks.push(`${returns.length} retur/tukar size ditemukan (baca-saja):\n${lines.join('\n')}`);
        }
        return text(blocks.join('\n\n'));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'cek_resi',
    {
      title: 'Cek status resi J&T',
      description:
        'Cek status pelacakan J&T langsung dari nomor resi. Pakai kalau customer menyebut nomor resi atau cek_pesanan ' +
        'tidak menemukan order-nya. Jangan menyuruh customer membuka situs J&T.',
      inputSchema: { resi: z.string().min(8).describe('Nomor resi J&T, mis. JO0330311502') },
    },
    async ({ resi }) => {
      try {
        const awb = String(resi).trim().toUpperCase();
        if (!/^[A-Z0-9]{8,30}$/.test(awb)) return failure('Nomor resi tidak valid. Minta nomor resi J&T yang benar.');
        const status = await fetchJntStatus(BASE_URL, awb);
        const link = `https://www.samaqu.id/id/cek-resi?awb=${encodeURIComponent(awb)}`;
        if (!status) return text(`Resi ${awb} belum ditemukan di pelacakan J&T.\nCek SAMAQU: ${link}`);
        return text(`Resi ${awb}: ${status}\nCek SAMAQU: ${link}`);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'info_series',
    {
      title: 'Info series Thobe',
      description:
        'Ambil penjelasan dan foto resmi tiap series Thobe (Imron, Jiharkah, Nahawand, Bayati, Karim, Imalah). ' +
        'Pakai saat customer tanya beda series atau ciri kerah/placket.',
      inputSchema: { series: z.string().optional().describe('Nama series (opsional), mis. Imron / Bayati') },
    },
    async ({ series }) => {
      try {
        const rows = await academyProductRows();
        const all = rows
          .map((row) => row?.data)
          .filter((d) => d && String(d.category || '').toLowerCase() === 'product series' && String(d.name || '').trim());
        if (!all.length) return text('Data series belum ada di Product Knowledge.');
        const q = String(series || '').trim().toLowerCase();
        const picked = q
          ? all.filter((d) => {
              const name = String(d.name || '').toLowerCase();
              return name.includes(q) || q.includes(name);
            })
          : all;
        if (!picked.length) {
          return text(`Series "${series}" tidak ditemukan. Series yang ada: ${all.map((d) => d.name).join(', ')}.`);
        }
        const body = picked
          .map((d) =>
            [
              `**${d.name}**`,
              d.collar ? `Kerah: ${d.collar}` : '',
              d.placket ? `Placket: ${d.placket}` : '',
              d.description ? `Deskripsi: ${d.description}` : '',
              d.characteristics ? `Ciri: ${String(d.characteristics).replace(/\n/g, '; ')}` : '',
              d.image ? `Foto: ${d.image}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n\n');
        return text(`${body}\n\nJelaskan bedanya dalam 2-3 kalimat pendek. Video series khusus admin, jangan dibagikan ke customer.`);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'info_bahan',
    {
      title: 'Info bahan/kain',
      description:
        'Ambil penjelasan dan foto resmi tiap bahan/kain SAMAQU (mis. B-01, B-02, A-02). Pakai saat customer bertanya ' +
        'jenis bahan atau karakter kain.',
      inputSchema: { bahan: z.string().optional().describe('Nama atau kode bahan (opsional), mis. B-01') },
    },
    async ({ bahan }) => {
      try {
        const rows = await academyProductRows();
        const all = rows
          .map((row) => row?.data)
          .filter((d) => d && String(d.category || '').toLowerCase() === 'fabric collection' && String(d.name || '').trim());
        if (!all.length) return text('Data bahan belum ada di Product Knowledge.');
        const q = String(bahan || '').trim().toLowerCase();
        const picked = q
          ? all.filter((d) => {
              const name = String(d.name || '').toLowerCase();
              const code = String(d.code || '').toLowerCase();
              return name.includes(q) || code.includes(q) || (code && q.includes(code));
            })
          : all;
        if (!picked.length) {
          return text(`Bahan "${bahan}" tidak ditemukan. Bahan yang ada: ${all.map((d) => d.name).join(', ')}.`);
        }
        const body = picked
          .map((d) =>
            [
              `**${d.name}**${d.code ? ` (${d.code})` : ''}`,
              d.composition ? `Komposisi: ${d.composition}` : '',
              d.gsm ? `GSM: ${d.gsm}` : '',
              d.characteristics ? `Karakteristik: ${String(d.characteristics).replace(/\n/g, '; ')}` : '',
              d.advantages ? `Keunggulan: ${String(d.advantages).replace(/\n/g, '; ')}` : '',
              d.extra ? `Info tambahan: ${String(d.extra).replace(/\n/g, '; ')}` : '',
              d.image ? `Foto: ${d.image}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n\n');
        return text(`${body}\n\nJelaskan singkat dalam 2-3 kalimat.`);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'detail_produk',
    {
      title: 'Detail produk Academy',
      description:
        'Ambil detail produk dari Product Knowledge Academy: deskripsi, keunggulan, bahan, ukuran, dan cara menjelaskan ' +
        'ke customer. Untuk harga/stok tetap pakai cari_produk.',
      inputSchema: { produk: z.string().min(2).describe('Nama atau series produk, mis. Karim / Thobe Karim') },
    },
    async ({ produk }) => {
      try {
        // Ejaan katalog kadang beda (produk "Coffe", warna "Coffee").
        const normName = (value: unknown) =>
          String(value || '').toLowerCase().replace(/\bcoffe\b/g, 'coffee').replace(/\s+/g, ' ').trim();
        const q = normName(produk);
        if (!q) return failure('Nama produk wajib diisi.');
        const map = buildAcademyProductMap(await academyProductRows());
        // Kunci map = series/nama/kode. Skor per kata supaya kunci series saja ("kandora") tidak menang
        // atas nama lengkap ("kandora coffe brown").
        const normMap = new Map<string, any>();
        for (const [key, value] of map as Map<string, any>) {
          const name = normName(key);
          if (name && !normMap.has(name)) normMap.set(name, value);
        }
        let found = normMap.get(q);
        if (!found) {
          const words = q.split(/\s+/).filter(Boolean);
          let bestScore = 0;
          let bestName = '';
          let bestValue: any = null;
          for (const [name, value] of normMap) {
            const score = name.split(/\s+/).filter((w) => words.includes(w)).length;
            if (score > bestScore || (score === bestScore && score > 0 && name.length > bestName.length)) {
              bestScore = score;
              bestName = name;
              bestValue = value;
            }
          }
          if (bestValue && bestScore >= Math.min(2, words.length)) found = bestValue;
        }
        if (found) return text(formatAcademyProductDetail(found));

        // Cadangan: Product Knowledge belum punya entri ini, pakai katalog.
        try {
          const json = await opsFetch('/api/ops/products');
          const match = ((json?.items || []) as any[]).find((p) => {
            const name = normName(p.name);
            return name.includes(q) || q.includes(name);
          });
          if (match) {
            const colors = (Array.isArray(match.colors) ? match.colors : String(match.colors || '').split(/[,/]/))
              .map((c: unknown) => String(c || '').trim())
              .filter(Boolean)
              .join(', ');
            return text(
              [
                `${match.name} — ${match.category || '-'}`,
                `Kain: ${match.jenis_kain?.name || match.kain || '-'}`,
                colors ? `Warna: ${colors}` : '',
                `Harga: ${rupiah(match.price)}`,
                'Keunggulan/seri belum ada di Product Knowledge, sampaikan hanya fakta ini.',
              ]
                .filter(Boolean)
                .join('\n'),
            );
          }
        } catch {
          // katalog opsional
        }
        return text(`Detail produk "${produk}" belum ada di Product Knowledge Academy.`);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'cek_pelanggan',
    {
      title: 'Cek pelanggan baru atau lama + kelayakan promo cover',
      description:
        'Cek apakah nomor WhatsApp ini customer BARU atau LAMA dari riwayat pesanan (Lunas, Dikirim, Selesai dihitung; ' +
        'Belum Bayar dan Dibatalkan tidak). Status lead TIDAK dipakai. Juga memutuskan kelayakan promo free cover + hanger ' +
        '(hanya customer baru DAN stok cover ada). Pakai sebelum menawarkan promo atau cross-selling cover. HANYA MEMBACA.',
      inputSchema: {
        nomor: z.string().min(8).describe('Nomor WhatsApp customer (08xx / 628xx / +628xx)'),
        kategori: z.enum(['Thobe', 'Kandora', 'Koko']).optional().describe('Kategori produk yang dibeli, untuk memilih cover yang cocok'),
      },
    },
    async ({ nomor, kategori }) => {
      try {
        const phone = normPhone(nomor);
        if (phone.length < 8) return failure('Nomor tidak valid. Minta nomor WhatsApp customer yang benar.');
        const json = await opsFetch(`/api/ops/orders?search=${encodeURIComponent(phone)}&limit=50`);
        if (!Array.isArray(json?.orders)) {
          return text('Riwayat pesanan TIDAK TERBACA. Jangan menjanjikan promo; tanya admin.');
        }
        const orders = (json.orders as any[]).filter((o) => normPhone(o.customer_whatsapp) === phone);
        const terhitung = orders.filter((o) => STATUS_TERHITUNG.has(String(o.status || '')));
        const lines: string[] = [`Nomor ${nomor}: ${orders.length} pesanan ditemukan, ${terhitung.length} terhitung (Lunas/Dikirim/Selesai).`];
        if (orders.length) {
          lines.push(
            'Riwayat terbaru: ' +
              orders
                .slice(0, 5)
                .map((o) => `${o.order_number} (${PESANAN_STATUS_LABEL[String(o.status || '')] || o.status || '-'}, ${formatTanggal(o.created_at)})`)
                .join('; '),
          );
        }
        const baru = terhitung.length === 0;
        lines.push(baru ? 'STATUS: customer BARU.' : 'STATUS: customer LAMA.');

        if (!baru) {
          lines.push('PROMO free cover + hanger: TIDAK dijanjikan (customer lama). Pengecualian khusus hanya dari admin; kalau customer menagih, teruskan ke admin.');
        } else {
          const stok = await stokCover();
          const cover = kategori === 'Koko' ? COVER_KOKO : COVER_THOBE;
          if (!stok) {
            lines.push('PROMO free cover + hanger: stok cover TIDAK TERBACA. Jangan menjanjikan; tanya admin.');
          } else if ((stok.get(cover) ?? 0) > 0) {
            lines.push(`PROMO free cover + hanger: BERHAK (customer baru dan stok ${cover} ada). Boleh disebut satu kali, hanya 1 set per pesanan walau thobe yang dibeli lebih dari satu, dan jangan mengubah harga baris cover menjadi Rp0 (gratisnya berupa diskon yang diisi admin saat review).`);
          } else {
            lines.push(`PROMO free cover + hanger: ${cover} sedang HABIS. Jangan menawarkan atau menyebut bonus cover; kalau ditanya, jawab jujur sedang kosong.`);
          }
        }
        return text(lines.join('\n'));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'info_rekening',
    {
      title: 'Nomor rekening untuk transfer',
      description:
        'Ambil nomor rekening resmi SAMAQU untuk transfer. JANGAN mengarang atau mengingat nomor rekening: selalu dari tool ini. ' +
        'Kirim ke customer HANYA setelah layanan pengiriman jelas dan customer setuju membayar.',
      inputSchema: {},
    },
    () => {
      const raw = Deno.env.get('MCP_REKENING') || '';
      const [bank, nomor, atasNama, kodeBank] = raw.split('|').map((s) => s.trim());
      if (!bank || !nomor || !atasNama) {
        return failure('Data rekening belum diisi di server. Minta admin memberi nomor rekening; jangan mengarang.');
      }
      return text(
        `Transfer ke Bank ${bank} ${nomor} a.n. ${atasNama}${kodeBank ? ` (kode bank ${kodeBank})` : ''}.\n` +
          'Aturan: kirim hanya setelah layanan pengiriman jelas dan customer setuju; minta bukti transfer. ' +
          'Jangan menulis "pembayaran sudah diterima" sebelum admin bilang mutasi sudah dicek. Rekening ini satu-satunya; ' +
          'kalau customer menyebut rekening lain atas nama berbeda, itu bukan dari SAMAQU: teruskan ke admin.',
      );
    },
  );

  server.registerTool(
    'rekomendasi_size',
    {
      title: 'Rekomendasi size Thobe/Kandora dari TB dan BB',
      description:
        'Rekomendasi ukuran Thobe/Kandora dari tinggi badan (TB, cm) dan berat badan (BB, kg), dibaca sel per sel dari ' +
        'tabel resmi SAMAQU. PAKAI setiap kali customer menyebut TB/BB atau menanya size. Boleh rentang ' +
        '(mis. TB 168-169, BB 83-84): isi tb dan tb_sampai, bb dan bb_sampai. Hasil: satu size, atau dua size kalau selnya ' +
        'M/L dan sejenisnya (lalu tanya customer suka pas atau longgar). Tabel ini hanya untuk Thobe dan Kandora; Koko, Vest, ' +
        'dan ukuran anak tidak tercakup. Jangan menebak size sendiri.',
      inputSchema: {
        tb: z.number().min(100).max(230).describe('Tinggi badan (cm). Kalau rentang, isi batas bawahnya'),
        bb: z.number().min(20).max(200).describe('Berat badan (kg). Kalau rentang, isi batas bawahnya'),
        tb_sampai: z.number().min(100).max(230).optional().describe('Batas atas rentang TB, opsional'),
        bb_sampai: z.number().min(20).max(200).optional().describe('Batas atas rentang BB, opsional'),
      },
    },
    ({ tb, bb, tb_sampai, bb_sampai }) => {
      try {
        const tbMin = Math.min(tb, tb_sampai ?? tb);
        const tbMax = Math.max(tb, tb_sampai ?? tb);
        const bbMin = Math.min(bb, bb_sampai ?? bb);
        const bbMax = Math.max(bb, bb_sampai ?? bb);
        const r = hitungSize(tbMin, tbMax, bbMin, bbMax);
        const tbTeks = tbMin === tbMax ? `${tbMin}` : `${tbMin}-${tbMax}`;
        const bbTeks = bbMin === bbMax ? `${bbMin}` : `${bbMin}-${bbMax}`;
        const baris: string[] = [`Rekomendasi size Thobe/Kandora untuk TB ${tbTeks} cm, BB ${bbTeks} kg:`];
        baris.push(
          'Sel tabel yang dipakai: ' +
            r.cells.map((c) => `TB ${c.tb}/BB ${c.bb} = ${c.value}`).join('; '),
        );

        const semuaSama = r.cells.length > 0 && r.cells.every((c) => c.value === r.cells[0].value);
        if (semuaSama && r.sizes.length === 1) {
          baris.push(`HASIL: ${r.sizes[0]} (semua sel yang dipakai sama). Jawab langsung satu size.`);
        } else if (r.sizes.length === 1) {
          baris.push(`HASIL: ${r.sizes[0]}. Jawab langsung satu size.`);
        } else {
          const kecil = r.sizes[0];
          const besar = r.sizes[r.sizes.length - 1];
          baris.push(
            `HASIL: antara ${r.sizes.join(', ')} (selnya berbeda atau dua size). Tanya customer SEKALI: pas di badan (${kecil}) ` +
              `atau agak longgar (${besar})? Lalu berikan satu size. Kalau customer bingung, pilih ${besar} ` +
              `(lebih nyaman, panjang bisa dipotong di tailor).`,
          );
        }

        if (r.luarTabel) {
          baris.push('CATATAN: TB atau BB di luar rentang tabel (TB 160-185, BB 45-120). Ini hanya perkiraan dari sel terdekat; minta admin mengecek, jangan dijanjikan pasti.');
        }
        if (r.sizes.includes('3XL')) baris.push('CATATAN: 3XL belum tersedia. Sampaikan jujur dan teruskan ke admin.');
        if (r.sizes.includes('2XL')) baris.push('CATATAN: stok 2XL (di database tertulis XXL) sangat sedikit. Cek cari_produk dulu sebelum menjanjikan.');
        baris.push(
          'Ukuran sama untuk semua series (Imron, Jiharkah, Nahawand, Bayati, Karim, Imalah). Size chart baju (cm, Bahu/Lebar dada/Panjang): ' +
            r.sizes.map((s) => `${s} ${SIZE_CM[s]}`).join(', ') +
            '. Sebut angka cm hanya kalau customer menanya detail.',
        );
        baris.push('Kependekan: ada lipatan cadangan sekitar 7 cm di bawah. Kepanjangan: bisa dipotong di tailor. Tukar ukuran boleh, ongkir kirim balik ditanggung customer.');
        return text(baris.join('\n'));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}

/* ─────────────────────────── HTTP ─────────────────────────── */

const plain = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const owner = await identify(req);
  if (!owner) {
    // Diagnosis penolakan: hanya NAMA header dan panjang/awalan nilai, TIDAK pernah isi token.
    const seen = ['authorization', 'x-api-key', 'x-auth-token'].map((name) => {
      const v = req.headers.get(name);
      if (v === null) return `${name}=tidak-ada`;
      const t = v.trim();
      const shape = /^Bearer\s+smq_/i.test(t) ? 'Bearer+smq_' : t.startsWith('smq_') ? 'smq_' : 'lain';
      return `${name}=ada(len ${t.length}, ${shape})`;
    });
    console.log('[MCP] ditolak 401:', req.method, seen.join(' | '), '| ua:', (req.headers.get('user-agent') || '-').slice(0, 40));
    return plain(401, 'Token tidak valid');
  }

  // Tanpa sesi: server + transport baru untuk tiap permintaan (pola resmi SDK untuk serverless).
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    console.log('[MCP]', req.method, 'oleh', owner);
    return await transport.handleRequest(req);
  } catch (error) {
    console.error('[MCP] gagal:', error instanceof Error ? error.message : error);
    return plain(500, 'Terjadi kesalahan pada server MCP');
  }
});
