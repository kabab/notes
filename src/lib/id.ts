// UUIDv7 (RFC 9562): 48-bit Unix ms timestamp, then random bits. Ids sort by
// creation time. A counter in the random bits keeps ids generated within the
// same millisecond in order.

let lastMs = -1;
let seq = 0;

export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  if (now <= lastMs) {
    // Same (or earlier, if the clock went back) millisecond: reuse it and bump the counter.
    now = lastMs;
    seq = (seq + 1) & 0xfff;
    if (seq === 0) now = ++lastMs; // counter overflow: borrow the next millisecond
  } else {
    lastMs = now;
    seq = bytes[6]! & 0x07; // random start, leaving room to count up
  }

  for (let i = 5; i >= 0; i--) {
    bytes[i] = now % 256;
    now = Math.floor(now / 256);
  }
  bytes[6] = 0x70 | (seq >> 8); // version 7 + top 4 bits of counter
  bytes[7] = seq & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
