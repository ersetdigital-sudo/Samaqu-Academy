import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js';
import { z } from 'npm:zod@4.6.7';
import {
  buildAcademyPhotoMap,
  buildAcademyProductMap,
  buildAcademyVideoMap,
  buildOngkirText,
  buildProductText,
} from '../_shared/wa/tools-core.mjs';

/**
 * MCP SAMAQU versi online (Streamable HTTP, tanpa sesi).
 *
 * Port dari `tools/mcp-samaqu/index.mjs` (MCP lokal yang tetap jalan). Tool saat ini:
 * `cek_ongkir`, `cari_produk` (baca-saja) dan leads: `cek_lead_duplikat`, `daftar_lead`,
 * `opsi_lead` (baca) serta `catat_lead` (TULIS, PIC wajib diisi). Tool yang mengirim WA atau
 * membuat transaksi SENGAJA belum ada di sini.
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
