'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ModalContextValue {
  openModal: (node: ReactNode, options?: { large?: boolean; portrait?: boolean }) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [large, setLarge] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pathname = usePathname();

  const closeModal = useCallback(() => {
    setContent(null);
  }, []);

  const openModal = useCallback((node: ReactNode, options?: { large?: boolean; portrait?: boolean }) => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setLarge(Boolean(options?.large));
    setPortrait(Boolean(options?.portrait));
    setContent(node);
  }, []);

  useEffect(() => {
    closeModal();
  }, [pathname, closeModal]);

  useEffect(() => {
    if (!content) {
      previousFocus.current?.focus?.();
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    boxRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [content, closeModal]);

  const value = useMemo(() => ({ openModal, closeModal }), [openModal, closeModal]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      {content ? (
        <div
          className="modal on"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className={`mbox${large ? ' lg' : ''}${portrait ? ' portrait' : ''}`}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={boxRef}
          >
            {content}
          </div>
        </div>
      ) : null}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModal must be used inside ModalProvider');
  return context;
}
