import { Fragment, type ReactNode } from 'react';

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

export function MarkdownLite({ text }: { text: string }) {
  const lines = String(text ?? '').split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];

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

  lines.forEach((raw) => {
    const line = raw.trim();
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

  return <>{blocks}</>;
}
