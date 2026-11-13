/**
 * Stok Cover & Hanger untuk bonus pembelian pertama.
 *
 * Dibaca LANGSUNG dari stok produk (`product_variant_stock`, stok efektif), bukan dari
 * kuota promo. Dipakai dua tempat:
 *  - `index.ts` → blok STATUS BONUS di prompt (supaya obrolan biasa tidak menjanjikan bonus);
 *  - `tools.ts` → `rekap_pesanan` memutuskan sendiri baris Bonus (model tidak menebak).
 */

const SAMAQU_SUPA_URL = Deno.env.get('SAMAQU_SUPABASE_URL') || '';
const SAMAQU_SERVICE_KEY = Deno.env.get('SAMAQU_SERVICE_ROLE_KEY') || '';

export const COVER_THOBE = 'Cover Thobe + Hanger';
export const COVER_KOKO = 'Cover Koko + Hanger';

/**
 * Ambil JSON dari database SAMAQU (service role, read-only) dengan timeout + retry.
 * Data stok bonus harus selalu ada, jadi tidak boleh menggantung atau menyerah pada
 * kegagalan sesaat.
 */
export async function samaquJson(pathname: string, init: RequestInit = {}, attempts = 3): Promise<any> {
  if (!SAMAQU_SUPA_URL || !SAMAQU_SERVICE_KEY) throw new Error('Database SAMAQU belum dikonfigurasi');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const res = await fetch(`${SAMAQU_SUPA_URL}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: SAMAQU_SERVICE_KEY,
          Authorization: `Bearer ${SAMAQU_SERVICE_KEY}`,
          ...(init.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('gagal membaca data SAMAQU');
}

/**
 * Stok efektif per varian cover (nama varian → jumlah).
 * Sumber 1: view `product_variant_stock`; sumber 2: RPC `samaqu_effective_stock_map`
 * (fungsi yang sama dipakai halaman ops). `null` = dua-duanya tidak terbaca.
 */
export async function readCoverStock(): Promise<Map<string, number> | null> {
  try {
    const rows = await samaquJson(
      '/rest/v1/product_variant_stock?select=color,effective_stock&product_id=eq.cover-hanger',
    );
    if (Array.isArray(rows) && rows.length) {
      return new Map(rows.map((row: any) => [String(row.color), Number(row.effective_stock) || 0]));
    }
  } catch {
    // jatuh ke RPC
  }
  try {
    const rows = await samaquJson('/rest/v1/rpc/samaqu_effective_stock_map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const map = new Map<string, number>();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.product_id === 'cover-hanger') map.set(String(row.color), Number(row.effective_stock) || 0);
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}

/** Cover yang sesuai kategori produk: Thobe/Kandora → cover thobe, Koko → cover koko. */
export function coverForCategory(category: unknown): string | null {
  const value = String(category || '').trim().toLowerCase();
  if (value === 'thobe' || value === 'kandora') return COVER_THOBE;
  if (value === 'koko') return COVER_KOKO;
  return null;
}

/** Blok STATUS BONUS untuk prompt. Kalau stok tidak terbaca, bonus dilarang. */
export async function bonusStockContext(): Promise<string> {
  const stock = await readCoverStock();
  if (!stock) {
    return [
      'STATUS BONUS (stok langsung dari produk):',
      '- Stok Cover & Hanger TIDAK TERBACA saat ini.',
      '- Jangan menawarkan atau menulis bonus free cover + hanger di balasan ini.',
    ].join('\n');
  }

  const thobe = stock.get(COVER_THOBE) ?? 0;
  const koko = stock.get(COVER_KOKO) ?? 0;
  return [
    'STATUS BONUS (stok langsung dari produk, BUKAN kuota promo):',
    `- ${COVER_THOBE}: ${stock.has(COVER_THOBE) ? thobe : 'tidak ada varian'}`,
    `- ${COVER_KOKO}: ${stock.has(COVER_KOKO) ? koko : 'tidak ada varian'}`,
    thobe > 0
      ? '- Pembelian Thobe/Kandora: bonus Cover Thobe masih tersedia, boleh ditawarkan.'
      : '- Pembelian Thobe/Kandora: Cover Thobe + Hanger HABIS. JANGAN menawarkan atau menulis free cover + hanger. Kalau ditanya, jawab jujur sedang kosong.',
    koko > 0
      ? '- Pembelian Koko: bonus Cover Koko masih tersedia, boleh ditawarkan.'
      : '- Pembelian Koko: Cover Koko + Hanger HABIS. JANGAN menawarkan bonus cover untuk Koko.',
    '- Di rekap pesanan, baris Bonus diputuskan oleh tool rekap_pesanan — salin apa adanya.',
  ].join('\n');
}
