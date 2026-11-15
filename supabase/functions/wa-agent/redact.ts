/**
 * Penyamaran data untuk rekam jejak tool (tabel `wa_tool_calls`).
 *
 * Murni (tanpa jaringan) supaya bisa diuji. Tujuannya: argumen dan hasil tool tetap cukup untuk menilai
 * keputusan agent (tool apa, nomor order apa, nominal berapa, jawaban apa), tanpa menyimpan data pribadi
 * yang tidak diperlukan: nomor HP, nomor rekening/angka panjang, alamat, nama, email, token, dan query
 * URL bertanda tangan.
 *
 * Batas yang disengaja: nama atau alamat yang ditulis customer di dalam TEKS BEBAS (mis. isi `pesan`
 * pada kirim_wa) tidak bisa dikenali dengan aturan sederhana, jadi tidak disamarkan. Karena itu data ini
 * hanya bisa dibaca service role, retensinya 90 hari, dan versi yang nanti dikirim ke model analisis
 * (Fase 2) disaring ulang.
 */

export interface ToolCallRecord {
  seq: number;
  tool_name: string;
  tool_arguments: Record<string, unknown>;
  tool_result: string;
  status: 'ok' | 'error';
  duration_ms: number;
}

export const MAX_STRING = 600;
export const MAX_RESULT = 1200;

// Nomor HP Indonesia (08…, 628…, +628…). Tidak diawali huruf/angka lain, supaya resi (JO0330…) tidak ikut.
const PHONE_RE = /(?<![A-Za-z\d])(?:\+?62|0)8\d{7,12}(?!\d)/g;
// Angka panjang berdiri sendiri (rekening, NIK, dst.). Nomor order/resi mengandung huruf di depannya, jadi lolos.
const LONG_DIGITS_RE = /(?<![A-Za-z\d])\d{9,}(?!\d)/g;
// UUID (mis. wa_inbox.id) HARUS utuh: dipakai sebagai kunci penghubung run <-> eskalasi. Segmen akhirnya
// 12 karakter bisa berupa angka semua, jadi tanpa perlindungan ini ikut tersamarkan sebagai angka panjang.
const UUID_SPLIT_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

/** Pertahankan 2 digit awal dan 3 digit akhir. Cukup untuk dikenali admin, tidak cukup untuk dipakai ulang. */
export function maskDigits(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length <= 5) return '***';
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 5)}${digits.slice(-3)}`;
}

function stripUrlQuery(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  return /x-amz|signature|token|key|sig=|expires/i.test(url.slice(q)) ? `${url.slice(0, q)}?[disamarkan]` : url;
}

/** Samarkan teks bebas lalu potong. Spasi dirapikan menjadi satu baris. */
export function redactText(input: unknown, max = MAX_RESULT): string {
  let text = String(input ?? '');
  text = text.replace(BEARER_RE, 'Bearer [disamarkan]');
  text = text.replace(URL_RE, stripUrlQuery);
  text = text.replace(EMAIL_RE, '[email]');
  // split dengan grup penangkap: indeks ganjil = UUID (dibiarkan), indeks genap = teks biasa (angka disamarkan).
  text = text
    .split(UUID_SPLIT_RE)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(PHONE_RE, (m) => maskDigits(m)).replace(LONG_DIGITS_RE, (m) => maskDigits(m)),
    )
    .join('');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const PHONE_KEYS = new Set(['nomor', 'nomor_customer', 'target', 'sender', 'no_wa', 'whatsapp', 'telepon', 'phone']);
const HIDE_KEYS = new Set([
  'alamat',
  'alamat_lengkap',
  'alamat_pengiriman',
  'nama',
  'nama_customer',
  'nama_penerima',
  'no_rek',
  'rekening',
  'nomor_rekening',
]);
const DROP_KEYS = new Set(['proof_url']);

function redactValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactText(value, MAX_STRING);
  if (depth >= 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => redactValue(entry, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(key)) continue;
      if (++count > 30) break;
      out[key] = redactKeyed(key, entry, depth);
    }
    return out;
  }
  return String(value);
}

function redactKeyed(key: string, value: unknown, depth: number): unknown {
  if (value === '' || value == null) return value;
  if (PHONE_KEYS.has(key)) return typeof value === 'object' ? '[disamarkan]' : maskDigits(String(value));
  if (HIDE_KEYS.has(key)) return '[disamarkan]';
  return redactValue(value, depth + 1);
}

/** Argumen tool (JSON mentah dari model) → objek yang sudah disamarkan. Tidak pernah melempar error. */
export function redactArgs(rawArgs: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return redactValue(parsed, 0) as Record<string, unknown>;
    }
    return { _raw: redactText(rawArgs, MAX_STRING) };
  } catch {
    return { _raw: redactText(rawArgs, MAX_STRING) };
  }
}

export function redactResult(text: unknown): string {
  return redactText(text, MAX_RESULT);
}
