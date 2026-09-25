/**
 * Ops, mods and their text/colour. Also the tiny template parser so content
 * can be written in the same notation the player reads:
 *
 *   'u+1 d+1 lx2 r+1 | +2u'
 *    ↑ +1  ↓ +1  ← ×2  → +1   save: +2 per ↑
 *
 * tokens before '|':  u d l r (dirs)  B (block)  R (report)
 *                     followed by +n  -n  xn  /n   or  ?xn,/n (coin flip)
 * tokens after  '|':  +2u  -1d  x1.5l  +1a   (a = all swipes)
 */
import type { Dir, Mod, Op, OpKind, Post } from '../types';
import { fmt } from '../util';

export const OP_CHAR: Record<OpKind, string> = { '+': '+', '-': '−', x: '×', '/': '÷' };
export const OP_CLS: Record<OpKind, string> = { '+': 'c-add', '-': 'c-sub', x: 'c-mul', '/': 'c-div' };

export function applyOp(dopa: number, op: Op): number {
  switch (op.k) {
    case '+': return dopa + op.n;
    case '-': return dopa - op.n;
    case 'x': return dopa * op.n;
    case '/': return dopa / op.n;
  }
}

export function opText(op: Op): string {
  const t = `${OP_CHAR[op.k]}${fmt(op.n)}`;
  return op.alt ? `${t}/${opText(op.alt)}` : t;
}

/** HTML with each half coloured by its own op */
export function opHtml(op: Op): string {
  const one = (o: Op) => `<span class="${OP_CLS[o.k]}">${OP_CHAR[o.k]}${fmt(o.n)}</span>`;
  return op.alt ? `${one(op)}<span class="c-dim">/</span>${one(op.alt)}` : one(op);
}

/** gain as a signed number → class */
export function signCls(n: number): string {
  return n > 0 ? 'c-add' : n < 0 ? 'c-sub' : 'c-dim';
}

export function signedText(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '±0';
  return r > 0 ? `+${fmt(r)}` : `−${fmt(-r)}`;
}

const ARROW_CH: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** plain-text mod (used in the tally): "+2↑", "×1.5←", "+1 ALL" */
export function modText(m: Mod): string {
  const v = m.k === 'x' ? `×${fmt(m.n)}` : m.n < 0 ? `−${fmt(-m.n)}` : `+${fmt(m.n)}`;
  return m.dir === 'all' ? `${v} ALL` : `${v}${ARROW_CH[m.dir]}`;
}

export function modCls(m: Mod): string {
  if (m.k === 'x') return m.n >= 1 ? 'c-mul' : 'c-div';
  return m.n >= 0 ? 'c-add' : 'c-sub';
}

/* ── parser ─────────────────────────────────────────────────────────── */

const DIR_OF: Record<string, Dir> = { u: 'up', d: 'down', l: 'left', r: 'right' };

export function parseOp(s: string): Op {
  if (s.startsWith('?')) {
    const [a, b] = s.slice(1).split(',');
    return { ...parseOp(a), alt: parseOp(b) };
  }
  const k = s[0] as OpKind;
  const n = Number(s.slice(1));
  if (!['+', '-', 'x', '/'].includes(k) || !Number.isFinite(n)) throw new Error(`bad op "${s}"`);
  return { k, n };
}

export function parseMod(s: string): Mod {
  const k = s[0] === 'x' ? 'x' : '+';
  const dirCh = s[s.length - 1];
  const num = Number(s.slice(k === 'x' ? 1 : 0, -1));
  const dir = dirCh === 'a' ? 'all' : DIR_OF[dirCh];
  if (!dir || !Number.isFinite(num)) throw new Error(`bad mod "${s}"`);
  return { dir, k, n: num };
}

export interface ParsedTemplate {
  acts: Record<Dir, Op>;
  save: Mod[] | null;
  block: Op;
  report: Op;
}

export function parseTemplate(t: string): ParsedTemplate {
  const [left, right] = t.split('|');
  const acts: Record<Dir, Op> = { up: { k: '+', n: 1 }, down: { k: '+', n: 1 }, left: { k: '+', n: 0 }, right: { k: '+', n: 0 } };
  let block: Op = { k: '+', n: 0 };
  let report: Op = { k: '-', n: 2 };
  for (const tok of left.trim().split(/\s+/).filter(Boolean)) {
    const head = tok[0];
    const op = parseOp(tok.slice(1));
    if (head === 'B') block = op;
    else if (head === 'R') report = op;
    else if (DIR_OF[head]) acts[DIR_OF[head]] = op;
    else throw new Error(`bad token "${tok}" in "${t}"`);
  }
  const mods = right ? right.trim().split(/\s+/).filter(Boolean).map(parseMod) : [];
  return { acts, save: mods.length ? mods : null, block, report };
}

/** does this post react to ← / → any more? */
export function reactedLabel(p: Post): string {
  return p.reacted === 'liked' ? 'LIKED' : p.reacted === 'disliked' ? 'DISLIKED' : '';
}
