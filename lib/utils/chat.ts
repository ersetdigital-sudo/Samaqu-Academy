export interface ChatLine {
  kind: 'message' | 'note';
  role: 'c' | 'a';
  text: string;
}

/**
 * Percakapan biasanya satu pesan per baris ("C: ..." / "A: ..."). Teks yang
 * ditempel dari chat app / spreadsheet kadang jadi satu baris dengan koma
 * sebagai pemisah antar pesan ("..., A: ..."), jadi pemisah itu diubah dulu
 * menjadi baris baru supaya tiap pesan tetap jadi bubble sendiri.
 */
export function normalizeChatText(text: string): string {
  return (
    String(text ?? '')
      .replace(/\r\n?/g, '\n')
      // ", A:" / "; C:" / "| A:" -> baris baru sebelum penanda peran
      .replace(/[ \t]*[,;|\u2022][ \t]*(?=[acAC]\s*:)/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  );
}

export function parseChatText(text: string): ChatLine[] {
  const lines: ChatLine[] = [];

  normalizeChatText(text)
    .split('\n')
    .forEach((line) => {
      const marked = line.match(/^([ac])\s*:\s*([\s\S]*)$/i);
      const previous = lines[lines.length - 1];
      const role: 'c' | 'a' = marked
        ? (marked[1].toLowerCase() as 'c' | 'a')
        : (previous?.role ?? 'c');
      const body = (marked ? marked[2] : line).trim();
      if (!body) return;

      if (/^\(.*\)$/.test(body)) {
        lines.push({ kind: 'note', role, text: body });
        return;
      }

      // Baris tanpa penanda peran melanjutkan pesan sebelumnya (bukan bubble baru).
      if (!marked && previous?.kind === 'message') {
        previous.text = `${previous.text} ${body}`.trim();
        return;
      }

      lines.push({ kind: 'message', role, text: body });
    });

  return lines;
}
