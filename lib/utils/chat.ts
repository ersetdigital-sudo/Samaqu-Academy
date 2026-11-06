export interface ChatLine {
  kind: 'message' | 'note';
  role: 'c' | 'a';
  text: string;
}

/**
 * Percakapan ditulis satu pesan per baris ("C: ..." / "A: ..."), dan baris kosong
 * memisahkan pesan dari pengirim yang sama. Teks yang ditempel dari chat app /
 * spreadsheet kadang jadi satu baris dengan koma sebagai pemisah ("..., A: ..."),
 * jadi pemisah itu diubah dulu menjadi baris baru supaya tiap pesan tetap bubble sendiri.
 */
export function normalizeChatText(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    // ", A:" / "; C:" / "| A:" -> baris baru sebelum penanda peran
    .replace(/[ \t]*[,;|\u2022][ \t]*(?=[acAC]\s*:)/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseChatText(text: string): ChatLine[] {
  const lines: ChatLine[] = [];
  let newBlock = true;
  let lastRole: 'c' | 'a' = 'c';

  normalizeChatText(text)
    .split('\n')
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        newBlock = true;
        return;
      }

      const marked = line.match(/^([ac])\s*:\s*([\s\S]*)$/i);
      const role: 'c' | 'a' = marked ? (marked[1].toLowerCase() as 'c' | 'a') : lastRole;
      const body = (marked ? marked[2] : line).trim();
      const previous = lines[lines.length - 1];
      lastRole = role;

      if (!body) {
        newBlock = false;
        return;
      }

      if (/^\(.*\)$/.test(body)) {
        lines.push({ kind: 'note', role, text: body });
      } else if (!marked && !newBlock && previous?.kind === 'message') {
        // Baris tanpa penanda peran melanjutkan bubble sebelumnya.
        previous.text = `${previous.text} ${body}`.trim();
      } else {
        lines.push({ kind: 'message', role, text: body });
      }

      newBlock = false;
    });

  return lines;
}
