import type { MimoToolDefinition } from '../_shared/mimo-tools.ts';
import {
  buildAcademyPhotoMap,
  buildAcademyVideoMap,
  buildAcademyProductMap,
  buildOngkirText,
  buildProductText,
  fetchJntStatus,
  formatAcademyProductDetail,
} from '../_shared/wa/tools-core.mjs';
import {
  buildClosingAdminMessage,
  buildClosingAddress,
  missingClosingFields,
  normalizePhone,
} from '../_shared/wa/closing-core.mjs';

/**
 * Tool bot WhatsApp server SAMAQU.
 *
 * Semua akses data lewat API /api/ops/* milik situs SAMAQU (login admin), BUKAN SQL
 * langsung — supaya aturan stok/harga/lead tetap dihitung sistem yang sudah ada.
 * Ini port dari `tools/mcp-samaqu/index.mjs` supaya perilakunya identik.
 */

const BASE_URL = (Deno.env.get('SAMAQU_BASE_URL') || 'https://www.samaqu.id').replace(/\/+$/, '');
const SUPABASE_URL = Deno.env.get('SAMAQU_SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SAMAQU_SUPABASE_ANON_KEY') || '';
const ADMIN_EMAIL = Deno.env.get('SAMAQU_ADMIN_EMAIL') || '';
const ADMIN_PASSWORD = Deno.env.get('SAMAQU_ADMIN_PASSWORD') || '';

export const ADMIN_WA = String(Deno.env.get('SAMAQU_ADMIN_WA') || '6289601062990').replace(/\D/g, '');

let session: { token: string; expiresAt: number } | null = null;

function missingEnv(): string[] {
  const list: Array<[string, string]> = [
    ['SAMAQU_SUPABASE_URL', SUPABASE_URL],
    ['SAMAQU_SUPABASE_ANON_KEY', ANON_KEY],
    ['SAMAQU_ADMIN_EMAIL', ADMIN_EMAIL],
    ['SAMAQU_ADMIN_PASSWORD', ADMIN_PASSWORD],
  ];
  return list.filter(([, value]) => !value).map(([key]) => key);
}

