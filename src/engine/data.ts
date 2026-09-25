/**
 * Loads src/data/*.json and turns the table notation into typed data.
 * Bad entries are reported in the console with the offending key; the rest
 * of the game keeps working.
 *
 *   values:  1   -2   "rand(-3,3)"   "pick(3,3,-3)"
 *   save:    "→+2"   "↕↔*pick(3,3,-3)"   "←*3 & →*0.5"
 *   mods:    "=2" (set)   "*-4" (multiply base)
 */
import modifiersJson from '../data/modifiers.json';
import notifsJson from '../data/notifs.json';
import postsJson from '../data/posts.json';
import type { Dir, Mod, ModifierDef, NotifDef, PostDef, PostKind, SavePart, StatTransform, ValSpec } from '../types';
import { DIRS } from '../types';

const ARROW_DIRS: Record<string, Dir[]> = {
  '↑': ['up'], '↓': ['down'], '←': ['left'], '→': ['right'],
  '↕': ['up', 'down'], '↔': ['left', 'right'],
};
export const DIR_ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

function nums(s: string): number[] {
  return s.split(',').map((x) => {
    const n = Number(x.trim());
    if (!Number.isFinite(n)) throw new Error(`bad number "${x}"`);
    return n;
  });
}

export function parseVal(v: unknown): ValSpec {
  if (typeof v === 'number') return { fixed: v };
  if (typeof v !== 'string') throw new Error(`bad value ${JSON.stringify(v)}`);
  const s = v.replace(/\s/g, '');
  let m = /^rand\((.+)\)$/.exec(s);
  if (m) {
    const [a, b] = nums(m[1]);
    return { rand: [a, b] };
  }
  m = /^pick\((.+)\)$/.exec(s);
  if (m) return { pick: nums(m[1]) };
  const n = Number(s);
  if (Number.isFinite(n)) return { fixed: n };
  throw new Error(`bad value "${v}"`);
}

/** "←*3 & →*0.5" → parts */
export function parseSave(s: string): PostDef['save'] {
  return s.split('&').map((part) => {
    const t = part.replace(/\s/g, '').replace('×', '*');
    const m = /^([↑↓←→↕↔]+)([+*])(.+)$/u.exec(t);
    if (!m) throw new Error(`bad save "${part}"`);
    const dirs = [...new Set([...m[1]].flatMap((c) => ARROW_DIRS[c]))];
    return { dirs, k: m[2] === '*' ? 'x' : '+', value: parseVal(m[3]) };
  });
}

function parseTransform(v: unknown): StatTransform {
  if (typeof v !== 'string') throw new Error(`bad transform ${JSON.stringify(v)}`);
  const s = v.replace(/\s/g, '');
  const n = Number(s.slice(1));
  if (!Number.isFinite(n)) throw new Error(`bad transform "${v}"`);
  if (s[0] === '=') return { set: n };
  if (s[0] === '*' || s[0] === '×') return { mul: n };
  throw new Error(`bad transform "${v}" (use "=n" or "*n")`);
}

type Raw = Record<string, unknown>;

function load<T>(json: Record<string, unknown>, what: string, parse: (name: string, r: Raw) => T): T[] {
  const out: T[] = [];
  for (const [name, raw] of Object.entries(json)) {
    try {
      out.push(parse(name, raw as Raw));
    } catch (e) {
      console.error(`[dopadoom] ${what} "${name}": ${(e as Error).message}`);
    }
  }
  return out;
}

export const POSTS: PostDef[] = load(postsJson, 'post', (name, r) => {
  const special = r.special as PostDef['special'];
  const stat = (d: Dir): ValSpec => (special === 'captcha' ? { fixed: 0 } : parseVal(r[d] ?? 0));
  return {
    name,
    kind: (r.kind as PostKind) ?? 'good',
    weight: Number(r.weight ?? 10),
    minHour: Number(r.minHour ?? 0),
    stats: { up: stat('up'), down: stat('down'), left: stat('left'), right: stat('right') },
    save: typeof r.save === 'string' ? parseSave(r.save) : null,
    report: Number(r.report ?? 0.8),
    block: Number(r.block ?? 1),
    ad: r.ad as PostDef['ad'],
    special,
  };
});

export const MODIFIERS: ModifierDef[] = load(modifiersJson, 'modifier', (name, r) => {
  const stats: ModifierDef['stats'] = {};
  if (r.swipes !== undefined) for (const d of DIRS) stats[d] = parseTransform(r.swipes);
  for (const d of DIRS) if (r[d] !== undefined) stats[d] = parseTransform(r[d]);
  const save = r.save !== undefined ? parseTransform(r.save) : undefined;
  return {
    name,
    group: r.group === 'variant' ? 'variant' : 'mult',
    minHour: Number(r.minHour ?? 0),
    weight: Number(r.weight ?? 10),
    appliesTo: r.appliesTo as PostKind | undefined,
    stats,
    save: save && 'mul' in save ? save.mul : undefined,
    report: r.report !== undefined ? Number(r.report) : undefined,
    block: r.block !== undefined ? Number(r.block) : undefined,
  };
});

export const NOTIFS: NotifDef[] = load(notifsJson, 'notification', (name, r) => ({
  name,
  weight: Number(r.weight ?? 10),
  tap: Number(r.tap ?? 1),
  swipe: Number(r.swipe ?? 1),
  wait: Number(r.wait ?? 1),
}));

/* ── rolling + transforming ─────────────────────────────────────────── */

export function roll(v: ValSpec, rng: () => number): number {
  if ('fixed' in v) return v.fixed;
  if ('rand' in v) return v.rand[0] + Math.floor(rng() * (v.rand[1] - v.rand[0] + 1));
  return v.pick[Math.floor(rng() * v.pick.length)];
}

/** rand() rolls now (you see the number), pick() stays a list until you save */
export function resolveSave(save: PostDef['save'], rng: () => number): SavePart[] | null {
  if (!save) return null;
  return save.map((p) => ({ dirs: p.dirs, k: p.k, values: 'pick' in p.value ? [...p.value.pick] : [roll(p.value, rng)] }));
}

export function applyTransform(base: number, t: StatTransform): number {
  return 'set' in t ? t.set : base * t.mul;
}

/**
 * Scale a save effect by a modifier factor:
 *   additive  +2 × 3  → +6      +2 × −1 → −2
 *   multiply  ×2 × 3  → ×6      ×2 × −1 → ×0.5 (inverted, not negated)
 */
export function scaleSave(parts: SavePart[], f: number): SavePart[] {
  return parts.map((p) => ({
    ...p,
    values: p.values.map((v) => {
      if (p.k === '+') return v * f;
      if (f < 0) return v === 0 ? 0 : 1 / v;
      return v * f;
    }),
  }));
}

/** pick the final values when you save */
export function rollSave(parts: SavePart[], rng: () => number): Mod[] {
  return parts.map((p) => ({ dirs: p.dirs, k: p.k, n: p.values[Math.floor(rng() * p.values.length)] }));
}
