import { getProductFieldLabel, getProductFields, isGarment } from '@/lib/product-schema';
import type {
  BeforeAfter,
  CaseStudy,
  FlowStage,
  GuideSection,
  Problem,
  Product,
  ProductCategory,
  Script,
} from '@/lib/types';
import { rupiah } from '@/lib/utils/format';
import { relevanceScore, tokenize } from './text';
import type { AssistantAnswer, AssistantField, AssistantSection } from './types';

export interface AssistantContext {
  products: Product[];
  scripts: Script[];
  cases: CaseStudy[];
  beforeAfter: BeforeAfter[];
  problems: Problem[];
  guides: GuideSection[];
  flow: FlowStage[];
}

const KNOWLEDGE_BASE = [
  {
    keywords: ['ukuran', 'size', 'thobe'],
    answer:
      'Untuk merekomendasikan ukuran thobe:\n1. Tanyakan tinggi dan berat badan customer.\n2. Tanyakan ukuran yang biasa dipakai (kemeja/kaos).\n3. Cocokkan dengan Size Chart resmi di menu Product Knowledge.\n4. Jika berada di antara dua ukuran, jelaskan perbedaan fit-nya dan biarkan customer memilih.\n5. Informasikan kebijakan tukar ukuran sesuai SOP.',
  },
  {
    keywords: ['b-01', 'a-02', 'bahan', 'perbedaan'],
    answer:
      'Data detail bahan B-01 dan A-02 belum tersedia di knowledge base contoh ini.\n\nYang bisa dilakukan admin:\n• Rujuk halaman Product Knowledge → Fabric Collection.\n• Kirim foto detail bahan resmi kepada customer.\n• Jika ragu, konfirmasi ke tim produk sebelum menjawab.\n\nJangan mengarang karakteristik bahan.',
  },
  {
    keywords: ['create your price', 'cyp'],
    answer:
      'Cara menjelaskan Create Your Price:\n1. Jelaskan konsep program secara singkat (gunakan definisi resmi).\n2. Jelaskan langkah-langkahnya satu per satu.\n3. Beri contoh sederhana.\n4. Tanyakan apakah customer ingin dibantu memulai.\n\nGunakan script "Create Your Price" di Script Library sebagai acuan.',
  },
  {
    keywords: ['refund', 'retur', 'kembali'],
    answer:
      'Menangani customer yang meminta refund:\n1. Tunjukkan empati dan minta maaf atas ketidaknyamanan.\n2. Minta nomor pesanan dan bukti (foto/video).\n3. Cek kelayakan berdasarkan kebijakan retur resmi.\n4. Jelaskan opsi yang tersedia (tukar/refund) sesuai SOP.\n5. Eskalasi ke supervisor bila di luar kewenangan.\n\nJangan menjanjikan refund sebelum verifikasi.',
  },
];

const CATEGORY_WORDS: [string, ProductCategory][] = [
  ['thobe', 'Thobe'],
  ['gamis', 'Gamis'],
  ['koko', 'Koko'],
  ['size chart', 'Size Chart'],
  ['seri', 'Product Series'],
  ['series', 'Product Series'],
  ['bahan', 'Fabric Collection'],
  ['fabric', 'Fabric Collection'],
];

function categoryFromQuestion(question: string): ProductCategory | null {
  const lower = question.toLowerCase();
  const match = CATEGORY_WORDS.find(([word]) => lower.includes(word));
  return match ? match[1] : null;
}

function findProducts(question: string, products: Product[]): Product[] {
  const lower = question.toLowerCase();
  const byCode = products.filter((product) => {
    if (!product.code) return false;
    const code = product.code.toLowerCase().replace(/[-]/g, '\\-');
    return new RegExp(`(^|[^a-z0-9])${code}($|[^a-z0-9])`).test(lower);
  });
  if (byCode.length) return byCode;

  const questionTokens = tokenize(question);
  if (!questionTokens.length) return [];
  const ranked = products
    .map((product) => {
      const textTokens = tokenize(
        [product.name, product.series, product.fabric, product.composition].join(' '),
      );
      const score = questionTokens.filter((word) => textTokens.includes(word)).length;
      return { product, score };
    })
    .filter((entry) => entry.score > 0);
  const max = Math.max(0, ...ranked.map((entry) => entry.score));
  return ranked
    .filter((entry) => entry.score === max && (max >= 2 || questionTokens.length <= 2))
    .map((entry) => entry.product)
    .slice(0, 4);
}

