const STOP_WORDS = new Set(
  'apa yang ada dan atau dari untuk dengan ini itu bagaimana gimana cara kak ya dong sih yg di ke saja apakah bisa tolong info jelaskan tentang mau customer admin kalau jika harus seperti menghadapi menangani balas membalas respon respons script contoh kasus produk bahan perbedaan beda bedanya antara harga stok ukuran warna seri thobe gamis koko nama size chart fabric collection series'.split(
    ' ',
  ),
);

export function tokenize(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\[\]().,?!:;"'&/]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export const CATEGORY_SYNONYMS: [RegExp, string][] = [
  [/komplain|keluh|kecewa|rusak|cacat|jahit/, 'Complaint Handling'],
  [/kirim|pengiriman|ongkir|resi|ekspedisi|cepat|sampai/, 'Shipping Information'],
  [/bayar|pembayaran|transfer|lunas/, 'Payment Confirmation'],
  [/order|pesan|checkout/, 'Ordering'],
  [/follow|menghilang|tidak membalas|gak bales/, 'Follow Up'],
  [/sapa|salam|greeting|opening|pembuka/, 'Greeting & Opening'],
  [/ukuran|size|kekecilan|kebesaran/, 'Size Consultation'],
  [/bahan|kain|fabric|panas|adem/, 'Fabric Inquiry'],
  [/harga|mahal|diskon|murah|promo/, 'Price Inquiry'],
  [/create your price|cyp/, 'Create Your Price'],
  [/refund|retur|tukar|purna|after sales/, 'After Sales'],
  [/stok|ready|tersedia|produk/, 'Product Inquiry'],
];

export function relevanceScore(question: string, text: string, category?: string): number {
  const lowerQuestion = question.toLowerCase();
  const questionTokens = [...new Set(tokenize(question))];
  const textTokens = tokenize(text);
  let score = questionTokens.filter((word) =>
    textTokens.some((token) => token === word || (word.length >= 5 && token.startsWith(word.slice(0, 5)))),
  ).length;
  if (CATEGORY_SYNONYMS.some(([pattern, expected]) => expected === category && pattern.test(lowerQuestion))) {
    score += 2;
  }
  return score;
}
