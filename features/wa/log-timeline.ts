import { toolLabel, type ParsedSteps, type RunTone } from './log-parse';

/**
 * Mengubah jejak langkah mentah bot (ronde, nama fungsi, argumen, milidetik) jadi urutan kerja
 * yang dibaca seperti cerita: "Cek lead → Kirim balasan → Selesai".
 *
 * Murni (tanpa React/jaringan). Format masukan ditulis oleh `wa-agent/trace.ts`:
 *   "Ronde 1 · 11.2 dtk · token 27499+214 (cache 3072)"
 *   "cek_lead_duplikat(kontak=0899…) · 393 ms"  →  hasil: "Sudah ada 1 lead dengan kontak itu: …"
 */

export interface TimelineStep {
  tone: RunTone;
  /** Apa yang dilakukan bot, satu kalimat. */
  title: string;
  /** Hasilnya, satu baris. Kosong kalau tidak ada. */
  result: string;
  /** Teks tambahan dari AI sebelum/sesudah langkah ini. */
  note: string;
  /** Durasi (detik, format id) — hanya diisi kalau terasa lambat (> 3 dtk). */
  slow: string;
}

const SLOW_SECONDS = 3;

export function nomorRapi(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
}

const clip = (text: string, max: number) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
};

/** "a=1, b=halo, dunia, c=3" → { a:'1', b:'halo, dunia', c:'3' } (koma di dalam nilai aman). */
export function parseArgs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = String(raw || '').split(/,\s+(?=[a-z_]+=)/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (/^[a-z_]+$/.test(key)) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

/** "kirim_wa(a=1) · 804 ms" → { name, args, ms }. */
export function parseCall(call: string): { name: string; args: Record<string, string>; ms: number } {
  const match = String(call || '').match(/^([a-z_]+)\(([\s\S]*)\)\s*·\s*(\d+)\s*ms\s*$/);
  if (!match) {
    const name = (String(call).match(/^([a-z_]+)/) || [])[1] || String(call);
    return { name, args: {}, ms: 0 };
  }
  return { name: match[1], args: parseArgs(match[2]), ms: Number(match[3]) };
}

/** "Ronde 1 · 11.2 dtk · token …" → 11.2 (detik). */
export function roundSeconds(title: string): number {
  const match = String(title || '').match(/·\s*([\d.,]+)\s*dtk/);
  return match ? Number(match[1].replace(',', '.')) || 0 : 0;
}

const FAILED = /\b(gagal|error|ditolak|tidak berhasil|tidak bisa|tidak valid)\b/i;

interface Described {
  title: string;
  result: string;
  tone: RunTone;
}

function describe(name: string, args: Record<string, string>, rawResult: string): Described {
  const result = String(rawResult || '').trim();
  const failed = FAILED.test(result);
  const base = (title: string, shown: string, tone?: RunTone): Described => ({
    title,
    result: clip(shown, 170),
    tone: tone || (failed ? 'bad' : 'muted'),
  });

  switch (name) {
    case 'cari_produk': {
      const query = args.cari || args.query || '';
      const title = query ? `Cari produk "${clip(query, 50)}" di katalog` : 'Cari produk di katalog';
      if (/^tidak ada produk/i.test(result)) return base(title, 'Tidak ketemu', 'warn');
      const found = result.match(/^(\d+)\s+dari\s+(\d+)\s+produk cocok/i);
      if (found) return base(title, `Ketemu ${found[1]} produk (dari ${found[2]} yang cocok)`, 'muted');
      return base(title, result);
    }
    case 'detail_produk':
      return base(`Lihat detail produk ${clip(args.id || args.produk || '', 40)}`.trim(), result);
    case 'info_bahan':
      return base('Cek info bahan kain', result);
    case 'info_series':
      return base(`Cek info series ${clip(args.series || '', 30)}`.trim(), result);
    case 'cek_lead_duplikat': {
      const nomor = args.kontak ? nomorRapi(args.kontak) : '';
      const title = nomor ? `Cek apakah ${nomor} sudah tercatat sebagai lead` : 'Cek apakah customer sudah tercatat sebagai lead';
      if (/^tidak ada lead/i.test(result)) return base(title, 'Belum ada, ini customer baru');
      const exists = result.match(/^sudah ada\s+(\d+)\s+lead/i);
      if (exists) {
        const detail = result.split(':').slice(1).join(':').replace(/^[\s•]+/, '');
        return base(title, `Sudah ada ${exists[1]} lead${detail ? ` — ${detail}` : ''}`);
      }
      return base(title, result);
    }
    case 'catat_lead': {
      const produk = args.produk ? ` (${clip(args.produk, 40)})` : '';
      const title = `Catat lead baru${produk}${args.sumber ? `, sumber ${args.sumber}` : ''}`;
      if (/^lead tersimpan/i.test(result)) return base(title, 'Tersimpan', 'ok');
      return base(title, result);
    }
    case 'kirim_wa': {
      const nomor = args.nomor ? nomorRapi(args.nomor) : '';
      const title = nomor ? `Kirim balasan WhatsApp ke ${nomor}` : 'Kirim balasan WhatsApp';
      if (/^terkirim/i.test(result)) return base(title, 'Terkirim', 'ok');
      return base(title, result || 'Tidak ada konfirmasi pengiriman', 'bad');
    }
    case 'lewati_wa':
      return base('Lewati pesan ini (tidak dibalas)', result || args.alasan || '', 'warn');
    case 'catat_closing':
      return base('Catat closing', result, failed ? 'bad' : 'ok');
    case 'rekap_pesanan':
      return base('Susun rekap pesanan', result);
    case 'cek_ongkir':
      return base('Cek ongkir', result);
    case 'cari_area_ongkir':
      return base(`Cari area pengiriman ${clip(args.cari || args.kecamatan || '', 40)}`.trim(), result);
    case 'cek_pesanan':
      return base('Cek status pesanan', result);
    case 'cek_resi':
      return base(`Cek resi ${args.resi || ''}`.trim(), result);
    case 'daftar_lead':
      return base('Lihat daftar lead', result);
    case 'opsi_lead':
      return base('Ambil opsi isian lead', result);
    case 'teruskan_admin':
      return base('Teruskan ke admin', result, failed ? 'bad' : 'warn');
    case 'pesan_wa_masuk':
      return base('Baca pesan masuk', result);
    default: {
      const label = toolLabel(name);
      return base(label.charAt(0).toUpperCase() + label.slice(1), result);
    }
  }
}

/** Teks model yang benar-benar berisi (bukan placeholder "(model langsung memanggil tool…)"). */
function modelText(text: string): string {
  const clean = String(text || '').trim();
  if (!clean || clean.startsWith('(model')) return '';
  return clip(clean, 400);
}

export function buildTimeline(steps: ParsedSteps): TimelineStep[] {
  const timeline: TimelineStep[] = [];
  for (const round of steps.rounds) {
    const thinking = roundSeconds(round.title);
    const text = modelText(round.text);

    if (round.tools.length === 0) {
      // Ronde tanpa tool = penutup: AI selesai dan menulis kalimat terakhir.
      timeline.push({ tone: 'ok', title: 'Selesai', result: text, note: '', slow: '' });
      continue;
    }

    round.tools.forEach((tool, index) => {
      const call = parseCall(tool.call);
      const described = describe(call.name, call.args, tool.result);
      // Waktu mikir model dibebankan ke langkah pertama ronde itu (itulah yang ditunggu customer).
      const total = call.ms / 1000 + (index === 0 ? thinking : 0);
      timeline.push({
        tone: described.tone,
        title: described.title,
        result: described.result,
        note: index === 0 && text ? text : '',
        slow: total > SLOW_SECONDS ? `${total.toFixed(1).replace('.', ',')} dtk` : '',
      });
    });
  }
  for (const event of steps.events) {
    timeline.push({ tone: 'warn', title: 'Kejadian khusus', result: clip(event, 300), note: '', slow: '' });
  }
  return timeline;
}
