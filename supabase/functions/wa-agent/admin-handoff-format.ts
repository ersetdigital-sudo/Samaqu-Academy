/**
 * Perapi pesan "CS WA - perlu admin" (teruskan_admin).
 *
 * Persona menyuruh bot menulis ringkasan ke admin dalam lima baris (Status, Ringkasan, Keputusan customer,
 * Tindakan admin, Catatan), tetapi bot sering menulisnya menyambung dalam SATU paragraf (atau tanpa label sama
 * sekali), sehingga di WhatsApp admin jadi blok teks panjang yang susah dibaca (26 Nov 2026). Modul ini
 * merapikannya di server, tanpa mengubah persona dan tanpa mengurangi isi:
 *  - label dikenali di mana pun posisinya (huruf besar/kecil bebas) dan dijadikan judul tebal ala WhatsApp;
 *  - tiap kalimat jadi satu butir ("- ");
 *  - tanpa label: kalimat berawalan "Mohon/Tolong/Harap/Silakan" masuk Tindakan admin, sisanya Ringkasan.
 *
 * Murni (tanpa jaringan) supaya bisa diuji: npx tsx scripts/test-admin-handoff-format.mts
 */

const LABELS = ['Status', 'Ringkasan', 'Keputusan customer', 'Tindakan admin', 'Catatan'] as const;
type Label = (typeof LABELS)[number];

const LABEL_RE = /(?<![A-Za-z])(status|ringkasan|keputusan customer|tindakan admin|catatan)\s*:\s*/gi;
const canonical = (raw: string): Label =>
  LABELS.find((label) => label.toLowerCase() === raw.toLowerCase().replace(/\s+/g, ' ')) ?? 'Ringkasan';

/** Singkatan yang diakhiri titik tidak boleh memutus kalimat ("Jl. Garu No. 4", "Kab. Bandung"). */
const ABBR = /\b(jl|no|kec|kab|kel|gg|rt|rw|dr|bpk|st|mis|dll|dsb|dst|yg|tgl|hp|rp|ds|kp|pt|cv|ibu|sdr|ps|psr)\./gi;
const HOLD = '\u0001';

function sentences(block: string): string[] {
  const out: string[] = [];
  for (const line of block.split(/\n+/)) {
    const cleaned = line.replace(/^\s*(?:[-*•]\s+)+/, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const protectedText = cleaned.replace(ABBR, (_m, abbr) => `${abbr}${HOLD}`);
    for (const piece of protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)) {
      const text = piece.split(HOLD).join('.').trim();
      if (text) out.push(text.charAt(0).toUpperCase() + text.slice(1));
    }
  }
  return out;
}

const ACTION_START = /^(mohon|tolong|harap|silakan)\b/i;

/** Kembalikan teks rapi; string kosong kalau tidak ada isi (pemanggil memakai teks asli sebagai cadangan). */
export function formatAdminHandoff(pesan: string): string {
  const text = String(pesan ?? '').replace(/\r/g, '').trim();
  if (!text) return '';

  const sections = new Map<Label, string[]>();
  const add = (label: Label, items: string[]) => {
    if (!items.length) return;
    sections.set(label, [...(sections.get(label) ?? []), ...items]);
  };

  const marks = [...text.matchAll(LABEL_RE)];
  if (marks.length) {
    const head = text.slice(0, marks[0].index ?? 0);
    add('Ringkasan', sentences(head));
    marks.forEach((mark, i) => {
      const start = (mark.index ?? 0) + mark[0].length;
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length;
      add(canonical(mark[1]), sentences(text.slice(start, end)));
    });
  } else {
    for (const item of sentences(text)) add(ACTION_START.test(item) ? 'Tindakan admin' : 'Ringkasan', [item]);
  }

  const blocks = LABELS.filter((label) => sections.has(label)).map(
    (label) => `*${label}*\n${sections.get(label)!.map((item) => `- ${item}`).join('\n')}`,
  );
  return blocks.join('\n\n');
}
