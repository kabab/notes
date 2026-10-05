import { useEffect, useRef } from "react";

interface Props {
  initial?: string;
  placeholder?: string;
  onCommit(value: string): void;
  onCancel(): void;
  className?: string;
}

/** Text field for inline create/rename: Enter or blur commits, Escape cancels. */
export function InlineInput({ initial = "", placeholder, onCommit, onCancel, className = "" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value.trim() ?? "";
    if (commit && value && value !== initial) onCommit(value);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className={`w-full min-w-0 rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none dark:bg-neutral-800 ${className}`}
    />
  );
}