interface ProductValue {
  value: string;
  productIds?: string[];
  table?: string;
}

function productValue(product: Product, key: keyof Product, context: AssistantContext): ProductValue {
  const raw = product[key];
  if (key === 'price') return { value: rupiah(raw as string) };
  if (key === 'gsm') return { value: raw ? `${String(raw)} GSM` : '' };
  if (key === 'fabric') {
    const value = String(raw ?? '');
    if (!value) return { value: '' };
    const fabric = context.products.find(
      (entry) => entry.category === 'Fabric Collection' && entry.code === value,
    );
    return {
      value: fabric ? `${fabric.name} (${value})` : value,
      productIds: fabric ? [fabric.id] : undefined,
    };
  }
  if (key === 'memberIds') {
    const members = (Array.isArray(raw) ? raw : [])
      .map((id) => context.products.find((entry) => entry.id === id))
      .filter(Boolean) as Product[];
    return {
      value: members.map((member) => member.name).join(', '),
      productIds: members.map((member) => member.id),
    };
  }
  if (key === 'table') return { value: '', table: String(raw ?? '') };
  return { value: raw == null ? '' : String(raw) };
}

function detailSection(
  product: Product,
  question: string,
  context: AssistantContext,
): { section: AssistantSection; hasEmpty: boolean } {
  const lower = question.toLowerCase();
  let fields = getProductFields(product.category).filter((field) => field.key !== 'name');

  if (isGarment(product.category)) {
    if (/harga|price|berapa/.test(lower)) {
      fields = fields.filter((field) => ['price', 'status', 'sizes', 'colors'].includes(field.key));
    } else if (/stok|ready|tersedia|ada gak|habis/.test(lower)) {
      fields = fields.filter((field) => ['status', 'sizes', 'colors'].includes(field.key));
    } else if (/warna|varian/.test(lower)) {
      fields = fields.filter((field) => ['colors', 'status'].includes(field.key));
    }
  }

  let hasEmpty = false;
  const mapped: AssistantField[] = fields.map((field) => {
    const value = productValue(product, field.key, context);
    if (!value.value && !value.table) hasEmpty = true;
    return {
      label: field.label,
      value: value.value || '—',
      productIds: value.productIds,
      table: value.table || undefined,
    };
  });

  return {
    section: {
      kind: 'product-detail',
      product,
      fields: mapped,
    },
    hasEmpty,
  };
}

