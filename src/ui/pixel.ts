/**
 * Pixel graphics, all generated as tiny SVGs (no emoji, no image files):
 *   - icons: arrows, bookmark, kebab, X  (inherit currentColor)
 *   - frames: chunky pixel borders per post type (CSS border-image)
 *   - art: symmetric placeholder "pictures" seeded per post
 */
import type { Dir, Mod } from '../types';
import { fmt, makeRng } from '../util';

function grid(rows: string[], cls = 'px-ico'): string {
  const h = rows.length;
  const w = rows[0].length;
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; }));
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

const UP = ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '..XXX..', '..XXX..', '..XXX..'];

function rotate(rows: string[]): string[] {
  // 90° clockwise
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += rows[y][x];
    out.push(line);
  }
  return out;
}

const RIGHT = rotate(UP);
const DOWN = rotate(RIGHT);
const LEFT = rotate(DOWN);
const ARROWS: Record<Dir, string> = { up: grid(UP), right: grid(RIGHT), down: grid(DOWN), left: grid(LEFT) };

export const arrow = (d: Dir): string => ARROWS[d];

export const ICON = {
  bookmark: grid(['XXXXXXXX', 'X......X', 'X......X', 'X......X', 'X......X', 'X......X', 'X......X', 'X..XX..X', 'X.X..X.X', 'XX....XX']),
  bookmarkOn: grid(['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXX..XXX', 'XX....XX', 'X......X']),
  kebab: grid(['XX', 'XX', '..', '..', 'XX', 'XX', '..', '..', 'XX', 'XX']),
  x: grid(['X.....X', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'X.....X']),
  pause: grid(['XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX']),
};

/** "+2↑" with a pixel arrow, coloured by what it does */
export function modHtml(m: Mod): string {
  const cls = m.k === 'x' ? (m.n >= 1 ? 'c-mul' : 'c-div') : m.n >= 0 ? 'c-add' : 'c-sub';
  const v = m.k === 'x' ? `×${fmt(m.n)}` : m.n < 0 ? `−${fmt(-m.n)}` : `+${fmt(m.n)}`;
  return `<span class="mod ${cls}">${v}${m.dir === 'all' ? '<small>ALL</small>' : arrow(m.dir)}</span>`;
}

export function modsHtml(mods: Mod[]): string {
  return mods.map(modHtml).join(' ');
}

/* ── frames ─────────────────────────────────────────────────────────── */

export type FrameStyle = 'solid' | 'dashed' | 'double' | 'rainbow';

/**
 * Inline style for a chunky pixel frame: a plain CSS border in the post-type
 * colour + a faint tint + corners notched off with clip-path (see .px-frame
 * in styles.css). `unit` is the border thickness in px.
 */
export function frameStyle(color: string, style: FrameStyle = 'solid', unit = 4, tint = 0.08): string {
  const bg = `background:color-mix(in srgb, ${color} ${Math.round(tint * 100)}%, #000);`;
  const n = `--n:${unit}px;`;
  if (style === 'rainbow') {
    return `${n}${bg}border:${unit}px solid;border-image:linear-gradient(135deg,#ffe14d,#5dff7a,#3df0ff,#f2a8ff) 1;`;
  }
  if (style === 'double') return `${n}${bg}border:${unit * 2}px double ${color};`;
  return `${n}${bg}border:${unit}px ${style} ${color};`;
}

/* ── placeholder art ────────────────────────────────────────────────── */

/** 7×7 mirrored blob, like a pixel sprite. deterministic per seed */
export function art(seed: number, color: string): string {
  const r = makeRng(String(seed));
  const rows: string[] = [];
  for (let y = 0; y < 7; y++) {
    const half: string[] = [];
    for (let x = 0; x < 4; x++) half.push(r() < 0.5 - Math.abs(y - 3) * 0.06 ? 'X' : '.');
    rows.push([...half, ...half.slice(0, 3).reverse()].join(''));
  }
  return `<span class="art" style="color:${color}">${grid(rows, 'px-art')}</span>`;
}
