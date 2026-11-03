import type { CaseStudy, Product, Script } from '@/lib/types';
import { clampScore } from '@/lib/utils/format';
import { relevanceScore, tokenize } from './text';
import type { ReviewDimension, ReviewResult, FlaggedMessage } from './types';

interface ReviewContext {
  products: Product[];
  scripts: Script[];
  cases: CaseStudy[];
}

export function reviewMessages(
  messages: { role: 'c' | 'a'; text: string }[],
  context: ReviewContext,
): ReviewResult {
  const adminMessages = messages.filter((message) => message.role === 'a').map((message) => message.text);
  const customerMessages = messages.filter((message) => message.role === 'c').map((message) => message.text);
  const adminText = adminMessages.join(' \n ').toLowerCase();
  const customerText = customerMessages.join(' ').toLowerCase();
  const count = (pattern: RegExp) => (adminText.match(pattern) || []).length;

  const pairs: [string, string | null][] = [];
  messages.forEach((message, index) => {
    if (message.role !== 'c') return;
    const reply = messages.slice(index + 1).find((next) => next.role === 'a');
    pairs.push([message.text, reply ? reply.text : null]);
  });

  const questions = pairs.filter((pair) =>
    /\?|gimana|berapa|bisa|ada gak|apa |kapan/.test(String(pair[0]).toLowerCase()),
  );
  const answered = questions.filter((pair) => pair[1] && pair[1].trim().length >= 15).length;
  const contextScore = questions.length ? 45 + (55 * answered) / questions.length : 72;

  const relevanceValues = pairs
    .filter((pair) => Boolean(pair[1]))
    .map((pair) => {
      const questionTokens = tokenize(pair[0]);
      const replyTokens = tokenize(pair[1] ?? '');
      if (!questionTokens.length) return 1;
      return (
        questionTokens.filter((word) =>
          replyTokens.some((token) => token.slice(0, 4) === word.slice(0, 4)),
        ).length / questionTokens.length
      );
    });
  const relevance = relevanceValues.length
    ? 40 + 60 * (relevanceValues.reduce((sum, value) => sum + value, 0) / relevanceValues.length)
    : 55;

  const averageLength = adminMessages.length
    ? adminMessages.reduce((sum, message) => sum + message.length, 0) / adminMessages.length
    : 0;
  const shortMessages = adminMessages.filter((message) => message.trim().length < 15).length;
  const longMessages = adminMessages.filter((message) => message.length > 400).length;
  const clarity = 85 - shortMessages * 14 - longMessages * 10 - (averageLength < 20 ? 10 : 0);

  const repeated = count(/oke baik/g) + Math.max(0, count(/mohon ditunggu/g) - 1);
  const formal = count(/dengan hormat|sehubungan dengan|demikian|kami informasikan bahwa/g);
  const usesKak = /\bkak\b/.test(adminText);
  const emojiCount =
    (adminMessages.join('').match(/\p{Extended_Pictographic}/gu) || []).length;
  const naturalness =
    80 + (usesKak ? 8 : -12) - repeated * 10 - formal * 12 - (emojiCount > adminMessages.length * 2 ? 10 : 0);

  const empathyWords = count(/maaf|paham|mengerti|terima kasih|makasih/g);
  const complaint = /kecewa|rusak|lepas|marah|lama|belum sampai|komplain|refund/.test(customerText);
  let empathy = 58 + Math.min(3, empathyWords) * 11;
  if (complaint && !/maaf|paham|mengerti/.test(adminText)) empathy = 32;
  if (count(/maaf/g) > 3) empathy -= 12;

  const questionMarks = count(/\?/g);
  const offers = count(/kami (bantu|cek|kirim|kabari)|mau kami|boleh (info|kirim|dibantu)/g);
  const proactive = 42 + Math.min(3, questionMarks) * 10 + Math.min(3, offers) * 9;

  const codes = (adminText.match(/\b[a-z]{1,3}-\d{2,3}\b/gi) || []).map((code) => code.toUpperCase());
  const unknownCodes = codes.filter(
    (code) => !context.products.some((product) => String(product.code || '').toUpperCase() === code),
  );
  const claims = count(/\b(adem|pasti|dijamin|100%|paling bagus)\b/g);
  const productContext = /bahan|ukuran|size|stok|ready|warna|harga|thobe|gamis|koko/.test(customerText);
  const productAccuracy = productContext
    ? 86 - unknownCodes.length * 20 - claims * 14
    : null;

  const orderContext = /order|pesan|checkout|alamat|transfer|bayar|ongkir|ambil yang/.test(customerText);
  const orderAccuracy = orderContext
    ? 45 +
      ['ukuran', 'alamat', 'jumlah', 'warna', 'ringkasan', 'nama penerima'].filter((word) =>
        adminText.includes(word),
      ).length *
        11
    : null;

  const lastAdmin = (adminMessages[adminMessages.length - 1] || '').toLowerCase();
  const closing = /ada lagi|kabari|silakan|mau kami|boleh|semoga|terima kasih|sama-sama|\?/.test(
    lastAdmin,
  )
    ? 84
    : 48;

  const vague = count(/usahakan|secepatnya|pasti sampai|dijamin/g);
  const expectationDetail = count(/kami kabari|setelah ada kepastian|estimasi|kami cek/g);
  const expectation = 70 - vague * 18 + Math.min(2, expectationDetail) * 10;

  const dims: ReviewDimension[] = (
    [
      [
        'Pemahaman konteks',
        contextScore,
        questions.length
          ? `${answered}/${questions.length} pertanyaan customer dijawab dengan cukup jelas`
          : 'Tidak banyak pertanyaan eksplisit',
      ],
      ['Relevansi jawaban', relevance, 'Kecocokan isi balasan dengan pertanyaan customer'],
      [
        'Kejelasan',
        clarity,
        shortMessages ? `${shortMessages} balasan terlalu singkat` : 'Panjang balasan sudah wajar',
      ],
      [
        'Naturalitas',
        naturalness,
        !usesKak
          ? 'Belum memakai sapaan "Kak"'
          : repeated
            ? 'Ada frasa yang diulang'
            : formal
              ? 'Ada kalimat terlalu formal'
              : 'Bahasa terasa natural',
      ],
      [
        'Empati',
        empathy,
        complaint && empathy < 50 ? 'Customer kecewa tapi belum ada empati' : 'Ungkapan empati dan terima kasih',
      ],
      [
        'Proaktif',
        proactive,
        questionMarks ? `${questionMarks} pertanyaan lanjutan/penawaran bantuan` : 'Belum ada pertanyaan lanjutan',
      ],
      [
        'Akurasi produk',
        productAccuracy,
        productAccuracy == null
          ? ''
          : unknownCodes.length
            ? `Menyebut kode yang tidak ada di Product Knowledge: ${unknownCodes.join(', ')}`
            : claims
              ? 'Ada klaim tanpa rujukan data resmi'
              : 'Tidak ada klaim yang bermasalah',
      ],
      ['Akurasi order', orderAccuracy, orderAccuracy == null ? '' : 'Konfirmasi detail ukuran/alamat/jumlah'],
      [
        'Closing',
        closing,
        closing > 60 ? 'Pesan terakhir memberi arah berikutnya' : 'Pesan terakhir belum menawarkan langkah berikutnya',
      ],
      [
        'Manajemen ekspektasi',
        expectation,
        vague ? 'Ada janji menggantung atau terlalu pasti' : 'Ekspektasi dikelola dengan jelas',
      ],
    ] as [string, number | null, string][]
  ).map(([name, value, note]) => ({
    name,
    value: value == null ? null : clampScore(value),
    note,
  }));

  const scored = dims.filter((dimension) => dimension.value != null);
  const overall = adminMessages.length
    ? Math.round(scored.reduce((sum, dimension) => sum + (dimension.value ?? 0), 0) / scored.length)
    : 0;

  const good = dims
    .filter((dimension) => dimension.value != null && dimension.value >= 78)
    .map((dimension) => `${dimension.name}: ${dimension.note}`);
  const improve = dims
    .filter((dimension) => dimension.value != null && dimension.value < 65)
    .map((dimension) => `${dimension.name}: ${dimension.note}`);

  const flagged: FlaggedMessage[] = [];
  messages.forEach((message) => {
    if (message.role !== 'a') return;
    const text = message.text;
    const lower = text.toLowerCase();
    const issues: [string, string][] = [];
    if (text.trim().length < 15) {
      issues.push(['Terlalu singkat', 'Tambahkan sapaan dan satu kalimat lanjutan yang membantu.']);
    }
    if (/usahakan|secepatnya/.test(lower)) {
      issues.push([
        'Janji menggantung',
        'Ganti dengan langkah konkret: "Kami cek dulu ya, Kak. Nanti kami kabari setelah ada kepastian."',
      ]);
    }
    if (/pasti|dijamin|adem/.test(lower)) {
      issues.push(['Klaim tanpa data', 'Rujuk informasi resmi dari Product Knowledge, atau tawarkan foto/detail.']);
    }
    if (/dengan hormat|kami informasikan bahwa/.test(lower)) {
      issues.push(['Terlalu formal', 'Pakai bahasa percakapan yang tetap sopan.']);
    }
    if (!/\bkak\b/.test(lower) && text.length >= 15) {
      issues.push(['Tanpa sapaan', 'Gunakan sapaan "Kak" agar terasa hangat.']);
    }
    if (issues.length) flagged.push({ text, issues });
  });

  const lastCustomer = customerMessages[customerMessages.length - 1] || '';
  const candidates = [
    ...context.scripts.map((script) => ({
      text: script.response,
      source: `Script: ${script.title}`,
      score: relevanceScore(lastCustomer, `${script.title} ${script.response}`, script.category),
    })),
    ...context.cases.map((caseStudy) => ({
      text: caseStudy.recommendation,
      source: `Studi kasus: ${caseStudy.title}`,
      score: relevanceScore(
        lastCustomer,
        `${caseStudy.title} ${caseStudy.customerMessage}`,
        caseStudy.category,
      ),
    })),
  ].sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const recommendation = best && best.score >= 2 ? { text: best.text, source: best.source } : null;

  return {
    overall,
    dims,
    good,
    improve,
    flagged,
    rec: recommendation,
    adminCount: adminMessages.length,
    provider: 'local-heuristic',
  };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export async function analyzeConversation(
  messages: { role: 'c' | 'a'; text: string }[],
  context: ReviewContext,
): Promise<ReviewResult> {
  await wait(450);
  return reviewMessages(messages, context);
}
