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
import { normalizePhone, POTONG_PANJANG_LABEL } from '../_shared/wa/closing-core.mjs';
import { runClosing } from './closing.ts';
import { coverForCategory, readCoverStock } from './cover-stock.ts';
import { buildRekap, type RekapLine, type RekapService } from './rekap-format.ts';

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
      description:
        'Hitung tarif J&T dari Depok ke kota + kecamatan tujuan. UTAMAKAN `items`: server menghitung ' +
        'berat sendiri dari berat varian per ukuran, lalu berat produk (fallback 1000 g). Jangan menghitung berat manual.',
      parameters: {
        type: 'object',
        properties: {
          kota: { type: 'string', description: 'Kota/kabupaten tujuan' },
          kecamatan: { type: 'string', description: 'Kecamatan tujuan' },
          items: {
            type: 'array',
            description: 'Semua barang yang dikirim. Berat dihitung server dari product_id + size.',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'id dari hasil cari_produk' },
                size: { type: 'string', description: 'Ukuran, mis. M / XL' },
                quantity: { type: 'integer', description: 'Jumlah' },
              },
              required: ['product_id', 'quantity'],
            },
          },
          berat_gram: { type: 'integer', description: 'Hanya dipakai kalau items tidak dikirim' },
        },
        required: ['kota', 'kecamatan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rekap_pesanan',
      description:
        'WAJIB dipakai SEBELUM mengirim nomor rekening. Menghitung harga, berat, ongkir J&T, total, ' +
        'DAN memutuskan bonus cover + hanger (cek stok cover + customer baru) dari database. ' +
        'Hasilnya teks rekap siap kirim: salin persis lewat kirim_wa, jangan diubah atau ditambah. ' +
        'Rekening baru dikirim setelah customer menyetujui rekap.',
      parameters: {
        type: 'object',
        properties: {
          inbox_id: { type: 'string', description: 'inbox_id pesan customer (nomor WA diambil dari sini untuk cek customer baru)' },
          nomor: { type: 'string', description: 'Nomor WA customer, hanya kalau data dikirim dari nomor admin (baris "Nomor:")' },
          layanan: { type: 'string', description: 'Layanan J&T yang sudah dipilih customer, mis. EZ / ECO. Kosongkan kalau belum dipilih.' },
          nama: { type: 'string', description: 'Nama penerima dari customer (bukan dari bukti transfer)' },
          alamat: { type: 'string', description: 'Alamat lengkap penerima apa adanya (jalan, RT/RW, kelurahan, kecamatan, kota, kode pos)' },
          potong_panjang: { type: 'string', description: 'Isi kalau customer minta potong panjang, mis. "5 cm"' },
          kota: { type: 'string', description: 'Kota/kabupaten tujuan' },
          kecamatan: { type: 'string', description: 'Kecamatan tujuan' },
          items: {
            type: 'array',
            description: 'Semua barang yang dipesan.',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'id dari hasil cari_produk' },
                size: { type: 'string', description: 'Ukuran, mis. M / XL' },
                quantity: { type: 'integer', description: 'Jumlah' },
              },
              required: ['product_id', 'quantity'],
            },
          },
        },
        required: ['kota', 'kecamatan', 'items'],
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
        'Satu langkah closing setelah bukti transfer terbaca dan nominalnya cocok: catat closing, ' +
        'simpan draft di Perlu Review (bonus cover diputuskan server), lalu kabari admin. ' +
        'Panggil SEKALI. Jangan dipakai untuk total/penawaran yang belum dibayar.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor HP customer yang mengirim bukti' },
          nominal: { type: 'integer', minimum: 1000, description: 'Nominal transfer yang terbaca dari bukti' },
          inbox_id: { type: 'string', description: 'id pesan yang memuat foto bukti transfer' },
          items: {
            type: 'array',
            description: 'Barang yang dibayar (untuk draft Perlu Review).',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'id dari hasil cari_produk' },
                product_name: { type: 'string' },
                color: { type: 'string' },
                size: { type: 'string' },
                quantity: { type: 'integer' },
                price: { type: 'integer' },
              },
              required: ['product_id', 'color', 'size', 'quantity'],
            },
          },
          nama: { type: 'string', description: 'Nama penerima' },
          alamat: { type: 'string', description: 'Alamat jalan/RT-RW/patokan' },
          kelurahan: { type: 'string', description: 'Kelurahan/desa (kalau ada)' },
          kecamatan: { type: 'string', description: 'Kecamatan' },
          kota: { type: 'string', description: 'Kota/kabupaten' },
          provinsi: { type: 'string', description: 'Provinsi' },
          kode_pos: { type: 'string', description: 'Kode pos' },
          pesanan: { type: 'string', description: 'Rincian pesanan; tiap baris WAJIB memuat nominal dari tool, mis. "Thobe Mint Karim size S x1 - Rp374.000". Salin baris Bonus dari rekap kalau ada.' },
          kurir: { type: 'string', description: 'Kurir, mis. J&T EZ' },
          ongkir: { type: 'integer', description: 'Ongkir' },
          potong_panjang: {
            type: 'string',
            description:
              `Isi hanya kalau customer minta ${POTONG_PANJANG_LABEL} untuk Thobe atau Kandora, mis. "dipotong 5 cm" atau "panjang akhir 138 cm". Biayanya Rp35.000, dikerjakan tim produksi SAMAQU.`,
          },
        },
        required: [
          'nomor', 'nominal', 'inbox_id', 'items', 'nama', 'alamat', 'kecamatan', 'kota',
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
      name: 'info_series',
      description:
        'Ambil penjelasan + FOTO resmi tiap series Thobe (Imron, Jiharkah, Nahawand, Bayati, Imalah). ' +
        'Pakai saat customer bertanya beda series, ciri kerah/placket, atau minta foto series. ' +
        'Hasil berisi field Foto (URL) yang dikirim lewat kirim_wa url. Jangan kirim video series (khusus admin).',
      parameters: {
        type: 'object',
        properties: {
          series: {
            type: 'string',
            description: 'Nama series (opsional), mis. Imron / Bayati. Kosongkan untuk semua series.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_bahan',
      description:
        'Ambil penjelasan + FOTO resmi tiap bahan/kain SAMAQU (mis. B-01, B-02, A-02). ' +
        'Pakai saat customer bertanya jenis bahan, karakter kain, atau minta foto bahan. ' +
        'Hasil berisi field Foto (URL) yang dikirim lewat kirim_wa url.',
      parameters: {
        type: 'object',
        properties: {
          bahan: {
            type: 'string',
            description: 'Nama atau kode bahan (opsional), mis. B-01. Kosongkan untuk semua bahan.',
          },
        },
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

/** Status pesanan yang membuat customer dianggap LAMA. Belum Bayar & Dibatalkan tidak dihitung. */
const COUNTED_ORDER_STATUS = new Set(['diproses', 'dikirim', 'selesai']);

/** true = belum pernah punya pesanan terhitung; null = riwayat tidak terbaca. */
async function isFirstPurchase(nomor: string): Promise<boolean | null> {
  const phone = normPhone(nomor);
  if (!phone) return null;
  try {
    const json = await opsFetch(`/api/ops/orders?search=${encodeURIComponent(phone)}&limit=50`);
    if (!Array.isArray(json?.orders)) return null;
    return !json.orders.some(
      (o: any) => normPhone(o.customer_whatsapp) === phone && COUNTED_ORDER_STATUS.has(String(o.status || '')),
    );
  } catch {
    return null;
  }
}

/**
 * Bonus cover + hanger: hanya kalau produknya dapat cover, stok cover itu > 0, DAN customer
 * baru. Ragu (data tidak terbaca) = tidak ada bonus; lebih aman daripada menjanjikan.
 */
async function decideBonus(covers: Set<string>, nomor: string): Promise<{ cover: string | null; reason: string }> {
  if (!covers.size) return { cover: null, reason: 'produk tidak termasuk promo cover' };
  if (!nomor) return { cover: null, reason: 'nomor customer tidak diketahui' };
  const [stock, first] = await Promise.all([readCoverStock(), isFirstPurchase(nomor)]);
  if (first === null) return { cover: null, reason: 'riwayat pesanan tidak terbaca' };
  if (!first) return { cover: null, reason: 'customer lama (sudah ada pesanan Lunas/Dikirim/Selesai)' };
  if (!stock) return { cover: null, reason: 'stok cover tidak terbaca' };
  const cover = [...covers].find((name) => (stock.get(name) ?? 0) > 0);
  if (!cover) return { cover: null, reason: 'stok cover habis' };
  return { cover, reason: 'customer baru dan stok cover ada' };
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
        // Berat dihitung SERVER dari item, bukan dari hitungan model. Dulu model mengirim
        // berat satu baju untuk pesanan 2 baju sehingga tarif keluar 9.000 padahal
        // berat total seharusnya lebih tinggi. Berat tiap baju diambil dari produk.
        const items = Array.isArray(args.items) ? args.items : [];
        let weight = Number(args.berat_gram) || 0;

        if (items.length > 0) {
          const [productsJson, variantsJson] = await Promise.all([
            opsFetch('/api/ops/products'),
            opsFetch('/api/ops/product-variants'),
          ]);
          const products = new Map<string, any>(
            (productsJson?.items || []).map((p: any) => [String(p.id), p]),
          );
          const variants = new Map<string, any>(
            (variantsJson?.items || []).map((v: any) => [String(v.product_id), v]),
          );

          let total = 0;
          for (const item of items) {
            const productId = String(item?.product_id || '').trim();
            if (!productId) continue;
            const size = String(item?.size || '').toUpperCase();
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const variant = variants.get(productId);
            const unit =
              Number(variant?.weights?.[size]) ||
              Number(variant?.product_weight) ||
              Number(products.get(productId)?.weight) ||
              1000;
            total += unit * quantity;
          }
          if (total > 0) weight = total;
        }

        if (!weight || weight <= 0) {
          return {
            isError: true,
            text: 'Berat paket belum bisa dihitung. Kirim `items` (product_id, size, quantity) dari hasil cari_produk.',
          };
        }

        const body = JSON.stringify({
          city: String(args.kota || ''),
          district: String(args.kecamatan || ''),
          weight,
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

      case 'rekap_pesanan': {
        const items = Array.isArray(args.items) ? args.items : [];
        if (!items.length) return { isError: true, text: 'items wajib diisi.' };

        const [productsJson, variantsJson] = await Promise.all([
          opsFetch('/api/ops/products'),
          opsFetch('/api/ops/product-variants'),
        ]);
        const products = new Map<string, any>(
          (productsJson?.items || []).map((p: any) => [String(p.id), p]),
        );
        const variants = new Map<string, any>(
          (variantsJson?.items || []).map((v: any) => [String(v.product_id), v]),
        );

        const lines: RekapLine[] = [];
        const covers = new Set<string>();
        let weight = 0;

        for (const item of items) {
          const productId = String(item?.product_id || '').trim();
          const size = String(item?.size || '').toUpperCase();
          const quantity = Math.max(1, Number(item?.quantity) || 1);
          const product = products.get(productId);
          if (!product) {
            return {
              isError: true,
              text: `Produk "${productId}" tidak ditemukan. Ambil product_id dari hasil cari_produk.`,
            };
          }
          const variant = variants.get(productId);
          const price =
            Number(variant?.prices?.[size]) ||
            Number(product.price) ||
            0;
          const unitWeight =
            Number(variant?.weights?.[size]) ||
            Number(variant?.product_weight) ||
            Number(product.weight) ||
            1000;
          weight += unitWeight * quantity;
          const kain = product.jenis_kain?.name || product.kain;
          const label = [product.name, product.series].filter(Boolean).join(' ') +
            (kain ? ` (kain ${kain})` : '') + (size ? ` ${size}` : '');
          lines.push({ label, quantity, amount: price * quantity });
          const cover = coverForCategory(product.category);
          if (cover) covers.add(cover);
        }

        const ongkirRes = await fetch(`${BASE_URL}/api/shipping/jnt-cost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: String(args.kota || ''),
            district: String(args.kecamatan || ''),
            weight,
          }),
        });
        const ongkirJson = await ongkirRes.json().catch(() => null);
        const services: RekapService[] = (Array.isArray(ongkirJson?.data) ? ongkirJson.data : []).map(
          (s: any) => ({
            name: String(s.service || 'Reguler').replace(/^j&t\s*/i, '').trim(),
            cost: Number(s.cost) || 0,
            etd: s.etd ? String(s.etd) : undefined,
          }),
        );
        if (!services.length) {
          return { text: 'Ongkir J&T: tidak ada layanan untuk alamat ini. Oper ke admin, jangan kirim rekap.' };
        }

        // Bonus diputuskan di sini, bukan oleh model: perlu stok cover > 0 DAN customer baru.
        const nomor = ctx.senders.get(String(args.inbox_id || '')) || normalizePhone(args.nomor);
        const bonus = await decideBonus(covers, nomor);

        const shipTo = [String(args.nama || '').trim(), String(args.alamat || '').trim()]
          .filter(Boolean)
          .join(', ');
        const rekap = buildRekap({
          lines,
          services,
          chosenService: String(args.layanan || ''),
          bonus: bonus.cover,
          potongPanjang: args.potong_panjang
            ? { label: String(args.potong_panjang).trim(), amount: 35_000 }
            : null,
          shipTo,
        });

        return {
          text: [
            'TEKS UNTUK CUSTOMER (kirim lewat kirim_wa PERSIS seperti di antara garis, tanpa ditambah/diubah):',
            '-----',
            rekap.customerText,
            '-----',
            `CATATAN INTERNAL (jangan dikirim): bonus ${bonus.cover ? 'YA' : 'TIDAK'} — ${bonus.reason}.`,
            rekap.final
              ? 'Rekening baru dikirim setelah customer menyetujui rekap ini.'
              : 'Layanan belum dipilih: tunggu pilihan customer, lalu panggil rekap_pesanan lagi dengan `layanan`.',
            shipTo ? '' : 'Nama/alamat belum diisi: tanyakan dulu sebelum rekap final.',
          ].filter(Boolean).join('\n'),
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
        // WAJIB ada identitas yang unik. Tanpa ini, `includes("")` mencocokkan SEMUA
        // pesanan (pernah kejadian: resi customer lain dikirim ke nomor baru).
        const raw = String(args.cari || '').trim();
        const digits = raw.replace(/\D/g, '');
        const isPhone = digits.length >= 8 && raw.replace(/[\s+.\-()]/g, '') === digits;
        const isOrderNo = /^(SMQ|CYO|OPS)-/i.test(raw);
        const isAwb = /^JO[0-9A-Z]{6,}$/i.test(raw);
        if (!raw) {
          return {
            isError: true,
            text: 'Sebutkan nomor HP customer (atau nomor pesanan / nomor resi) dulu. Jangan membuka daftar pesanan tanpa filter.',
          };
        }
        if (!isPhone && !isOrderNo && !isAwb) {
          return {
            isError: true,
            text: 'Pencarian pesanan harus memakai nomor HP customer, nomor pesanan (SMQ-/CYO-/OPS-), atau nomor resi — jangan pakai nama. Tanya nomor HP customer dulu.',
          };
        }

        const term = searchTerm(raw);
        const qs = new URLSearchParams();
        qs.set('search', term);
        qs.set('limit', String(Number(args.limit) || 5));
        qs.set('include_items', '1');
        const [json, returJson] = await Promise.all([
          opsFetch(`/api/ops/orders?${qs.toString()}`),
          opsFetch('/api/ops/returns?limit=1000'),
        ]);

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

      case 'catat_closing':
        return await runClosing(args, ctx, { opsFetch, adminWa: ADMIN_WA, decideBonus, rupiah });

      case 'info_series': {
        if (!ctx.service) return { isError: true, text: 'Database Academy tidak tersedia.' };
        const { data, error } = await ctx.service
          .from('content_items')
          .select('data')
          .eq('type', 'product');
        if (error) return { isError: true, text: `Gagal ambil data series: ${error.message}` };

        const all = (data || [])
          .map((row: any) => row?.data)
          .filter(
            (d: any) =>
              d &&
              String(d.category || '').toLowerCase() === 'product series' &&
              String(d.name || '').trim(),
          );
        if (!all.length) return { text: 'Data series belum ada di Product Knowledge.' };

        const wanted = String(args.series || '').trim().toLowerCase();
        const picked = wanted
          ? all.filter((d: any) => {
              const name = String(d.name || '').toLowerCase();
              return name.includes(wanted) || wanted.includes(name);
            })
          : all;
        if (!picked.length) {
          return {
            text: `Series "${args.series}" tidak ditemukan. Series yang ada: ${all
              .map((d: any) => String(d.name || ''))
              .join(', ')}.`,
          };
        }

        const text = picked
          .map((d: any) =>
            [
              `**${String(d.name || '')}**`,
              d.collar ? `Kerah: ${String(d.collar)}` : '',
              d.placket ? `Placket: ${String(d.placket)}` : '',
              d.description ? `Deskripsi: ${String(d.description)}` : '',
              d.characteristics ? `Ciri: ${String(d.characteristics).replace(/\n/g, '; ')}` : '',
              d.image ? `Foto: ${String(d.image)}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n\n');

        return {
          text:
            `${text}\n\n` +
            'Kirim foto series yang relevan lewat kirim_wa url (maksimal 2 foto), lalu jelaskan bedanya ' +
            'dalam 2-3 kalimat pendek. Jangan mengirim video series (khusus admin).',
        };
      }

      case 'info_bahan': {
        if (!ctx.service) return { isError: true, text: 'Database Academy tidak tersedia.' };
        const { data, error } = await ctx.service
          .from('content_items')
          .select('data')
          .eq('type', 'product');
        if (error) return { isError: true, text: `Gagal ambil data bahan: ${error.message}` };

        const all = (data || [])
          .map((row: any) => row?.data)
          .filter(
            (d: any) =>
              d &&
              String(d.category || '').toLowerCase() === 'fabric collection' &&
              String(d.name || '').trim(),
          );
        if (!all.length) return { text: 'Data bahan belum ada di Product Knowledge.' };

        const wanted = String(args.bahan || '').trim().toLowerCase();
        const picked = wanted
          ? all.filter((d: any) => {
              const name = String(d.name || '').toLowerCase();
              const code = String(d.code || '').toLowerCase();
              return name.includes(wanted) || code.includes(wanted) || wanted.includes(code);
            })
          : all;
        if (!picked.length) {
          return {
            text: `Bahan "${args.bahan}" tidak ditemukan. Bahan yang ada: ${all
              .map((d: any) => String(d.name || ''))
              .join(', ')}.`,
          };
        }

        const text = picked
          .map((d: any) =>
            [
              `**${String(d.name || '')}**${d.code ? ` (${String(d.code)})` : ''}`,
              d.composition ? `Komposisi: ${String(d.composition)}` : '',
              d.gsm ? `GSM: ${String(d.gsm)}` : '',
              d.characteristics ? `Karakteristik: ${String(d.characteristics).replace(/\n/g, '; ')}` : '',
              d.advantages ? `Keunggulan: ${String(d.advantages).replace(/\n/g, '; ')}` : '',
              d.extra ? `Info tambahan: ${String(d.extra).replace(/\n/g, '; ')}` : '',
              d.image ? `Foto: ${String(d.image)}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n\n');

        return {
          text:
            `${text}\n\n` +
            'Kirim foto bahan yang relevan lewat kirim_wa url (maksimal 2 foto), lalu jelaskan ' +
            'singkat 2-3 kalimat.',
        };
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
