/** small shared helpers. no game logic here. */

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** 1 decimal, drops trailing .0 → "3", "3.5", "-0.4" */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = Object.is(r, -0) ? '0' : r.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** "+3", "−1.5", "±0" (uses a real minus sign, reads better on small screens) */
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '±0';
  return r > 0 ? `+${fmt(r)}` : `−${fmt(-r)}`;
}

export function mult(n: number): string {
  return `×${fmt(n)}`;
}

/** fake minutes → "HH:MM" */
export function clock(minute: number): string {
  const m = Math.floor(minute);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** mulberry32 seeded from a string hash, so runs can be replayed via ?seed= */
export function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function weightedPick<T>(items: T[], weight: (t: T) => number, r: number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let x = r * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

/** fake social numbers: 12.4K, 1.2M */
export function bigNum(r: number): string {
  const n = Math.floor(Math.pow(10, 1 + r * 6));
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
