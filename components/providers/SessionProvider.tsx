'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { REVIEW_SAMPLE } from '@/lib/ai/sample';
import { invokeAi, type AssistantRemoteResult } from '@/lib/ai/remote';
import type { AssistantSource } from '@/lib/ai/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import type {
  AssistantEntry,
  QuizRuntime,
  ReviewRuntime,
  SimulatorRuntime,
} from '@/lib/types';
import { useAuth } from './AuthProvider';
import { useData } from './DataProvider';

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type AssistantMode = 'idle' | 'remote' | 'local';

interface SessionContextValue {
  quiz: QuizRuntime | null;
  setQuiz: Dispatch<SetStateAction<QuizRuntime | null>>;
  simulator: SimulatorRuntime | null;
  setSimulator: Dispatch<SetStateAction<SimulatorRuntime | null>>;
  review: ReviewRuntime;
  setReview: Dispatch<SetStateAction<ReviewRuntime>>;
  assistant: AssistantEntry[];
  setAssistant: Dispatch<SetStateAction<AssistantEntry[]>>;
  assistantBusy: boolean;
  assistantMode: AssistantMode;
  conversations: AssistantConversation[];
  activeConversationId: string | null;
  assistantReady: boolean;
  storageAvailable: boolean;
  retentionDays: number;
  askAssistant: (question: string) => void;
  resetAssistant: () => void;
  startNewConversation: () => void;
  openConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<boolean>;
  clearAllConversations: () => Promise<boolean>;
  refreshConversations: () => Promise<void>;
  updateRetention: (days: number) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[] | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

const CONVERSATION_COLUMNS = 'id,title,created_at,updated_at';

function mapConversation(row: ConversationRow): AssistantConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): AssistantEntry {
  if (row.role === 'user') {
    return { role: 'user', question: row.content };
  }
  return {
    role: 'assistant',
    text: row.content,
    sources: row.sources ?? [],
    provider: row.provider ?? 'mimo',
    model: row.model ?? undefined,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [quiz, setQuiz] = useState<QuizRuntime | null>(null);
  const [simulator, setSimulator] = useState<SimulatorRuntime | null>(null);
  const [review, setReview] = useState<ReviewRuntime>({
    messages: REVIEW_SAMPLE,
    analyzing: false,
  });
  const [assistant, setAssistant] = useState<AssistantEntry[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('idle');
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [assistantReady, setAssistantReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const busyRef = useRef(false);
  const { snapshot } = useData();
  const { user } = useAuth();

  const loadConversations = useCallback(async (): Promise<AssistantConversation[]> => {
    const client = getSupabaseClient();
    if (!client || !user) return [];
    const { data, error } = await client
      .from('ai_conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(120);
    if (error) return [];
    return ((data ?? []) as ConversationRow[]).map(mapConversation);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client || !user) {
      setConversations([]);
      setActiveConversationId(null);
      setStorageAvailable(false);
      setAssistantReady(true);
      return;
    }

    setStorageAvailable(true);
    setAssistantReady(false);
    void (async () => {
      let days = 90;
      const { data: preference } = await client
        .from('ai_user_settings')
        .select('retention_days')
        .eq('user_id', user.id)
        .maybeSingle();
      if (typeof preference?.retention_days === 'number') {
        days = preference.retention_days;
      }

      if (!cancelled) setRetentionDays(days);

      if (days > 0) {
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
        await client
          .from('ai_conversations')
          .delete()
          .eq('user_id', user.id)
          .lt('updated_at', cutoff);
      }

      const list = await loadConversations();
      if (!cancelled) {
        setConversations(list);
        setAssistantReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loadConversations]);

  const refreshConversations = useCallback(async () => {
    const list = await loadConversations();
    setConversations(list);
  }, [loadConversations]);

  const applyRemoteAnswer = useCallback(
    (data: AssistantRemoteResult) => {
      setActiveConversationId(data.conversationId);
      setAssistantMode('remote');
      setAssistant((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: data.message.content,
          sources: data.sources,
          provider: 'mimo',
          model: data.model,
        },
      ]);
      setConversations((previous) => {
        const existing = previous.find((item) => item.id === data.conversationId);
        const now = new Date().toISOString();
        const title =
          data.userMessage.content.replace(/\s+/g, ' ').slice(0, 70) || 'Percakapan Baru';
        const next = existing
          ? previous.map((item) =>
              item.id === data.conversationId ? { ...item, updatedAt: now } : item,
            )
          : [
              {
                id: data.conversationId,
                title,
                createdAt: now,
                updatedAt: now,
              },
              ...previous,
            ];
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    },
    [],
  );

  const askAssistant = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;
      setAssistantBusy(true);
      setAssistant((previous) => [...previous, { role: 'user', question: trimmed }]);

      let remote = await invokeAi<AssistantRemoteResult>('assistant', {
        question: trimmed,
        conversationId: activeConversationId,
      });

      if (!remote.ok && remote.code === 'conversation_not_found' && activeConversationId) {
        setActiveConversationId(null);
        remote = await invokeAi<AssistantRemoteResult>('assistant', {
          question: trimmed,
          conversationId: null,
        });
      }

      if (remote.ok && remote.data) {
        applyRemoteAnswer(remote.data);
      } else {
        try {
          // Local heuristic fallback so the assistant remains usable before MiMo is configured.
          const { answerQuestion } = await import('@/lib/ai/assistant');
          const answer = answerQuestion(trimmed, {
            products: snapshot.content.products,
            scripts: snapshot.content.scripts,
            cases: snapshot.content.cases,
            beforeAfter: snapshot.content.beforeAfter,
            problems: snapshot.content.problems,
            guides: snapshot.content.guides,
            flow: snapshot.content.flow,
          });
          setAssistantMode('local');
          setAssistant((previous) => [
            ...previous,
            {
              role: 'assistant',
              answer,
              fallback: true,
              note:
                remote.code === 'not_configured'
                  ? 'Mode lokal: API Key Xiaomi MiMo belum dikonfigurasi oleh Owner, jadi jawaban ini memakai pencarian lokal dan tidak disimpan sebagai memori AI.'
                  : `Mode lokal: ${remote.error ?? 'Layanan AI tidak tersedia.'} Jawaban ini tidak disimpan sebagai memori AI.`,
            },
          ]);
        } catch {
          setAssistantMode('local');
          setAssistant((previous) => [
            ...previous,
            {
              role: 'assistant',
              text: 'Maaf, layanan AI dan pencarian lokal sedang tidak tersedia. Coba lagi atau periksa pengaturan AI.',
              fallback: true,
            },
          ]);
        }
      }

      busyRef.current = false;
      setAssistantBusy(false);
    },
    [activeConversationId, applyRemoteAnswer, snapshot.content],
  );

  const startNewConversation = useCallback(() => {
    if (busyRef.current) return;
    setActiveConversationId(null);
    setAssistant([]);
    setAssistantMode('idle');
  }, []);

  const resetAssistant = startNewConversation;

  const openConversation = useCallback(
    async (id: string) => {
      const client = getSupabaseClient();
      if (!client || !user || busyRef.current) return;
      busyRef.current = true;
      setAssistantBusy(true);
      const { data, error } = await client
        .from('ai_messages')
        .select('id,role,content,sources,provider,model,created_at')
        .eq('conversation_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (!error) {
        setAssistant(((data ?? []) as MessageRow[]).map(mapMessage));
        setActiveConversationId(id);
        setAssistantMode('remote');
      }
      busyRef.current = false;
      setAssistantBusy(false);
    },
    [user],
  );

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      const client = getSupabaseClient();
      if (!client || !user) return false;
      const { error } = await client
        .from('ai_conversations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) return false;
      setConversations((previous) => previous.filter((item) => item.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setAssistant([]);
        setAssistantMode('idle');
      }
      return true;
    },
    [activeConversationId, user],
  );

  const clearAllConversations = useCallback(async (): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !user) return false;
    const { error } = await client
      .from('ai_conversations')
      .delete()
      .eq('user_id', user.id);
    if (error) return false;
    setConversations([]);
    setActiveConversationId(null);
    setAssistant([]);
    setAssistantMode('idle');
    return true;
  }, [user]);

  const updateRetention = useCallback(
    async (days: number) => {
      const client = getSupabaseClient();
      if (!client || !user) return;
      const value = Math.max(0, Math.min(3650, Math.round(days)));
      setRetentionDays(value);
      await client.from('ai_user_settings').upsert(
        {
          user_id: user.id,
          retention_days: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (value > 0) {
        const cutoff = new Date(Date.now() - value * 86_400_000).toISOString();
        await client
          .from('ai_conversations')
          .delete()
          .eq('user_id', user.id)
          .lt('updated_at', cutoff);
      }
      await refreshConversations();
    },
    [refreshConversations, user],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      quiz,
      setQuiz,
      simulator,
      setSimulator,
      review,
      setReview,
      assistant,
      setAssistant,
      assistantBusy,
      assistantMode,
      conversations,
      activeConversationId,
      assistantReady,
      storageAvailable,
      retentionDays,
      askAssistant,
      resetAssistant,
      startNewConversation,
      openConversation,
      deleteConversation,
      clearAllConversations,
      refreshConversations,
      updateRetention,
    }),
    [
      quiz,
      simulator,
      review,
      assistant,
      assistantBusy,
      assistantMode,
      conversations,
      activeConversationId,
      assistantReady,
      storageAvailable,
      retentionDays,
      askAssistant,
      resetAssistant,
      startNewConversation,
      openConversation,
      deleteConversation,
      clearAllConversations,
      refreshConversations,
      updateRetention,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
