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
 * FASE 0 (uji coba): hanya dua tool baca-saja, `cek_ongkir` dan `cari_produk`, port dari
 * `tools/mcp-samaqu/index.mjs` (MCP lokal yang tetap jalan). Tool yang menulis data atau
 * mengirim WA SENGAJA belum ada di sini.
 *
 * Keamanan:
 * - Setiap permintaan wajib membawa token (`Authorization: Bearer <token>`, atau `x-api-key` /
 *   `x-auth-token` karena Claude mengunci header Authorization). Yang disimpan di server
 *   hanya hash SHA-256 token (secret `MCP_TOKENS`, format `nama:<hash hex>,nama2:<hash hex>`), jadi
 *   token asli tidak bisa dibaca dari Supabase. Mencabut satu orang = menghapus satu entri.
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
  // Format secret: `nama:hash,nama2:hash2` (teks polos, tanpa tanda kutip supaya aman di env-file).
  // Semua entri diperiksa (tanpa berhenti dini) supaya waktu respons tidak membocorkan apa pun.
  for (const entry of (Deno.env.get('MCP_TOKENS') || '').split(',')) {
    const sep = entry.indexOf(':');
    if (sep <= 0) continue;
    const name = entry.slice(0, sep).trim();
    const hash = entry.slice(sep + 1).trim().toLowerCase();
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

async function opsFetch(pathname: string, retry = true): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    session = null;
    return opsFetch(pathname, false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Permintaan ke ${pathname} gagal (HTTP ${res.status})`);
  return body;
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
