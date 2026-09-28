import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; run(): void };
}

type Show = (text: string, options?: Partial<Omit<Toast, 'id' | 'text'>>) => void;

// Two contexts: the many components that only show a toast do not render when the list of toasts changes.
const ShowToastContext = createContext<Show>(() => {});
const ToastsContext = createContext<{ toasts: Toast[]; dismiss(id: number): void }>({ toasts: [], dismiss: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastId = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback<Show>(
    (text, options) => {
      const id = ++lastId.current;
      setToasts((list) => [...list.slice(-2), { id, text, tone: 'info', ...options }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );
  const list = useMemo(() => ({ toasts, dismiss }), [toasts, dismiss]);
  return (
    <ShowToastContext.Provider value={show}>
      <ToastsContext.Provider value={list}>{children}</ToastsContext.Provider>
    </ShowToastContext.Provider>
  );
}

export const useToast = () => useContext(ShowToastContext);
export const useToasts = () => useContext(ToastsContext);
