export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Runs a pending call now. Resolves when it finishes. */
  flush(): Promise<void>;
  cancel(): void;
  pending(): boolean;
}

/** Trailing debounce for async work (e.g. autosave). `flush` lets callers save on navigation. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  ms: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const run = async () => {
    clearTimeout(timer);
    timer = undefined;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) await fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }) as Debounced<A>;

  debounced.flush = run;
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };
  debounced.pending = () => lastArgs !== undefined;
  return debounced;
}
