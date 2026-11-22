/**
 * Pengaman pasangan foto katalog + keterangan (caption) di `kirim_wa`.
 *
 * Latar belakang: keterangan dan URL foto diisi bebas oleh model di setiap panggilan. Pernah satu run
 * mengirim tiga foto sekaligus dengan keterangan yang bergeser satu (foto Kandora Navy dikirim dengan
 * keterangan "Kandora Broken White", foto Coffee Brown dengan "Kandora Navy"). Fungsi ini mendeteksi
 * pasangan yang jelas salah SEBELUM pesan terkirim, supaya model diminta memperbaikinya.
 *
 * Prinsip: fail-open. Hanya menolak kalau yakin salah. Keterangan umum tanpa nama produk, URL bukan foto
 * katalog, atau nama yang tidak bisa dikenali selalu lolos. Fungsi murni (tanpa jaringan/Deno) supaya bisa diuji.
 */

export type PairingResult = { ok: true } | { ok: false; message: string };

/** Jalur foto katalog: .../katalog/<kategori>/<slug-produk>/<file> */
const CATALOG_URL = /\/katalog\/([^/?#]+)\/([^/?#]+)\//i;

/** Kata kategori produk yang diikuti nama produk/warna di keterangan. */
const CATEGORY_WORDS = '(?:[Kk]andora|[Tt]hobe|[Kk]oko|[Vv]est|[Kk]abak)';

/**
 * Nama produk di keterangan ditulis berawalan huruf besar ("Kandora Broken White"). Hanya pola itu yang
 * dianggap menyebut produk, jadi kalimat umum seperti "warna-warna Kandora yang ready" tidak ikut.
 * Sengaja TANPA flag `i`: huruf besar di awal kata nama itulah penandanya.
 */
const MENTION = new RegExp(`\\b${CATEGORY_WORDS}\\s+([A-Z][A-Za-z]{2,})(?:\\s+([A-Z][A-Za-z]{2,}))?`, 'g');

/** Kata berawalan huruf besar yang BUKAN nama produk/warna (sapaan, kata sambung, dsb). */
const NOT_A_NAME = new Set([
  'ka', 'kak', 'kakak', 'kami', 'kita', 'kamu', 'yang', 'ini', 'itu', 'nya', 'dan', 'atau', 'untuk', 'dengan',
  'tanpa', 'ready', 'ukuran', 'warna', 'series', 'model', 'bahan', 'kain', 'tersedia', 'size', 'harga',
  'stok', 'sama', 'juga', 'bisa', 'ada', 'pakai', 'cocok', 'paling', 'lagi', 'dari', 'ke', 'di', 'ya',
  'masih', 'sudah', 'lengan', 'kerah', 'resleting', 'tali', 'tarbush', 'potongan', 'modern', 'slim',
  'regular', 'fit', 'foto', 'contoh', 'terbaru', 'premium', 'lebih', 'adem', 'rapi', 'praktis',
]);

function titleCase(token: string): string {
  return token ? token.charAt(0).toUpperCase() + token.slice(1) : token;
}

/** Jarak edit (Levenshtein) kecil, untuk toleransi salah ketik di slug ("coffe" vs "coffee"). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

function sameWord(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 4 && editDistance(x, y) <= 1;
}

/** Token slug tanpa kata kategori: "kandora-broken-white" -> ["broken", "white"]. */
function slugTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !new RegExp(`^${CATEGORY_WORDS}$`).test(token));
}

/** Nama produk dari slug untuk pesan ke model: "kandora-navy" -> "Kandora Navy". */
export function labelFromSlug(slug: string): string {
  return slug
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(titleCase)
    .join(' ');
}

/** Nama produk yang disebut di keterangan: tiap hasil berupa kata-kata setelah kategori. */
export function productMentions(caption: string): string[][] {
  const found: string[][] = [];
  const text = String(caption || '');
  MENTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION.exec(text)) !== null) {
    const words = [match[1], match[2]].filter((word): word is string => Boolean(word));
    // Buang kata yang bukan nama (sapaan dsb); berhenti di kata pertama yang bukan nama.
    const names: string[] = [];
    for (const word of words) {
      if (NOT_A_NAME.has(word.toLowerCase())) break;
      names.push(word);
    }
    if (names.length) found.push(names);
  }
  return found;
}

/**
 * Cek pasangan URL foto dan keterangan.
 * Menolak hanya bila URL adalah foto katalog dan SEMUA nama produk di keterangan tidak cocok dengan produk di URL.
 */
export function checkPhotoPairing(url: string, caption: string): PairingResult {
  try {
    const target = String(url || '').trim();
    if (!target) return { ok: true };
    const match = CATALOG_URL.exec(target);
    if (!match) return { ok: true };

    const slug = decodeURIComponent(match[2]);
    const urlTokens = slugTokens(slug);
    if (!urlTokens.length) return { ok: true };

    const mentions = productMentions(caption);
    if (!mentions.length) return { ok: true };

    const matchesUrl = (names: string[]) => names.some((name) => urlTokens.some((token) => sameWord(name, token)));
    if (mentions.some(matchesUrl)) return { ok: true };

    const mentioned = mentions.map((names) => names.join(' ')).join(' / ');
    const category = titleCase(String(match[1]).toLowerCase());
    return {
      ok: false,
      message:
        `Pesan TIDAK dikirim: foto ini adalah ${labelFromSlug(slug)} (dari URL-nya), tetapi keterangan menyebut ` +
        `"${category} ${mentioned}". Pasangkan ulang: keterangan harus sesuai foto. Pakai URL foto ${category} ${mentioned} ` +
        `untuk keterangan itu, atau ubah keterangan menjadi untuk ${labelFromSlug(slug)}.`,
    };
  } catch {
    // Pengaman tidak boleh menghalangi pengiriman kalau ada hal tak terduga.
    return { ok: true };
  }
}
