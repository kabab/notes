import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

type Notify = (message: string) => void;

const ToastContext = createContext<Notify>(() => {});

export const useNotify = () => useContext(ToastContext);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  const notify = useCallback<Notify>((message) => {
    const id = ++nextId;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext value={notify}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto max-w-sm rounded-md bg-neutral-800 px-3 py-2 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
