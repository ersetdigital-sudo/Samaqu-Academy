import type { WaRun } from './wa-api';

/**
 * Mengubah baris mentah `wa_agent_runs` jadi kartu yang mudah dibaca di tab Log Bot.
 *
 * Murni (tanpa React/jaringan) supaya bisa diuji dengan data run nyata. Isi `detail` ditulis oleh
 * wa-agent (`index.ts` + `trace.ts`) dengan format tetap: blok "BALASAN TERKIRIM", "CATATAN MODEL",
 * "TOOL", lalu "LANGKAH BOT" (KONTEKS, RONDE n, → tool, ⇒ hasil, ! kejadian). Run lama (sebelum
 * jejak langkah ada) hanya punya tiga blok pertama; nama customer dan isi pesannya tidak tersedia
 * dan kartunya tampil lebih ringkas.
 */

export type RunKind = 'dibalas' | 'perhatian' | 'gagal' | 'jaring' | 'diambil_alih' | 'uji' | 'mode' | 'berjalan' | 'kosong';
export type RunTone = 'ok' | 'bad' | 'warn' | 'info' | 'muted';

export interface StepTool {
  call: string;
  result: string;
}
export interface StepRound {
  title: string;
  text: string;
  tools: StepTool[];
}
export interface ParsedSteps {
  context: string;
  rounds: StepRound[];
  events: string[];
}

export interface ParsedRun {
  run: WaRun;
  kind: RunKind;
  label: string;
  tone: RunTone;
  /** Satu kalimat: apa yang terjadi, dalam bahasa biasa. */
  headline: string;
  customerName: string;
  customerPhone: string;
  customerText: string;
  botText: string;
  tools: string[];
  seconds: string;
  steps: ParsedSteps | null;
  /** Run yang perlu dilihat admin (gagal, jaring pengaman, belum terbalas). */
  attention: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  cari_produk: 'cari produk',
  detail_produk: 'detail produk',
  info_bahan: 'info bahan',
  info_series: 'info series',
  kirim_wa: 'kirim WA',
  lewati_wa: 'lewati pesan',
  catat_closing: 'catat closing',
  rekap_pesanan: 'rekap pesanan',
  cek_ongkir: 'cek ongkir',
  cari_area_ongkir: 'cari area ongkir',
  cek_pesanan: 'cek pesanan',
  cek_resi: 'cek resi',
  catat_lead: 'catat lead',
  cek_lead_duplikat: 'cek lead',
  daftar_lead: 'daftar lead',
  opsi_lead: 'opsi lead',
  teruskan_admin: 'teruskan ke admin',
  pesan_wa_masuk: 'baca pesan masuk',
};

export function toolLabel(name: string): string {
  return TOOL_LABEL[name] || name.replace(/_/g, ' ');
}

const clip = (text: string, max: number) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
};

