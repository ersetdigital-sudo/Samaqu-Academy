export interface ChatLine {
  kind: 'message' | 'note';
  role: 'c' | 'a';
  text: string;
}

export function parseChatText(text: string): ChatLine[] {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const role: 'c' | 'a' = /^a\s*:/i.test(line) ? 'a' : 'c';
      const body = line.replace(/^[ac]\s*:\s*/i, '');
      if (/^\(.*\)$/.test(body)) return { kind: 'note', role, text: body };
      return { kind: 'message', role, text: body };
    });
}
