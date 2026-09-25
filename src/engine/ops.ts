/**
 * Text + colour helpers for numbers, saved effects and multipliers.
 * Colour classes only show when CFG.COLOR_OPS is on (#app.colors in CSS).
 */
import type { Dir, Mod, SavePart } from '../types';
import { fmt } from '../util';

export function signedText(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0';
  return r > 0 ? `+${fmt(r)}` : `−${fmt(-r)}`;
}

export function multText(n: number): string {
  return n < 0 ? `×−${fmt(-n)}` : `×${fmt(n)}`;
}

/** + blue, − red, × cyan (≥1), × pink (<1) */
export function signCls(n: number): string {
  return n > 0 ? 'c-add' : n < 0 ? 'c-sub' : 'c-dim';
}
export function multCls(n: number): string {
  return n >= 1 ? 'c-mul' : 'c-div';
}

export function modValueText(k: '+' | 'x', n: number): string {
  return k === 'x' ? multText(n) : signedText(n);
}
export function modValueCls(k: '+' | 'x', n: number): string {
  return k === 'x' ? multCls(n) : signCls(n);
}

/** ↑↓←→ → the compact arrows used in the data (↕ ↔ when paired) */
export function dirsText(dirs: Dir[]): string {
  const has = (d: Dir) => dirs.includes(d);
  let s = '';
  if (has('up') && has('down')) s += '↕'; else { if (has('up')) s += '↑'; if (has('down')) s += '↓'; }
  if (has('left') && has('right')) s += '↔'; else { if (has('left')) s += '←'; if (has('right')) s += '→'; }
  return s;
}

/** plain text for the tally: "+2→", "×2↑" */
export function modText(m: Mod): string {
  return `${modValueText(m.k, m.n)}${dirsText(m.dirs)}`;
}

/** unrolled save part: "×3/×−3↕↔" */
export function savePartText(p: SavePart): string {
  const vals = [...new Set(p.values)].map((v) => modValueText(p.k, v)).join('/');
  return `${vals}${dirsText(p.dirs)}`;
}
