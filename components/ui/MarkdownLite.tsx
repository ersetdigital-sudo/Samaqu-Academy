import { Fragment, type ReactNode } from 'react';
import { ChatBubbles } from './ChatBubbles';

function InlineText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <b key={index}>{part.slice(2, -2)}</b>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Baris tabel "| a | b |" menjadi sel. Baris pemisah "|---|---|" dibuang oleh pemanggil. */
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const isTableLine = (line: string) => /^\|.*\|$/.test(line);
const isTableDivider = (line: string) => /^\|[\s:|-]+\|$/.test(line);

/**
 * Teks materi sederhana: judul "## ", butir "- ", dan tebal "**". Tambahan (bentuk lama tidak berubah):
 *  - tabel: baris yang diawali dan diakhiri "|" (baris pertama = judul kolom)
 *  - percakapan: blok yang dibuka ":::chat" dan ditutup ":::", isinya "C: ..." / "A: ..." (tampil sebagai bubble)
 *  - catatan: baris "> teks" (kotak catatan)
 */
export function MarkdownLite({ text }: { text: string }) {
  const lines = String(text ?? '').split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  let chat: string[] | null = null;

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {list.map((item, index) => (
          <li key={`${index}-${item}`}>
            <InlineText text={item} />
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    const [head, ...body] = table;
    blocks.push(
      <div key={`table-${blocks.length}`} className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={`${index}-${cell}`}>
                  <InlineText text={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join('|')}`}>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`}>
                    <InlineText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  const pushChat = (messages: string[]) => {
    blocks.push(
      <div key={`chat-${blocks.length}`} className="md-chat">
        <ChatBubbles text={messages.join('\n')} size="sm" />
      </div>,
    );
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (chat) {
      if (line === ':::') {
        pushChat(chat);
        chat = null;
      } else {
        chat.push(raw);
      }
      return;
    }
    if (/^:::chat\b/.test(line)) {
      flushList();
      flushTable();
      chat = [];
      return;
    }
    if (isTableLine(line)) {
      flushList();
      if (!isTableDivider(line)) table.push(parseTableRow(line));
      return;
    }
    flushTable();
    if (/^> /.test(line)) {
      flushList();
      blocks.push(
        <div key={`note-${blocks.length}`} className="md-note">
          <InlineText text={line.slice(2)} />
        </div>,
      );
      return;
    }
    if (/^[-•] /.test(line)) {
      list.push(line.slice(2));
      return;
    }
    flushList();
    if (/^## /.test(line)) {
      blocks.push(<h3 key={`h-${blocks.length}`}>{line.slice(3)}</h3>);
    } else if (line) {
      blocks.push(
        <p key={`p-${blocks.length}`}>
          <InlineText text={line} />
        </p>,
      );
    }
  });
  flushList();
  flushTable();
  if (chat) pushChat(chat);

  return <>{blocks}</>;
}
