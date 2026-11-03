import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { tokens } from './knowledge-ranking.ts';

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

interface MessageRow {
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function conversationMemory(
  service: SupabaseClient,
  userId: string,
  excludeConversationId: string | null,
  question: string,
): Promise<string> {
  const { data: conversations, error } = await service
    .from('ai_conversations')
    .select('id,title,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error || !conversations?.length) return '';

  const ids = (conversations as ConversationRow[])
    .filter((conversation) => conversation.id !== excludeConversationId)
    .map((conversation) => conversation.id);
  if (!ids.length) return '';

  const { data: messages, error: messageError } = await service
    .from('ai_messages')
    .select('conversation_id,role,content,created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false })
    .limit(160);
  if (messageError || !messages?.length) return '';

  const queryTokens = new Set(tokens(question));
  if (!queryTokens.size) return '';

  const grouped = new Map<string, MessageRow[]>();
  (messages as MessageRow[]).forEach((message) => {
    const list = grouped.get(message.conversation_id) ?? [];
    list.push(message);
    grouped.set(message.conversation_id, list);
  });

  const ranked = (conversations as ConversationRow[])
    .filter((conversation) => grouped.has(conversation.id))
    .map((conversation) => {
      const list = grouped.get(conversation.id) ?? [];
      const text = `${conversation.title} ${list.map((message) => message.content).join(' ')}`;
      const overlap = tokens(text).filter((token) => queryTokens.has(token)).length;
      return { conversation, list, score: overlap };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (!ranked.length) return '';

  return ranked
    .map(({ conversation, list }) => {
      const recent = [...list]
        .reverse()
        .slice(-6)
        .map((message) => {
          const who = message.role === 'assistant' ? 'AI' : 'Admin';
          return `${who}: ${message.content.replace(/\s+/g, ' ').slice(0, 350)}`;
        })
        .join('\n');
      return `[MEMORI PERCAKAPAN] ${conversation.title} (${conversation.updated_at.slice(0, 10)})\n${recent}`;
    })
    .join('\n\n');
}
