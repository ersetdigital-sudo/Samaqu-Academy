import { parseChatText } from '@/lib/utils/chat';

interface ChatBubblesProps {
  text: string;
  adminLabel?: string;
  size?: 'sm' | 'md';
}

export function ChatBubbles({ text, adminLabel = 'Admin', size = 'md' }: ChatBubblesProps) {
  const lines = parseChatText(text);
  return (
    <>
      {lines.map((line, index) =>
        line.kind === 'note' ? (
          <div
            key={`${index}-${line.text}`}
            className={`${size === 'sm' ? 'sm' : 'xs'} muted`}
            style={{ textAlign: 'center', fontStyle: 'italic' }}
          >
            {line.text}
          </div>
        ) : (
          <div
            key={`${index}-${line.text}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: line.role === 'a' ? 'flex-end' : 'flex-start',
            }}
          >
            <div className="who">{line.role === 'a' ? adminLabel : 'Customer'}</div>
            <div className={`bubble ${line.role === 'a' ? 'ba' : 'bc'}`}>{line.text}</div>
          </div>
        ),
      )}
    </>
  );
}