export function formatSeconds(ms: number | null | undefined): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${(value / 1000).toFixed(1).replace('.', ',')} dtk`;
}

/** Pesan error teknis → kalimat yang dimengerti admin. */
export function plainError(error: string | null | undefined): string {
  const raw = String(error || '').trim();
  if (!raw) return 'Run berhenti karena error yang tidak tercatat.';
  if (/run tidak selesai|terputus/i.test(raw)) {
    return 'Run terputus sebelum selesai (biasanya batas waktu server). Pesan customer dikembalikan ke antrean.';
  }
  if (/abort|timeout|timed out|waktu/i.test(raw)) {
    return 'Model AI tidak menjawab dalam batas waktu. Pesan customer dikembalikan ke antrean dan dicoba lagi.';
  }
  if (/saldo|balance|insufficient|quota|kuota|\b402\b/i.test(raw)) return 'Saldo atau kuota penyedia AI habis.';
  if (/\b401\b|\b403\b|api key|unauthor|invalid.*token|authorization/i.test(raw)) {
    return 'Kunci API penyedia AI ditolak. Cek pengaturan AI.';
  }
  if (/\b429\b|rate limit|too many/i.test(raw)) return 'Penyedia AI membatasi permintaan (terlalu sering). Dicoba lagi otomatis.';
  if (/\b5\d\d\b|bad gateway|unavailable|server error/i.test(raw)) return 'Penyedia AI sedang bermasalah. Dicoba lagi otomatis.';
  return `Terjadi error: ${clip(raw, 160)}`;
}

/* ── parsing isi `detail` ─────────────────────────────────────────────── */


function sectionBlock(detail: string, header: string): string {
  const start = detail.indexOf(header);
  if (start < 0) return '';
  const rest = detail.slice(start + header.length);
  const next = rest.search(/\n\n(BALASAN TERKIRIM:|CATATAN MODEL:|TOOL:|BELUM TERJAWAB:|LANGKAH BOT)/);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

export function parseSteps(detail: string): ParsedSteps | null {
  const start = detail.indexOf('LANGKAH BOT');
  if (start < 0) return null;
  const lines = detail.slice(start).split('\n').slice(1);
  const steps: ParsedSteps = { context: '', rounds: [], events: [] };
  let section: 'context' | 'round' | null = null;
  let round: StepRound | null = null;
  const context: string[] = [];

  for (const line of lines) {
    if (line.startsWith('KONTEKS')) {
      section = 'context';
      continue;
    }
    if (/^RONDE \d+/.test(line)) {
      round = { title: line.replace(/^RONDE /, 'Ronde '), text: '', tools: [] };
      steps.rounds.push(round);
      section = 'round';
      continue;
    }
    if (line.startsWith('! ')) {
      steps.events.push(line.slice(2).trim());
      section = null;
      continue;
    }
    if (section === 'context') {
      context.push(line);
      continue;
    }
    if (section === 'round' && round) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Model menulis:')) round.text = trimmed.slice('Model menulis:'.length).trim();
      else if (trimmed.startsWith('(model')) round.text = trimmed;
      else if (trimmed.startsWith('→ ')) round.tools.push({ call: trimmed.slice(2), result: '' });
      else if (trimmed.startsWith('⇒ ') && round.tools.length) round.tools[round.tools.length - 1].result = trimmed.slice(2);
    }
  }
  steps.context = context.join('\n').trim();
  return steps.rounds.length || steps.events.length || steps.context ? steps : null;
}

export interface ParsedDetail {
  customerName: string;
  customerPhone: string;
  customerText: string;
  botText: string;
  steps: ParsedSteps | null;
}

export function parseDetail(detail: string | null | undefined): ParsedDetail {
  const text = String(detail || '');
  const out: ParsedDetail = { customerName: '', customerPhone: '', customerText: '', botText: '', steps: null };
  if (!text) return out;

  // Customer: baris "• [id] Nama · 628…" di KONTEKS; cadangan: "ke 628… [id]" di balasan terkirim.
  const who = text.match(/•\s*\[[^\]]*\]\s*(?:(.*?)\s*·\s*)?(\+?\d[\d ]{7,})/);
  if (who) {
    out.customerName = clip(who[1] || '', 40);
    out.customerPhone = who[2].replace(/\s/g, '');
  }
  const typed = [...text.matchAll(/Pesan sekarang: "([\s\S]*?)"(?=\n|$)/g)].map((m) => clip(m[1], 200)).filter(Boolean);
  if (typed.length) out.customerText = clip(typed.join(' / '), 240);

  const sent = sectionBlock(text, 'BALASAN TERKIRIM:');
  if (sent) {
    const replies = [...sent.matchAll(/•\s*ke\s+(\+?\d+)(?:\s*\[[^\]]*\])?\n([\s\S]*?)(?=\n\n•\s*ke\s|$)/g)];
    if (replies.length) {
      out.botText = clip(replies.map((m) => m[2]).join(' / '), 320);
      if (!out.customerPhone) out.customerPhone = replies[0][1];
    }
  }
  out.steps = parseSteps(text);
  return out;
}

/* ── klasifikasi ──────────────────────────────────────────────────────── */

export function parseRun(run: WaRun): ParsedRun {
  const detail = parseDetail(run.detail);
  const note = String(run.note || '').trim();
  const tools = (run.tools || []).map(toolLabel);
  const base = {
    run,
    customerName: detail.customerName,
    customerPhone: detail.customerPhone,
    customerText: detail.customerText,
    botText: detail.botText,
    tools,
    seconds: formatSeconds(run.duration_ms),
    steps: detail.steps,
  };

  if (run.mode === 'running') {
    return { ...base, kind: 'berjalan', label: 'Berjalan', tone: 'info', headline: 'Sedang diproses…', attention: false };
  }
  if (run.mode === 'switch' || run.mode === 'takeover') {
    return {
      ...base,
      kind: 'mode',
      label: run.mode === 'switch' ? 'Ganti mode' : 'Ambil alih',
      tone: 'info',
      headline: note || detail.botText || (run.mode === 'switch' ? 'Mode bot diubah.' : 'Percakapan diambil alih admin.'),
      attention: false,
    };
  }
  if (run.error || run.mode === 'error') {
    return {
      ...base,
      kind: 'gagal',
      label: 'Gagal',
      tone: 'bad',
      headline: plainError(run.error),
      attention: true,
    };
  }
  if (/^jaring pengaman/i.test(note)) {
    return {
      ...base,
      kind: 'jaring',
      label: 'Jaring pengaman',
      tone: 'warn',
      headline: note.replace(/^jaring pengaman:\s*/i, '').replace(/^./, (c) => c.toUpperCase()),
      attention: true,
    };
  }
  if (run.mode === 'dry' || run.mode === 'test') {
    return { ...base, kind: 'uji', label: 'Uji', tone: 'muted', headline: 'Run uji (tanpa kirim WhatsApp).', attention: false };
  }
  if ((run.handled || 0) === 0) {
    if ((run.held || 0) > 0 || /diambil alih admin/i.test(note)) {
      return {
        ...base,
        kind: 'diambil_alih',
        label: 'Diambil alih admin',
        tone: 'muted',
        headline: `${run.held || 'Beberapa'} pesan dilewati karena percakapannya sedang ditangani admin.`,
        attention: false,
      };
    }
    return {
      ...base,
      kind: 'kosong',
      label: 'Kosong',
      tone: 'muted',
      headline: /diproses run lain/i.test(note) ? 'Percakapan sedang diproses run lain.' : 'Tidak ada pesan baru.',
      attention: false,
    };
  }
  if ((run.replied || 0) > 0 && (run.leftover || 0) === 0) {
    return {
      ...base,
      kind: 'dibalas',
      label: 'Dibalas',
      tone: 'ok',
      headline: (run.replied || 0) > 1 ? `${run.replied} pesan dibalas.` : 'Pesan customer dibalas.',
      attention: false,
    };
  }
  return {
    ...base,
    kind: 'perhatian',
    label: 'Belum terbalas',
    tone: 'warn',
    headline: `${run.leftover || run.handled} pesan belum terbalas dan dikembalikan ke antrean.`,
    attention: true,
  };
}

/* ── filter dan ringkasan ─────────────────────────────────────────────── */

export type LogFilter = 'perlu' | 'semua' | 'gagal' | 'jaring';

export function applyFilter(items: ParsedRun[], filter: LogFilter, showEmpty: boolean): ParsedRun[] {
  return items.filter((item) => {
    if (item.kind === 'kosong' && !showEmpty) return false;
    if (filter === 'semua') return true;
    if (filter === 'gagal') return item.kind === 'gagal';
    if (filter === 'jaring') return item.kind === 'jaring';
    return item.attention;
  });
}

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

export interface LogSummary {
  replied: number;
  failed: number;
  safety: number;
  avgSeconds: string;
}

/** Ringkasan HARI INI (WIB) dari run yang dimuat. */
export function summarize(items: ParsedRun[], now: Date = new Date()): LogSummary {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  let replied = 0;
  let failed = 0;
  let safety = 0;
  const durations: number[] = [];
  for (const item of items) {
    if (dayKey(item.run.created_at) !== today) continue;
    if (item.kind === 'dibalas' || item.kind === 'perhatian') replied += Number(item.run.replied) || 0;
    if (item.kind === 'gagal') failed += 1;
    if (item.kind === 'jaring') safety += 1;
    if (item.kind === 'dibalas' && Number(item.run.duration_ms) > 0) durations.push(Number(item.run.duration_ms));
  }
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  return { replied, failed, safety, avgSeconds: avg ? `${(avg / 1000).toFixed(0)} dtk` : '-' };
}

/** Hitung per jenis untuk label chip filter. */
export function countKinds(items: ParsedRun[], showEmpty: boolean) {
  const visible = items.filter((item) => showEmpty || item.kind !== 'kosong');
  return {
    perlu: visible.filter((item) => item.attention).length,
    semua: visible.length,
    gagal: visible.filter((item) => item.kind === 'gagal').length,
    jaring: visible.filter((item) => item.kind === 'jaring').length,
  };
}
