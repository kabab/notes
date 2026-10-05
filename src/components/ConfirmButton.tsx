import { type ReactNode, useEffect, useState } from "react";

/** First click arms it (shows "Delete?"), a second click within 3 s confirms. */
export function ConfirmButton({ onConfirm, title, children }: { onConfirm(): void; title: string; children: ReactNode }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (armed) onConfirm();
        setArmed(!armed);
      }}
      className={
        armed
          ? "rounded bg-red-600 px-1 text-xs font-medium text-white"
          : "rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-red-600 dark:hover:bg-neutral-700"
      }
    >
      {armed ? "Delete?" : children}
    </button>
  );
}