async function login(): Promise<string> {
  const missing = missingEnv();
  if (missing.length) throw new Error(`Secret belum diisi: ${missing.join(', ')}`);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    throw new Error(`Login admin gagal (${res.status})`);
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

export async function opsFetch(pathname: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // Penanda siapa yang mengklaim/membalas pesan (dipakai UI + audit).
      'x-bot-source': 'server',
      ...(init.headers || {}),
    },
  });
  if (res.status === 401 && retry) {
    session = null;
    return opsFetch(pathname, init, false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Permintaan ke ${pathname} gagal (HTTP ${res.status})`);
  }
  return body;
}

/* ─────────────────────────── format ─────────────────────────── */

const rupiah = (value: unknown) => 'Rp' + Number(value || 0).toLocaleString('id-ID');

function formatWaktu(iso: unknown): string {
  if (!iso) return '-';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '-';
  const tanggal = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(d);
  const jam = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).format(d).replace(':', '.');
  return `${tanggal} ${jam}`;
}

function normPhone(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^62/, '');
}

function searchTerm(raw: string): string {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  const bare = s.replace(/[\s+.\-()]/g, '') === digits;
  return bare && digits.length >= 8 ? normPhone(digits) : s;
}

const PESANAN_STATUS_LABEL: Record<string, string> = {
  pending: 'Belum Bayar', diproses: 'Lunas', dikirim: 'Dikirim', selesai: 'Selesai', dibatalkan: 'Dibatalkan',
};
const RETUR_TYPE_LABEL: Record<string, string> = { tukar_size: 'Tukar Size', return: 'Retur' };
const RETUR_STATUS_LABEL: Record<string, string> = {
  diajukan: 'Diajukan', disetujui: 'Disetujui', barang_diterima: 'Barang diterima',
  pengganti_dikirim: 'Pengganti dikirim', selesai: 'Selesai', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan',
};

/* ─────────────────────────── skema tool ─────────────────────────── */

export const WA_TOOLS: MimoToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'cari_produk',
      description:
        'Cari produk SAMAQU: harga final, stok efektif per ukuran, dan berat per ukuran. WAJIB dipakai ' +
        'sebelum menyebut harga/stok/ukuran/warna. Harga jangan dibulatkan dan jangan "mulai dari" kalau sama. ' +
        'Hasil berisi field foto (URL gambar) dan video (URL mp4) yang bisa dikirim lewat kirim_wa url.',
      parameters: {
        type: 'object',
        properties: {
          cari: { type: 'string', description: "Kata kunci nama/series/kain, mis. 'navy' atau 'jiharkah'" },
          kategori: { type: 'string', description: 'Thobe, Kandora, Koko, Vest, Kabak' },
          limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Jumlah produk maksimal (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cek_ongkir',
      description: 'Hitung tarif J&T dari Depok ke kota + kecamatan tujuan. Berat dalam gram.',
      parameters: {
        type: 'object',
        properties: {
          kota: { type: 'string', description: 'Kota/kabupaten tujuan' },
          kecamatan: { type: 'string', description: 'Kecamatan tujuan' },
          berat_gram: { type: 'integer', description: 'Berat paket dalam gram' },
        },
        required: ['kota', 'kecamatan', 'berat_gram'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cari_area_ongkir',
      description: 'Cari kecamatan yang dikenali J&T untuk sebuah nama KOTA. Pakai sebelum cek_ongkir kalau ejaan ragu.',
      parameters: {
        type: 'object',
        properties: {
          kota: { type: 'string', description: 'Nama kota/kabupaten, mis. Kota Depok' },
        },
        required: ['kota'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cek_pesanan',
      description:
        'Cari pesanan, retur/tukar size, dan status kirim (read-only) berdasarkan nama, nomor WA, nomor pesanan ' +
        '(OPS-/SMQ-/CYO-), nomor retur (RTS-), atau nomor resi. Resi kosong = belum dikirim.',
      parameters: {
        type: 'object',
        properties: {
          cari: { type: 'string', description: 'Nama, nomor WA, nomor pesanan, nomor retur, atau nomor resi' },
          limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Jumlah pesanan maksimal (default 5)' },
        },
        required: ['cari'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cek_lead_duplikat',
      description: 'Cek apakah nomor HP / username IG sudah pernah tercatat sebagai lead.',
      parameters: {
        type: 'object',
        properties: { kontak: { type: 'string', description: 'Nomor HP atau username IG' } },
        required: ['kontak'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'catat_lead',
      description:
        'Simpan lead baru ke menu Leads /ops. Nomor duplikat ditolak server. Status selalu Belum Closing ' +
        'kecuali admin mengubahnya.',
      parameters: {
        type: 'object',
        properties: {
          kontak: { type: 'string', description: 'Nomor HP customer' },
          sumber: { type: 'string', enum: ['Website', 'IG', 'WA', 'Meta ads'], description: 'Default WA' },
          pic: { type: 'string', description: 'PIC, default Agent' },
          produk: { type: 'string', description: 'Produk yang diminati (boleh nama bebas)' },
          catatan: { type: 'string', description: 'Catatan tambahan' },
          status: { type: 'string', enum: ['belum_closing', 'closing'], description: 'Default belum_closing' },
        },
        required: ['kontak'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'catat_closing',
      description:
        'Catat closing AI setelah customer mengirim bukti transfer dan nominalnya terbaca. ' +
        'Jangan dipakai untuk mencatat total/penawaran yang belum dibayar. Wajib isi inbox_id bukti.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor HP customer yang mengirim bukti' },
          nominal: { type: 'integer', minimum: 1000, description: 'Nominal transfer yang terbaca dari bukti' },
          inbox_id: { type: 'string', description: 'id pesan bukti transfer dari pesan_wa_masuk' },
          proof_url: { type: 'string', description: 'URL gambar bukti (media_url), kalau ada' },
          nama: { type: 'string', description: 'Nama penerima' },
          alamat: { type: 'string', description: 'Alamat jalan/RT-RW/patokan' },
          kelurahan: { type: 'string', description: 'Kelurahan/desa (kalau ada)' },
          kecamatan: { type: 'string', description: 'Kecamatan' },
          kota: { type: 'string', description: 'Kota/kabupaten' },
          provinsi: { type: 'string', description: 'Provinsi' },
          kode_pos: { type: 'string', description: 'Kode pos' },
          pesanan: { type: 'string', description: 'Rincian pesanan; tiap baris WAJIB memuat nominal dari tool, mis. "Thobe Mint Karim size S x1 - Rp374.000". Baris Free Cover Hanger tanpa nominal.' },
          kurir: { type: 'string', description: 'Kurir, mis. J&T EZ' },
          ongkir: { type: 'integer', description: 'Ongkir' },
        },
        required: [
          'nomor', 'nominal', 'inbox_id', 'nama', 'alamat', 'kecamatan', 'kota',
          'provinsi', 'kode_pos', 'pesanan',
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detail_produk',
      description:
        'Ambil detail produk dari Product Knowledge Academy: deskripsi, keunggulan, bahan, ukuran, ' +
        'dan cara menjelaskan ke customer. Untuk harga/stok/foto tetap pakai cari_produk.',
      parameters: {
        type: 'object',
        properties: {
          produk: { type: 'string', description: 'Nama atau series produk, mis. Karim / Thobe Karim' },
        },
        required: ['produk'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cek_resi',
      description:
        'Cek status pelacakan J&T langsung dari nomor resi. Pakai kalau customer menyebut nomor resi ' +
        'atau cek_pesanan tidak menemukan order-nya. Jangan menyuruh customer membuka J&T/jet.co.id.',
      parameters: {
        type: 'object',
        properties: {
          resi: { type: 'string', description: 'Nomor resi J&T, mis. JO0330311502' },
        },
        required: ['resi'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buat_draft_transaksi',
      description:
        'Simpan draft transaksi untuk direview admin. TIDAK membuat order, TIDAK memotong stok, ' +
        'TIDAK menandai Lunas. Pakai setelah bukti transfer, alamat lengkap, dan pesanan jelas.',
      parameters: {
        type: 'object',
        properties: {
          inbox_id: { type: 'string', description: 'id pesan bukti/closing dari pesan_wa_masuk' },
          nama: { type: 'string' },
          nomor: { type: 'string' },
          alamat: { type: 'string' },
          kelurahan: { type: 'string' },
          kecamatan: { type: 'string' },
          kota: { type: 'string' },
          provinsi: { type: 'string' },
          kode_pos: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string' },
                product_name: { type: 'string' },
                color: { type: 'string' },
                size: { type: 'string' },
                quantity: { type: 'integer' },
                price: { type: 'integer' },
              },
              required: ['product_id', 'color', 'size', 'quantity'],
            },
          },
          shipping_cost: { type: 'integer' },
          shipping_method: { type: 'string' },
          discount: { type: 'integer' },
          notes: { type: 'string' },
          free_cover_hanger: {
            type: 'boolean',
            description: 'true kalau customer berhak Free Cover Hanger (pembelian pertama, sudah dicek lewat cek_pesanan). Server menambahkan baris Cover Thobe + Hanger harga normal; diskon Rp35.000 diisi admin',
          },
          proof_url: { type: 'string' },
        },
        required: ['inbox_id', 'nama', 'nomor', 'alamat', 'kecamatan', 'kota', 'provinsi', 'kode_pos', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'daftar_lead',
      description: 'Lihat lead terbaru, bisa difilter tanggal dan kontak.',
      parameters: {
        type: 'object',
        properties: {
          mulai: { type: 'string', description: 'Tanggal awal YYYY-MM-DD' },
          sampai: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
          cari: { type: 'string', description: 'Cari potongan nomor/kontak' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'opsi_lead',
      description: 'Ambil daftar sumber, PIC, dan nama produk katalog untuk mengisi form lead.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kirim_wa',
      description:
        'Kirim/balas WhatsApp ke pengirim pesan. Untuk balasan, sertakan inbox_id. Tidak boleh dipakai ' +
        'untuk nomor selain pengirim pesan itu. Kalau customer minta foto, sertakan url foto produk dari cari_produk.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor tujuan (harus sama dengan pengirim inbox_id)' },
          pesan: { type: 'string', description: 'Isi pesan / caption' },
          inbox_id: { type: 'string', description: 'id pesan dari daftar pesan masuk' },
          url: {
            type: 'string',
            description: 'URL foto atau video produk dari field foto/video cari_produk; dikirim sebagai attachment.',
          },
        },
        required: ['nomor', 'pesan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lewati_wa',
      description: 'Tandai pesan masuk tidak perlu dibalas (spam, uji coba, pesan yang sudah digabung).',
      parameters: {
        type: 'object',
        properties: {
          inbox_id: { type: 'string' },
          alasan: { type: 'string', description: 'Alasan, mis. "digabung"' },
        },
        required: ['inbox_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'teruskan_admin',
      description:
        'Kirim ringkasan ke nomor admin SAMAQU kalau pertanyaan tidak bisa dijawab atau butuh admin. ' +
        'Jangan dipakai untuk membalas customer.',
      parameters: {
        type: 'object',
        properties: {
          pesan: { type: 'string', description: 'Ringkasan singkat pertanyaan customer' },
          nomor_customer: { type: 'string' },
          nama_customer: { type: 'string' },
          inbox_id: { type: 'string', description: 'id pesan dari daftar pesan masuk; wajib supaya masuk antrean admin' },
          alasan: { type: 'string', description: 'Alasan singkat, mis. komplain/refund/data tidak ditemukan' },
        },
        required: ['pesan'],
      },
    },
  },
];

/* ─────────────────────────── eksekusi tool ─────────────────────────── */

export interface ToolContext {
  dry: boolean;
  /** inbox_id → nomor pengirim, dari pesan yang diklaim run ini. */
  senders: Map<string, string>;
  /** inbox_id yang sudah dibalas/dilewati, cegah dobel dalam satu run. */
  handled: Set<string>;
  /** Pesan yang akan dikirim (hanya terisi di mode dry, untuk diperiksa). */
  outbox: Array<{ nomor: string; pesan: string; inbox_id?: string }>;
  /** true = pesan pembuka cocok pola iklan (Create Your Price / cara order). */
  adLead?: boolean;
  /** Supabase Academy, untuk catat_closing (tabel wa_closings). */
  service?: any;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

/** Buang baris laporan internal kalau model tidak sengaja menyertakannya. */
function cleanOutgoing(text: string): string {
  // Markup tool tidak boleh keluar ke customer (pernah bocor <tool_call>).
  if (/<tool_call|<function=|<\/?parameter|<parameter=/i.test(text)) return '';
  const lines = String(text || '').split(/\r?\n/);
  // Catatan internal model (CATATAN MODEL / TOOL / BELUM TERJAWAB / status antrean)
  // juga tidak boleh sampai ke customer.
  const internal =
    /^\s*(catatan model|catatan internal|tool\s*:|belum terjawab\s*:|pesan sudah saya siapkan tapi belum terkirim)/i;
  const cut = lines.findIndex(
    (line) => /^\s*(\d+\s+nomor ditangani|laporan\s*:)/i.test(line) || internal.test(line),
  );
  return (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').trim();
}

function parseArgs(raw: string): Record<string, any> {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function findLeadsByKontak(kontak: string): Promise<any[]> {
  const target = normPhone(kontak) || String(kontak || '').toLowerCase().replace(/^@/, '');
  const needle = /^\d+$/.test(target) ? target.slice(-9) : target;
  const json = await opsFetch(`/api/ops/leads?search=${encodeURIComponent(needle || kontak)}&limit=200&options=0`);
  return (json?.items || []).filter((lead: any) => {
    const value = normPhone(lead.kontak) || String(lead.kontak || '').toLowerCase().replace(/^@/, '');
    return value === target;
  });
}

function wibToday(): string {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return w.toISOString().slice(0, 10);
}

function wibClock(): string {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')}`;
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const args = parseArgs(rawArgs);

  try {
    switch (name) {
      case 'cari_produk': {
        const [produkJson, varianJson] = await Promise.all([
          opsFetch('/api/ops/products'),
          opsFetch('/api/ops/product-variants?for=sale'),
        ]);
        let academyPhotos = new Map<string, string>();
        let academyVideos = new Map<string, string>();
        let academyProducts = new Map<string, any>();
        try {
          if (ctx.service) {
            const { data } = await ctx.service
              .from('content_items')
              .select('data')
              .eq('type', 'product');
            academyPhotos = buildAcademyPhotoMap(data || []);
            academyVideos = buildAcademyVideoMap(data || []);
            academyProducts = buildAcademyProductMap(data || []);
          }
        } catch {
          // fallback ke foto katalog
        }
        return {
          text: buildProductText({
            produkJson,
            varianJson,
            cari: String(args.cari || ''),
            kategori: String(args.kategori || ''),
            limit: Number(args.limit) || 5,
            academyPhotos,
            academyVideos,
            academyProducts,
          }),
        };
      }

      case 'cek_ongkir': {
        const body = JSON.stringify({
          city: String(args.kota || ''),
          district: String(args.kecamatan || ''),
          weight: Number(args.berat_gram) || 0,
        });
        const res = await fetch(`${BASE_URL}/api/shipping/jnt-cost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          return { isError: true, text: `Gagal cek ongkir: ${json?.error || `HTTP ${res.status}`}.` };
        }
        return {
          text: buildOngkirText({
            rows: Array.isArray(json?.data) ? json.data : [],
            kota: String(args.kota || ''),
            kecamatan: String(args.kecamatan || ''),
            berat_gram: Number(args.berat_gram) || 0,
            configured: json?.configured,
          }),
        };
      }

      case 'cari_area_ongkir': {
        const kota = String(args.kota || '').trim();
        if (!kota) return { isError: true, text: 'Sebutkan nama kotanya dulu.' };
        const json = await opsFetch(`/api/ops/wilayah?city=${encodeURIComponent(kota)}`);
        const districts = Array.isArray(json?.districts) ? json.districts : [];
        if (!districts.length) {
          return { text: `Kota "${kota}" tidak dikenali. Coba nama lain (mis. "Kota Depok", "Kab. Bogor").` };
        }
        return { text: districts.map((d: string) => `• ${d} — ${kota}`).join('\n') };
      }

      case 'cek_pesanan': {
        const term = searchTerm(String(args.cari || ''));
        const qs = new URLSearchParams();
        qs.set('search', term);
        qs.set('limit', String(Number(args.limit) || 5));
        qs.set('include_items', '1');
        const [json, returJson] = await Promise.all([
          opsFetch(`/api/ops/orders?${qs.toString()}`),
          opsFetch('/api/ops/returns?limit=1000'),
        ]);

        const raw = String(args.cari || '').trim();
        const digits = raw.replace(/\D/g, '');
        const isPhone = digits.length >= 8 && raw.replace(/[\s+.\-()]/g, '') === digits;
        const phone = isPhone ? normPhone(raw) : '';
        const needle = term.toLowerCase();
        const awbNeedle = raw.toUpperCase().replace(/\s+/g, '');

        const orders = (json?.orders || []).filter((o: any) => {
          if (isPhone) return normPhone(o.customer_whatsapp) === phone;
          return [o.order_number, o.customer_name, o.awb_no]
            .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
        });
        const returns = (returJson?.items || []).filter((r: any) => {
          if (isPhone) return normPhone(r.customer_whatsapp) === phone;
          const awbs = [r.shipping_in_awb, r.shipping_out_awb]
            .filter(Boolean).map((v) => String(v).toUpperCase().replace(/\s+/g, ''));
          if (awbNeedle && awbs.some((v) => v.includes(awbNeedle))) return true;
          return [r.return_number, r.order_number, r.customer_name]
            .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
        });

        if (!orders.length && !returns.length) {
          return { text: `Tidak ada pesanan atau retur yang cocok dengan "${args.cari}".` };
        }

        const trackingByAwb = new Map<string, string>();
        await Promise.all(
          orders
            .filter((o: any) => o.awb_no)
            .slice(0, 5)
            .map(async (o: any) => {
              const status = await fetchJntStatus(BASE_URL, o.awb_no);
              if (status) trackingByAwb.set(String(o.awb_no), status);
            }),
        );

        const blocks: string[] = [];
        if (orders.length) {
          const lines = orders.map((o: any) => {
            const items = (o.order_items || []).map((i: any) =>
              `${i.product_name || '-'}${i.series ? ` ${i.series}` : ''}${i.kain ? ` ${i.kain}` : ''}` +
              `${i.color && i.color !== 'default' ? ` ${i.color}` : ''}${i.size ? ` ${i.size}` : ''}` +
              ` x${i.quantity || 0} @ ${rupiah(i.price)}`).join(' · ');
            const kirim = [
              o.shipping_status,
              trackingByAwb.get(String(o.awb_no)) || o.tracking_status_text,
            ].filter(Boolean).join(' · ') || '-';
            return (
              `• ${o.order_number} · ${o.customer_name || '-'} · ${formatWaktu(o.created_at)}\n` +
              `  Status pesanan: ${PESANAN_STATUS_LABEL[String(o.status || '')] || o.status || '-'}\n` +
              `  Resi J&T: ${o.awb_no || 'belum ada'} · Status kirim: ${kirim}\n` +
              `  Item: ${items || '-'} · Total: ${rupiah(o.total)}`
            );
          });
          blocks.push(`${orders.length} pesanan ditemukan (read-only):\n${lines.join('\n')}`);
        }
        if (returns.length) {
          const lines = returns.map((r: any) => {
            const items = (r.items || []).map((i: any) =>
              `${i.product_name || '-'}${i.color && i.color !== 'default' ? ` ${i.color}` : ''}` +
              `${i.size ? ` ${i.size}` : ''}${i.replacement_size ? ` → ${i.replacement_size}` : ''} x${i.qty || 0}`
            ).join(' · ');
            return (
              `• ${r.return_number} · ${RETUR_TYPE_LABEL[String(r.type || '')] || r.type || '-'} · ` +
              `${RETUR_STATUS_LABEL[String(r.status || '')] || r.status || '-'} · ${formatWaktu(r.created_at)}\n` +
              `  Pesanan: ${r.order_number || '-'} · ${r.customer_name || '-'} · ${r.customer_whatsapp || '-'}\n` +
              `  Resi masuk: ${r.shipping_in_awb || 'belum ada'} · Resi keluar: ${r.shipping_out_awb || 'belum ada'}\n` +
              `  Pengganti diterima: ${r.replacement_delivered_at ? formatWaktu(r.replacement_delivered_at) : 'belum'}\n` +
              `  Alasan: ${r.reason || '-'}\n  Item: ${items || '-'}`
            );
          });
          blocks.push(`${returns.length} retur/tukar size ditemukan (read-only):\n${lines.join('\n')}`);
        }
        return { text: blocks.join('\n\n') };
      }

      case 'cek_lead_duplikat': {
        const items = await findLeadsByKontak(String(args.kontak || ''));
        if (!items.length) return { text: `Tidak ada lead dengan kontak ${args.kontak}.` };
        return {
          text: `Sudah ada ${items.length} lead dengan kontak itu:\n` +
            items.map((l: any) =>
              `• ${formatWaktu(l.created_at || l.tanggal)} · ${l.kontak} · ${l.sumber || '-'} · ` +
              `${l.status === 'closing' ? 'Closing' : 'Belum Closing'}${l.pic ? ` · PIC ${l.pic}` : ''}`
            ).join('\n'),
        };
      }

      case 'catat_lead': {
        if (ctx.dry) return { text: `DRY: lead ${args.kontak} tidak disimpan (mode uji).` };
        const rawKontak = String(args.kontak || '').trim();
        const digits = rawKontak.replace(/\D/g, '');
        // Nomor disimpan format lokal 0… (62… atau 8… diubah ke 0…).
        const kontak = digits.length >= 8
          ? digits.startsWith('62')
            ? `0${digits.slice(2)}`
            : digits.startsWith('0')
              ? digits
              : `0${digits}`
          : rawKontak;
        const dup = await findLeadsByKontak(kontak);
        if (dup.length) return { text: `Nomor ${kontak} sudah tercatat sebagai lead. Tidak dibuat baru.` };
        const row = {
          tanggal: wibToday(),
          jam: wibClock(),
          kontak,
          sumber: ctx.adLead ? 'Meta ads' : String(args.sumber || 'WA'),
          status: args.status === 'closing' ? 'closing' : 'belum_closing',
          nominal: 0,
          catatan: String(args.catatan || '').trim(),
          produk: args.produk ? String(args.produk).trim() : null,
          pic: String(args.pic || 'Agent'),
        };
        const json = await opsFetch('/api/ops/leads', {
          method: 'POST',
          body: JSON.stringify({ rows: [row], blockDuplicates: true }),
        });
        const saved = json?.items?.[0];
        if (!saved) return { isError: true, text: 'Lead gagal disimpan.' };
        return { text: `Lead tersimpan: ${saved.kontak} · ${saved.sumber || '-'} · PIC ${saved.pic || '-'}` };
      }

      case 'catat_closing': {
        if (ctx.dry) {
          return { text: `DRY: closing ${args.nomor} · ${rupiah(args.nominal)} tidak disimpan/dikirim.` };
        }
        const missing = missingClosingFields(args);
        if (missing.length) {
          return {
            isError: true,
            text: `Data closing belum lengkap: ${missing.join(', ')}. Tanya customer dulu, jangan kirim rekap admin.`,
          };
        }
        const nomor = normalizePhone(args.nomor);
        const nominal = Math.round(Number(args.nominal) || 0);
        const inboxId = String(args.inbox_id || '').trim();
        if (!nomor || nominal <= 0 || !inboxId) {
          return { isError: true, text: 'nomor, nominal (>0), dan inbox_id wajib diisi.' };
        }
        if (!ctx.service) return { isError: true, text: 'Database Academy tidak tersedia.' };

        // Link bukti dibuat server (bertanda tangan). Jangan pakai proof_url kiriman AI:
        // URL R2 private panjang dan sering terpotong di bagian ?X-Amz-... sehingga mati.
        let proofUrl = String(args.proof_url || '').trim() || null;
        try {
          const signed = await opsFetch(`/api/ops/wa-media?inbox_id=${encodeURIComponent(inboxId)}`);
          if (signed?.url) proofUrl = String(signed.url);
        } catch {
          // endpoint gagal -> pakai URL apa adanya
        }

        const payload = {
          inbox_id: inboxId,
          sender: nomor,
          sender_name: String(args.nama || '').trim() || null,
          nominal,
          proof_url: proofUrl,
          address: buildClosingAddress(args),
          order_detail: String(args.pesanan || '').trim() || null,
          source: 'server',
        };
        const { data: existing, error: readError } = await ctx.service
          .from('wa_closings')
          .select('id,admin_notified_at')
          .eq('inbox_id', inboxId)
          .maybeSingle();
        if (readError) return { isError: true, text: `Gagal cek closing: ${readError.message}` };
        // Anti-dobel lintas pesan: customer bisa kirim foto bukti lalu menyusul "siap",
        // sehingga inbox_id berbeda tapi closingnya sama. Nomor + nominal sama dalam
        // 60 menit dianggap closing yang sama -> jangan lapor admin dua kali.
        // 48 jam: batas 60 menit tidak menangkap closing yang dicatat ulang belakangan.
        const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentClosings } = await ctx.service
          .from('wa_closings')
          .select('id,inbox_id,proof_url')
          .eq('sender', nomor)
          .eq('nominal', nominal)
          .gte('created_at', sinceIso)
          .limit(5);
        const duplicate = (recentClosings || []).find(
          (row: any) => String(row.inbox_id) !== inboxId,
        );
        if (duplicate) {
          // Closing sudah tercatat tanpa bukti (bot menunjuk pesan teks). Kalau bukti
          // sekarang tersedia, tempelkan ke baris itu dan kirim FOTO saja ke admin —
          // rekap penuh tidak diulang.
          if (proofUrl && !duplicate.proof_url) {
            await ctx.service
              .from('wa_closings')
              .update({ proof_url: proofUrl })
              .eq('id', duplicate.id);
            try {
              await opsFetch('/api/ops/wa-inbox', {
                method: 'POST',
                body: JSON.stringify({
                  target: ADMIN_WA,
                  message: `Bukti transfer ${String(args.nama || '').trim() || nomor} - ${rupiah(nominal)}`,
                  url: proofUrl,
                  filename: `bukti-transfer-${nomor}.jpg`,
                }),
              });
            } catch {
              // foto gagal dikirim; bukti tetap tersimpan di database
            }
            return { text: `Closing ${nomor} sudah tercatat; bukti transfer ditambahkan ke admin.` };
          }
          return { text: `Closing ${nomor} - ${rupiah(nominal)} sudah tercatat dan rekap admin sudah dikirim.` };
        }
        if (existing?.admin_notified_at) {
          return { text: `Closing ${nomor} sudah tercatat dan rekap admin sudah dikirim.` };
        }
        if (existing) {
          const { error } = await ctx.service.from('wa_closings').update(payload).eq('id', existing.id);
          if (error) return { isError: true, text: `Gagal update closing: ${error.message}` };
        } else {
          const { error } = await ctx.service.from('wa_closings').insert(payload);
          if (error) return { isError: true, text: `Gagal catat closing: ${error.message}` };
        }

        if (!ADMIN_WA) return { isError: true, text: 'Nomor admin belum diisi.' };
        // Bukti dikirim sebagai LAMPIRAN FOTO, bukan link panjang di teks.
        const message = buildClosingAdminMessage({
          ...args,
          nomor,
          nominal,
          proof_url: undefined,
        });
        const attachment = proofUrl
          ? { url: proofUrl, filename: `bukti-transfer-${nomor}.jpg` }
          : {};
        try {
          await opsFetch('/api/ops/wa-inbox', {
            method: 'POST',
            body: JSON.stringify({ target: ADMIN_WA, message, ...attachment }),
          });
        } catch (error: any) {
          // Endpoint lama belum menerima URL R2 private -> kirim versi teks + link.
          if (!proofUrl) throw error;
          const fallback = buildClosingAdminMessage({
            ...args,
            nomor,
            nominal,
            proof_url: proofUrl,
          });
          await opsFetch('/api/ops/wa-inbox', {
            method: 'POST',
            body: JSON.stringify({ target: ADMIN_WA, message: fallback }),
          });
        }
        await ctx.service
          .from('wa_closings')
          .update({ admin_notified_at: new Date().toISOString() })
          .eq('inbox_id', inboxId);
        return { text: `Closing tercatat & rekap dikirim ke admin: ${nomor} · ${rupiah(nominal)}.` };
      }

      case 'detail_produk': {
        if (!ctx.service) return { isError: true, text: 'Database Academy tidak tersedia.' };
        // Ejaan katalog kadang beda (produk "Coffe", warna "Coffee").
        const normName = (value: unknown) =>
          String(value || '')
            .toLowerCase()
            .replace(/\bcoffe\b/g, 'coffee')
            .replace(/\s+/g, ' ')
            .trim();
        const q = normName(args.produk);
        if (!q) return { isError: true, text: 'Nama produk wajib diisi.' };
        const { data, error } = await ctx.service
          .from('content_items')
          .select('data')
          .eq('type', 'product');
        if (error) return { isError: true, text: `Gagal ambil Product Knowledge: ${error.message}` };
        const map = buildAcademyProductMap(data || []);
        // Kunci map = series/nama/kode. Skor per kata supaya kunci series saja
        // ("kandora") tidak menang atas nama lengkap ("kandora coffe brown").
        const normMap = new Map<string, any>();
        for (const [key, value] of map) {
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
            const score = name.split(/\s+/).filter((word) => words.includes(word)).length;
            if (score > bestScore || (score === bestScore && score > 0 && name.length > bestName.length)) {
              bestScore = score;
              bestName = name;
              bestValue = value;
            }
          }
          if (bestValue && bestScore >= Math.min(2, words.length)) found = bestValue;
        }
        if (!found) {
          // Fallback katalog: Product Knowledge belum punya entri warna ini.
          try {
            const json = await opsFetch('/api/ops/products');
            const match = (json?.items || []).find((p: any) => {
              const name = normName(p.name);
              return name.includes(q) || q.includes(name);
            });
            if (match) {
              const colors = (Array.isArray(match.colors)
                ? match.colors
                : String(match.colors || '').split(/[,/]/)
              )
                .map((c: unknown) => String(c || '').trim())
                .filter(Boolean)
                .join(', ');
              return {
                text: [
                  `${match.name} â€” ${match.category || '-'}`,
                  `Kain: ${match.jenis_kain?.name || match.kain || '-'}`,
                  colors ? `Warna: ${colors}` : '',
                  `Harga: ${rupiah(match.price)}`,
                  'Keunggulan/seri belum ada di Product Knowledge â€” sampaikan hanya fakta ini.',
                ].filter(Boolean).join('\n'),
              };
            }
          } catch {
            // katalog opsional; lanjut ke pesan belum ada
          }
          return { text: `Detail produk "${args.produk}" belum ada di Product Knowledge Academy.` };
        }
        return { text: formatAcademyProductDetail(found) };
      }

      case 'cek_resi': {
        const awb = String(args.resi || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{8,30}$/.test(awb)) {
          return { isError: true, text: 'Nomor resi tidak valid. Minta nomor resi J&T yang benar.' };
        }
        const status = await fetchJntStatus(BASE_URL, awb);
        const link = `https://www.samaqu.id/id/cek-resi?awb=${encodeURIComponent(awb)}`;
        if (!status) {
          return { text: `Resi ${awb} belum ditemukan di pelacakan J&T.\nCek SAMAQU: ${link}` };
        }
        return { text: `Resi ${awb}: ${status}\nCek SAMAQU: ${link}` };
      }

      case 'buat_draft_transaksi': {
        if (ctx.dry) return { text: 'DRY: draft transaksi tidak disimpan.' };
        const items = Array.isArray(args.items) ? args.items : [];
        if (!items.length) return { isError: true, text: 'items wajib diisi.' };
        const nomor = normalizePhone(args.nomor);
        // id produk wajib dari hasil cari_produk; id kosong bikin draft gagal di-approve.
        const missingId = items.find((item: any) => !String(item?.product_id || '').trim());
        if (missingId) {
          return {
            isError: true,
            text: `product_id kosong untuk "${missingId?.product_name || missingId?.size || 'item'}". Ambil id produk dari hasil cari_produk (bagian "id:..."), jangan dikarang.`,
          };
        }
        const payload = {
          free_cover_hanger: args.free_cover_hanger === true,
          customer_name: String(args.nama || '').trim(),
          customer_whatsapp: nomor,
          source: 'whatsapp',
          created_at: new Date().toISOString(),
          shipping_cost: Math.max(0, Number(args.shipping_cost) || 0),
          shipping_method: String(args.shipping_method || '').trim(),
          discount: Math.max(0, Number(args.discount) || 0),
          payment_status: 'paid',
          notes: [String(args.notes || '').trim(), args.free_cover_hanger === true ? 'Bonus Free Cover Hanger (pembelian pertama) - harga normal, diskon Rp35.000 diisi admin' : ''].filter(Boolean).join(' - '),
          shipping: {
            address: String(args.alamat || '').trim(),
            province: String(args.provinsi || '').trim(),
            city: String(args.kota || '').trim(),
            kecamatan: String(args.kecamatan || '').trim(),
            postal_code: String(args.kode_pos || '').trim(),
          },
          items: items.map((item: any) => ({
            product_id: String(item?.product_id || '').trim(),
            product_name: String(item?.product_name || '').trim() || undefined,
            color: String(item?.color || 'default'),
            size: String(item?.size || '').toUpperCase().replace(/^2XL$/, 'XXL'),
            quantity: Math.max(1, Number(item?.quantity) || 1),
            ...(Number(item?.price) > 0 ? { price: Number(item.price) } : {}),
          })),
        };
        try {
          const saved = await opsFetch('/api/ops/perlu-review', {
            method: 'POST',
            body: JSON.stringify({
              action: 'draft_create',
              source_inbox_id: String(args.inbox_id || '').trim() || null,
              payload,
              proof_url: String(args.proof_url || '').trim() || null,
              ai_note: 'Draft dari chat WA',
            }),
          });
          return {
            text: saved?.duplicate
              ? 'Draft transaksi untuk inbox ini sudah ada; menunggu review admin.'
              : 'Draft transaksi disimpan; menunggu review admin.',
          };
        } catch (error: any) {
          return { isError: true, text: `Gagal menyimpan draft: ${error.message}` };
        }
      }

      case 'daftar_lead': {
        const qs = new URLSearchParams();
        qs.set('limit', String(Number(args.limit) || 20));
        qs.set('options', '0');
        if (args.mulai) qs.set('start', String(args.mulai));
        if (args.sampai) qs.set('end', String(args.sampai));
        if (args.cari) qs.set('search', String(args.cari));
        const json = await opsFetch(`/api/ops/leads?${qs.toString()}`);
        const items = json?.items || [];
        if (!items.length) return { text: 'Tidak ada lead pada filter itu.' };
        return {
          text: `${items.length} lead (total ${json?.count ?? items.length}):\n` +
            items.map((l: any) =>
              `• ${l.tanggal} ${l.jam || ''} · ${l.kontak} · ${l.sumber || '-'} · ${l.pic || '-'} · ` +
              `${l.status === 'closing' ? 'Closing' : 'Belum Closing'}`
            ).join('\n'),
        };
      }

      case 'opsi_lead': {
        const [leadJson, productJson] = await Promise.all([
          opsFetch('/api/ops/leads?limit=1&options=1'),
          opsFetch('/api/ops/products'),
        ]);
        const pics = leadJson?.options?.pics || [];
        const products = [...new Set((productJson?.items || []).map((p: any) => p.name).filter(Boolean))];
        return {
          text: `Sumber: Website, IG, WA, Meta ads\nPIC: ${pics.length ? pics.join(', ') : '-'}\n` +
            `Produk: ${products.length ? products.join(', ') : '-'}`,
        };
      }

      case 'kirim_wa': {
        const nomor = normPhone(args.nomor);
        const pesan = cleanOutgoing(String(args.pesan || '').trim());
        const inboxId = args.inbox_id ? String(args.inbox_id) : '';
        const mediaUrl = String(args.url || '').trim();
        if (!nomor || !pesan) return { isError: true, text: 'nomor dan pesan wajib diisi.' };
        // Trace: id pesan asal tetap dipakai saat kirim (retry memakai id yang sama).
        console.log(
          `[WA-TRACE] server-send inbox=${inboxId || '-'} target=${nomor} media=${mediaUrl ? 'yes' : 'no'}`,
        );

        // Kunci kode: hanya boleh membalas pengirim pesan pada inbox_id itu.
        if (inboxId) {
          const sender = ctx.senders.get(inboxId);
          if (!sender) return { isError: true, text: `inbox_id ${inboxId} bukan bagian run ini.` };
          if (normPhone(sender) !== nomor) {
            return { isError: true, text: 'Nomor tujuan beda dengan pengirim pesan. Ditolak.' };
          }
          if (ctx.handled.has(inboxId)) return { text: `DRY: inbox ${inboxId} sudah ditangani.` };
        }

        if (ctx.dry) {
          if (inboxId) ctx.handled.add(inboxId);
          ctx.outbox.push({
            nomor,
            pesan,
            ...(inboxId ? { inbox_id: inboxId } : {}),
            ...(mediaUrl ? { url: mediaUrl } : {}),
          });
          return { text: `DRY: balasan untuk ${nomor} tidak dikirim (${pesan.length} karakter).` };
        }

        // Pengaman kill switch: cek mode tepat sebelum kirim. Run yang sudah
        // berjalan saat mode diubah ke "off" tidak boleh tetap mengirim balasan.
        try {
          const { data: control } = await ctx.service
            .from('wa_bot_control')
            .select('mode')
            .eq('id', 1)
            .maybeSingle();
          if (String(control?.mode || 'auto') === 'off') {
            return { isError: true, text: 'Bot dimatikan (mode off). Pesan tidak dikirim.' };
          }
        } catch {
          // cek mode gagal: lanjutkan seperti biasa
        }

        const json = await opsFetch('/api/ops/wa-inbox', {
          method: 'POST',
          body: JSON.stringify({
            target: nomor,
            message: pesan,
            inbox_id: inboxId || undefined,
            ...(mediaUrl ? { url: mediaUrl } : {}),
          }),
        });
        if (inboxId) ctx.handled.add(inboxId);
        ctx.outbox.push({
          nomor: json?.target || nomor,
          pesan,
          ...(inboxId ? { inbox_id: inboxId } : {}),
          ...(mediaUrl ? { url: mediaUrl } : {}),
        });
        return { text: `Terkirim ke ${json?.target || nomor}.` };
      }

      case 'lewati_wa': {
        const inboxId = String(args.inbox_id || '');
        if (!inboxId) return { isError: true, text: 'inbox_id wajib.' };
        if (ctx.dry) {
          ctx.handled.add(inboxId);
          return { text: `DRY: inbox ${inboxId} ditandai dilewati (${args.alasan || '-'}).` };
        }
        await opsFetch('/api/ops/wa-inbox', {
          method: 'PATCH',
          body: JSON.stringify({ id: inboxId, action: 'skip', note: args.alasan || '' }),
        });
        ctx.handled.add(inboxId);
        return { text: 'Pesan ditandai dilewati.' };
      }

      case 'teruskan_admin': {
        const pesan = String(args.pesan || '').trim();
        if (!pesan) return { isError: true, text: 'pesan wajib diisi.' };
        const nama = String(args.nama_customer || '').trim();
        const nomorRaw = String(args.nomor_customer || '').replace(/\D/g, '');
        const nomor = nomorRaw.startsWith('62') ? `0${nomorRaw.slice(2)}` : nomorRaw;
        const head = ['*CS WA — perlu admin*', `Nama: ${nama || '-'}`, nomor ? `No: ${nomor}` : '']
          .filter(Boolean)
          .join('\n');
        const isi = `${head}\n\n${pesan}`;
        if (ctx.dry) {
          ctx.outbox.push({ nomor: ADMIN_WA, pesan: isi });
          return { text: `DRY: diteruskan ke admin ${ADMIN_WA} (tidak dikirim).` };
        }
        // Model kadang lupa mengirim inbox_id. Cari pesan run ini dari nomor yang sama
        // supaya kasus tetap masuk antrean "Pertanyaan AI" di Perlu Review.
        let inboxId = String(args.inbox_id || '').trim();
        if (!inboxId) {
          for (const [id, nomorInbox] of ctx.senders.entries()) {
            if (String(nomorInbox).replace(/\D/g, '') === nomorRaw) {
              inboxId = id;
              break;
            }
          }
        }
        const sender = ctx.senders.get(inboxId) || nomorRaw;
        if (sender) {
          try {
            await opsFetch('/api/ops/perlu-review', {
              method: 'POST',
              body: JSON.stringify({
                action: 'escalation_create',
                inbox_id: inboxId || null,
                sender,
                sender_name: nama || null,
                summary: pesan,
                reason: String(args.alasan || '').trim() || null,
                customer_message: pesan,
              }),
            });
          } catch (escalationError) {
            // Jangan gagalkan kirim admin, tapi jangan ditelan diam-diam.
            console.error('[WA-AGENT] escalation_create gagal:', escalationError);
          }
        }
        const json = await opsFetch('/api/ops/wa-inbox', {
          method: 'POST',
          body: JSON.stringify({ target: ADMIN_WA, message: isi }),
        });
        return { text: `Diteruskan ke admin ${json?.target || ADMIN_WA}.` };
      }

      default:
        return { isError: true, text: `Tool tidak dikenal: ${name}` };
    }
  } catch (error) {
    return { isError: true, text: error instanceof Error ? error.message : String(error) };
  }
}
