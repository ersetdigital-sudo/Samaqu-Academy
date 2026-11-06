import type { MimoToolDefinition } from '../_shared/mimo-tools.ts';

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
        'sebelum menyebut harga/stok/ukuran/warna. Harga jangan dibulatkan dan jangan "mulai dari" kalau sama.',
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
        'untuk nomor selain pengirim pesan itu.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor tujuan (harus sama dengan pengirim inbox_id)' },
          pesan: { type: 'string', description: 'Isi pesan' },
          inbox_id: { type: 'string', description: 'id pesan dari daftar pesan masuk' },
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
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

/** Buang baris laporan internal kalau model tidak sengaja menyertakannya. */
function cleanOutgoing(text: string): string {
  const lines = String(text || '').split(/\r?\n/);
  const cut = lines.findIndex((line) =>
    /^\s*(\d+\s+nomor ditangani|laporan\s*:)/i.test(line),
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
        const q = String(args.cari || '').trim().toLowerCase();
        const kat = String(args.kategori || '').trim().toLowerCase();
        const onlyPublished = true; // bot WA hanya boleh menawarkan produk yang tampil di katalog
        const products = (produkJson?.items || []).filter((p: any) => {
          if (onlyPublished && !p.is_published) return false;
          if (kat && String(p.category || '').toLowerCase() !== kat) return false;
          if (!q) return true;
          const hay = [p.name, p.series, p.category, p.jenis_kain?.name, p.colors]
            .filter(Boolean).join(' ').toLowerCase();
          return hay.includes(q);
        });
        if (!products.length) return { text: 'Tidak ada produk yang cocok.' };

        const byProduct = new Map<string, any[]>();
        for (const v of varianJson?.items || []) {
          const key = String(v.product_id);
          if (!byProduct.has(key)) byProduct.set(key, []);
          byProduct.get(key)!.push(v);
        }
        const limit = Number(args.limit) || 5;
        const rows = products.slice(0, limit).map((p: any) => {
          const variants = byProduct.get(String(p.id)) || [];
          const colors = variants.map((v: any) => {
            const stock = v.stock_efektif || {};
            const weights = v.weights || {};
            const sizes = Object.entries(stock)
              .map(([size, n]) => `${size} ${Number(n) || 0}${Number(weights[size]) > 0 ? `/${Number(weights[size])}g` : ''}`)
              .join(' · ');
            return `  ${v.color || 'default'}: ${sizes || '-'}`;
          });
          return (
            `• ${p.name}${p.series ? ` (${p.series})` : ''} — ${p.category || '-'} — ${rupiah(p.price)}` +
            `${Number(p.weight) > 0 ? ` — berat produk ${Number(p.weight)}g` : ''}` +
            `${p.is_published === false ? ' — belum tampil di website' : ''}` +
            `${p.stock_efektif != null ? ` — total ${p.stock_efektif}` : ''}\n` +
            (colors.length ? colors.join('\n') : '  (tidak ada ukuran yang dijual)')
          );
        });
        return {
          text: `${Math.min(products.length, limit)} dari ${products.length} produk cocok` +
            `${q ? ` untuk "${args.cari}"` : ''} (stok = stok efektif):\n${rows.join('\n')}`,
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
        if (json?.configured === false) return { text: 'J&T API belum dikonfigurasi di server SAMAQU.' };
        const rows = Array.isArray(json?.data) ? json.data : [];
        if (!rows.length) {
          return { text: `Tidak ada layanan J&T untuk ${args.kecamatan}, ${args.kota} (${args.berat_gram} g).` };
        }
        const lines = rows.map((r: any) => `• ${r.service || r.serviceCode} — ${rupiah(r.cost)}${r.etd ? ` — ${r.etd}` : ''}`);
        return { text: `Ongkir J&T Depok → ${args.kecamatan}, ${args.kota} · ${args.berat_gram} g\n${lines.join('\n')}` };
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

        const blocks: string[] = [];
        if (orders.length) {
          const lines = orders.map((o: any) => {
            const items = (o.order_items || []).map((i: any) =>
              `${i.product_name || '-'}${i.series ? ` ${i.series}` : ''}${i.kain ? ` ${i.kain}` : ''}` +
              `${i.color && i.color !== 'default' ? ` ${i.color}` : ''}${i.size ? ` ${i.size}` : ''}` +
              ` x${i.quantity || 0} @ ${rupiah(i.price)}`).join(' · ');
            const kirim = [o.shipping_status, o.tracking_status_text].filter(Boolean).join(' · ') || '-';
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
        if (!nomor || !pesan) return { isError: true, text: 'nomor dan pesan wajib diisi.' };

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
          ctx.outbox.push({ nomor, pesan, ...(inboxId ? { inbox_id: inboxId } : {}) });
          return { text: `DRY: balasan untuk ${nomor} tidak dikirim (${pesan.length} karakter).` };
        }

        const json = await opsFetch('/api/ops/wa-inbox', {
          method: 'POST',
          body: JSON.stringify({ target: nomor, message: pesan, inbox_id: inboxId || undefined }),
        });
        if (inboxId) ctx.handled.add(inboxId);
        ctx.outbox.push({ nomor: json?.target || nomor, pesan, ...(inboxId ? { inbox_id: inboxId } : {}) });
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
