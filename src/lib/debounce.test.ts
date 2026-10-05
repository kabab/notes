import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls once with the last arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d("a");
    d("b");
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("flush runs the pending call immediately, and only once", async () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d("x");
    expect(d.pending()).toBe(true);
    await d.flush();
    expect(fn).toHaveBeenCalledExactlyOnceWith("x");
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(1000);
    await d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
