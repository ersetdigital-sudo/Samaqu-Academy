/**
 * Jejak langkah satu run bot untuk tab "Log Bot" di WA Inbox.
 *
 * Murni (tanpa jaringan) supaya bisa diuji. Isinya cukup untuk menjawab "kenapa bot menjawab begini?":
 * apa yang dilihat model (konteks), teks yang ditulis model tiap ronde, tool yang dipanggil beserta
 * argumen ringkas dan hasilnya, durasi, dan token.
 *
 * Catatan: model dipanggil dengan thinking dimatikan (lebih cepat dan murah), jadi TIDAK ada rantai
 * pikiran tersembunyi untuk ditampilkan. Yang tersedia: teks model + tool + hasilnya.
 */

import { redactArgs, redactResult, type ToolCallRecord } from './redact.ts';

export interface TraceUsage {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
}

export const TRACE_MAX_CHARS = 24_000;
/** Batas catatan tool terstruktur per run (satu run biasanya 1 sampai 6 panggilan). */
export const MAX_TOOL_RECORDS = 40;

/** Potong teks jadi satu baris pendek (spasi dirapikan). */
export function clip(text: unknown, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Argumen tool jadi "kunci=nilai, …" ringkas; URL bukti dan nilai kosong dilewati. */
export function argSummary(rawArgs: string, max = 220): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs || '{}');
  } catch {
    return clip(rawArgs, max);
  }
  if (!parsed || typeof parsed !== 'object') return clip(rawArgs, max);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key === 'proof_url' || value === '' || value == null) continue;
    let shown: string;
    if (Array.isArray(value)) shown = `[${value.length} item]`;
    else if (typeof value === 'object') shown = '{…}';
    else shown = clip(value, 70);
    parts.push(`${key}=${shown}`);
  }
  return clip(parts.join(', '), max);
}

export class RunTrace {
  private lines: string[] = [];
  private rounds = 0;
  /** Catatan tool terstruktur (argumen + hasil sudah disamarkan) untuk tabel wa_tool_calls. */
  private calls: ToolCallRecord[] = [];

  /** Teks yang dilihat model pada run ini (pesan masuk + riwayat). */
  context(text: string): void {
    this.lines.push(`KONTEKS (yang dilihat model):\n${String(text ?? '').trim().slice(0, 2500)}`);
  }

  /** Satu panggilan ke model. */
  round(opts: { ms: number; usage?: TraceUsage; content: string; viaText: boolean; calls: number; finish?: string | null }): void {
    this.rounds += 1;
    const u = opts.usage || {};
    const tokens = `token ${u.promptTokens ?? 0}+${u.completionTokens ?? 0}${u.cachedTokens ? ` (cache ${u.cachedTokens})` : ''}`;
    const finish = opts.finish && !['stop', 'tool_calls'].includes(opts.finish) ? ` · selesai: ${opts.finish}` : '';
    this.lines.push(`RONDE ${this.rounds} · ${(opts.ms / 1000).toFixed(1)} dtk · ${tokens}${finish}`);
    if (opts.content.trim()) {
      this.lines.push(`  Model menulis: ${clip(opts.content, 500)}${opts.viaText ? ' (panggilan tool ditulis sebagai teks)' : ''}`);
    } else {
      this.lines.push(opts.calls > 0 ? '  (model langsung memanggil tool, tanpa teks)' : '  (model tidak menghasilkan teks)');
    }
  }

  /** Satu tool dipanggil + hasilnya. */
  tool(name: string, rawArgs: string, result: string, ms: number, isError = false): void {
    this.lines.push(`  → ${name}(${argSummary(rawArgs)}) · ${ms} ms`);
    this.lines.push(`      ⇒ ${clip(result, 280)}`);
    // Catatan terstruktur: tidak boleh pernah mengganggu run (penyamaran gagal = baris ini dilewati).
    try {
      if (this.calls.length < MAX_TOOL_RECORDS) {
        this.calls.push({
          seq: this.calls.length + 1,
          tool_name: String(name).slice(0, 80),
          tool_arguments: redactArgs(rawArgs),
          tool_result: redactResult(result),
          status: isError ? 'error' : 'ok',
          duration_ms: Math.max(0, Math.round(Number(ms) || 0)),
        });
      }
    } catch {
      // abaikan
    }
  }

  /** Salinan catatan tool run ini, urut sesuai pemanggilan. */
  toolCallRecords(): ToolCallRecord[] {
    return [...this.calls];
  }

  /** Kejadian penting di luar ronde (pengaman, error, pesan tersisa). */
  event(text: string): void {
    this.lines.push(`! ${clip(text, 400)}`);
  }

  get isEmpty(): boolean {
    return this.lines.length === 0;
  }

  render(maxChars = TRACE_MAX_CHARS): string {
    if (this.lines.length === 0) return '';
    const text = ['LANGKAH BOT (thinking dimatikan: yang tampil teks model, tool, dan hasilnya)', ...this.lines].join('\n');
    if (text.length <= maxChars) return text;
    // Terlalu panjang: pertahankan awal (konteks) dan akhir (langkah terakhir, biasanya penyebab).
    const head = Math.floor(maxChars * 0.4);
    return `${text.slice(0, head)}\n… (dipotong) …\n${text.slice(-(maxChars - head - 20))}`;
  }
}
