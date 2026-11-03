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
import type {
  AssistantEntry,
  QuizRuntime,
  ReviewRuntime,
  SimulatorRuntime,
} from '@/lib/types';
import { useData } from './DataProvider';

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
  askAssistant: (question: string) => void;
  resetAssistant: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [quiz, setQuiz] = useState<QuizRuntime | null>(null);
  const [simulator, setSimulator] = useState<SimulatorRuntime | null>(null);
  const [review, setReview] = useState<ReviewRuntime>({
    messages: REVIEW_SAMPLE,
    analyzing: false,
  });
  const [assistant, setAssistant] = useState<AssistantEntry[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const busyRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { snapshot } = useData();

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
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
      try {
        // Loaded on demand so the assistant logic stays out of the initial bundle.
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
        const timer = setTimeout(() => {
          setAssistant((previous) => [...previous, { role: 'assistant', answer }]);
          setAssistantBusy(false);
          busyRef.current = false;
        }, 350);
        timers.current.push(timer);
      } catch {
        setAssistantBusy(false);
        busyRef.current = false;
      }
    },
    [snapshot.content],
  );

  const resetAssistant = useCallback(() => {
    setAssistant([]);
  }, []);

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
      askAssistant,
      resetAssistant,
    }),
    [quiz, simulator, review, assistant, assistantBusy, askAssistant, resetAssistant],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