export function answerQuestion(question: string, context: AssistantContext): AssistantAnswer {
  const lower = question.toLowerCase();
  const hits = findProducts(question, context.products);
  const listQuery = /(apa saja|daftar|list|ada apa|semua|pilihan)/.test(lower);
  const category = categoryFromQuestion(question);
  const sections: AssistantSection[] = [];
  let productCount = 0;
  let hasEmptyProductData = false;
  let productAnswerPresent = false;

  if (listQuery && category) {
    const products = context.products.filter((product) => product.category === category);
    productCount = products.length;
    productAnswerPresent = true;
    if (products.length) {
      sections.push({
        kind: 'product-list',
        title: `Ada ${products.length} data di kategori ${category}:`,
        products,
      });
    } else {
      sections.push({
        kind: 'text',
        text: `Belum ada data di kategori ${category}. Tambahkan di menu Product Knowledge.`,
      });
    }
  } else if (
    hits.length >= 2 &&
    /(beda|perbedaan|banding|vs|versus|atau)/.test(lower)
  ) {
    productAnswerPresent = true;
    productCount = hits.length;
    const keys = [
      ...new Set(
        hits.flatMap((product) =>
          getProductFields(product.category)
            .map((field) => field.key)
            .filter((key) => !['name', 'memberIds', 'table'].includes(key)),
        ),
      ),
    ].filter((key) =>
      hits.some((product) => {
        const value = productValue(product, key, context).value;
        return Boolean(value);
      }),
    );
    const rows = keys.map((key) => ({
      label: getProductFieldLabel(hits[0].category, key),
      values: hits.map((product) => productValue(product, key, context).value || '—'),
    }));
    sections.push({
      kind: 'comparison',
      title: 'Berikut perbandingan dari data Product Knowledge:',
      products: hits,
      rows,
    });
  } else if (hits.length) {
    productAnswerPresent = true;
    productCount = hits.length;
    hits.forEach((product) => {
      const detail = detailSection(product, question, context);
      hasEmptyProductData = hasEmptyProductData || detail.hasEmpty;
      sections.push(detail.section);
    });
    const garment = hits.find((product) => isGarment(product.category));
    if (garment && /(ukuran|size)/.test(lower)) {
      const sizeChart = context.products.find(
        (product) =>
          product.category === 'Size Chart' &&
          product.name.toLowerCase().includes(garment.category.toLowerCase()),
      );
      if (sizeChart) {
        const detail = detailSection(sizeChart, '', context);
        hasEmptyProductData = hasEmptyProductData || detail.hasEmpty;
        sections.push(detail.section);
        productCount += 1;
      }
    }
  }

  const problemMatches = context.problems
    .map((problem) => ({
      problem,
      score: relevanceScore(
        question,
        [problem.title, problem.situation, problem.concern].join(' '),
        problem.scriptCategories[0],
      ),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (problemMatches[0]) {
    sections.push({ kind: 'problem', item: problemMatches[0].problem });
  }

  const guideMatches = context.guides
    .map((guide) => ({
      guide,
      score: relevanceScore(
        question,
        [guide.title, guide.summary, (guide.points ?? []).join(' '), (guide.pairs ?? []).join(' ')].join(' '),
      ),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (guideMatches[0]) {
    sections.push({ kind: 'guide', item: guideMatches[0].guide });
  }

  const flowMatches = context.flow
    .map((stage) => ({
      stage,
      score: relevanceScore(question, [stage.title, stage.description, stage.goal].join(' ')),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (flowMatches[0]) {
    sections.push({ kind: 'flow', item: flowMatches[0].stage });
  }

  const caseMatches = context.cases
    .map((caseStudy) => ({
      caseStudy,
      score: relevanceScore(
        question,
        [
          caseStudy.title,
          caseStudy.situation,
          caseStudy.customerMessage,
          caseStudy.adminPrevious,
          caseStudy.finding,
        ].join(' '),
        caseStudy.category,
      ),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.caseStudy);
  if (caseMatches.length) {
    sections.push({ kind: 'cases', title: 'Studi kasus terkait', items: caseMatches });
  }

  const scriptMatches = context.scripts
    .map((script) => ({
      script,
      score: relevanceScore(
        question,
        [
          script.title,
          script.situation,
          script.response,
          script.variants.join(' '),
          script.tags.join(' '),
        ].join(' '),
        script.category,
      ),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.script);
  if (scriptMatches.length) {
    sections.push({ kind: 'scripts', title: 'Script terkait', items: scriptMatches });
  }

  const beforeAfterMatches = context.beforeAfter
    .map((item) => ({
      item,
      score: relevanceScore(question, [item.title, item.before, item.after].join(' '), item.category),
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((entry) => entry.item);
  if (beforeAfterMatches.length) {
    sections.push({ kind: 'before-after', title: 'Before & After', items: beforeAfterMatches });
  }

  const knowledge = KNOWLEDGE_BASE.find((entry) =>
    entry.keywords.some((keyword) => lower.includes(keyword)),
  );

  if (!sections.length) {
    if (knowledge) {
      sections.push({ kind: 'text', text: knowledge.answer });
    } else {
      return {
        sections: [
          {
            kind: 'text',
            text: 'Maaf, informasi tersebut belum tersedia di Product Knowledge, Script Library, Problem Solving, maupun Communication Guidelines. Cek informasi resmi perusahaan atau tanyakan ke supervisor.',
          },
        ],
      };
    }
  } else if (knowledge && !productAnswerPresent) {
    sections.unshift({ kind: 'text', text: knowledge.answer });
  }

  return {
    sections,
    note: hasEmptyProductData
      ? 'Kolom bertanda — belum ada datanya. Jangan menebak; konfirmasi ke tim produk.'
      : undefined,
    source: productAnswerPresent
      ? `Sumber: Product Knowledge (${productCount} data). Jawaban disusun lokal di browser; selalu ikuti SOP resmi.`
      : 'Jawaban disusun dari data di browser (lokal). Selalu ikuti SOP dan informasi resmi perusahaan.',
  };
}
