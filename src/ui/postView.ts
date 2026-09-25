/**
 * One post on screen. Only NUMBERS: the base stat for each swipe, and what
 * saving gives you. No previews of results, no hints about good or bad.
 *
 *   ┌────────── ↓ 0 ──────────┐
 *   │                 @user  │
 *   │ ← −1   CUTE.x2   → +1  │
 *   │                   [BM] │
 *   │                   +2→  │
 *   │                    ⋮   │
 *   └────────── ↑ +1 ────────┘
 */
import { CFG } from '../config';
import type { Game } from '../engine/game';
import { signCls, signedText } from '../engine/ops';
import type { Dir, Post } from '../types';
import { fmt } from '../util';
import { esc, h } from './dom';
import { arrow, frameStyle, ICON, savePartHtml } from './pixel';

const HANDLES = ['@user', '@feed', '@clip', '@post'];

export function renderPost(g: Game, p: Post): HTMLElement {
  const el = h('div', `post${p.ad ? ' is-ad' : ''}${p.def.special === 'glitch' ? ' glitch' : ''}${p.captcha ? ' is-captcha' : ''}`);
  el.dataset.uid = String(p.uid);
  const handle = `${HANDLES[p.uid % HANDLES.length]}${(p.uid * 7919) % 9000 + 1000}`;
  el.innerHTML = `
    <div class="frame" style="${frameStyle('#e8e8e8', p.ad ? 'double' : 'solid', 4, 0.05)}"></div>
    <div class="edge e-down"></div>
    <div class="head"><span class="handle">${handle}</span></div>
    <div class="mid">
      <div class="edge e-left"></div>
      <div class="center"><div class="pname">${nameHtml(p.name)}</div><div class="adbox"></div><div class="captcha"></div></div>
      <div class="edge e-right"></div>
    </div>
    <div class="rail">
      <button class="rb b-save" aria-label="save"><span class="ico"></span><span class="rl"></span></button>
      <button class="rb b-kebab" aria-label="more">${ICON.kebab}</button>
    </div>
    <div class="edge e-up"></div>
    <div class="menu"></div>
    <div class="stamp"></div>
  `;
  updatePost(g, el, p);
  return el;
}

/** "BAIT.REAC.x3" → base name big, modifiers smaller underneath */
function nameHtml(name: string): string {
  const [base, ...mods] = name.split('.');
  return `<span class="pbase">${esc(base)}</span>${mods.length ? `<span class="pmods">.${esc(mods.join('.'))}</span>` : ''}`;
}

function edgeHtml(g: Game, p: Post, d: Dir): { html: string; off: boolean; mark: string } {
  const locked = !!p.captcha || (!!p.ad && !p.ad.done);
  if (locked) return { html: `${arrow(d)}<span class="x">${ICON.x}</span>`, off: true, mark: '' };
  if (d === 'down' && g.backIndex() === null) return { html: `${arrow(d)}<span class="x">${ICON.x}</span>`, off: true, mark: '' };
  const v = p.stats[d];
  // a small check under the side you already reacted with
  const mark = (d === 'right' && p.reacted === 'liked') || (d === 'left' && p.reacted === 'disliked') ? 'reacted' : '';
  return { html: `${arrow(d)}<span class="op ${signCls(v)}">${signedText(v)}</span>`, off: false, mark };
}

export function updatePost(g: Game, el: HTMLElement, p: Post): void {
  for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
    const e = el.querySelector<HTMLElement>(`.e-${d}`);
    if (!e) continue;
    const { html, off, mark } = edgeHtml(g, p, d);
    if (e.dataset.h !== html) { e.innerHTML = html; e.dataset.h = html; }
    e.classList.toggle('off', off);
    e.classList.toggle('reacted', !!mark);
  }

  const locked = !!p.captcha || (!!p.ad && !p.ad.done);
  const save = el.querySelector<HTMLElement>('.b-save');
  if (save) {
    const ico = save.querySelector<HTMLElement>('.ico')!;
    const rl = save.querySelector<HTMLElement>('.rl')!;
    const icoHtml = p.saved ? ICON.bookmarkOn : ICON.bookmark;
    if (ico.innerHTML !== icoHtml) ico.innerHTML = icoHtml;
    const label = p.save ? p.save.map(savePartHtml).join('') : '<span class="c-dim">—</span>';
    if (rl.dataset.h !== label) { rl.innerHTML = label; rl.dataset.h = label; }
    save.classList.toggle('off', locked || !!g.blockReason(p, 'save'));
  }
  el.querySelector('.b-kebab')?.classList.toggle('off', locked);

  // ad countdown
  const box = el.querySelector<HTMLElement>('.adbox');
  if (box && p.ad) {
    let html = '';
    if (!p.ad.done) {
      const skip = p.ad.kind === 'real' ? `SKIP −${fmt(g.adNextCost(p))} +${fmt(CFG.AD_TRY_ADD_SECS)}S` : 'AD';
      html = `<div class="adnum">${Math.ceil(p.ad.left)}</div><div class="adskip">${skip}</div>`;
    }
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
  }

  // captcha tiles
  const cap = el.querySelector<HTMLElement>('.captcha');
  if (cap) {
    const c = p.captcha;
    const html = c
      ? `<div class="cap-q">TAP 1 ${arrow('right')} ${c.tiles.length}</div><div class="tiles">${c.tiles
          .map((n) => `<button class="tile${n < c.next ? ' done' : ''}" data-tile="${n}">${n}</button>`).join('')}</div>`
      : '';
    if (cap.dataset.h !== html) { cap.innerHTML = html; cap.dataset.h = html; }
  }
}

export function kebabMenuHtml(p: Post): string {
  const val = (f: number) => (CFG.SHOW_HIDDEN ? `<span class="hid">×${fmt(f)}</span>` : '');
  return `
    <button class="mi" data-act="block">${ICON.block}<span>BLOCK</span>${val(p.block)}</button>
    <button class="mi" data-act="report">${ICON.report}<span>REPORT</span>${val(p.report)}</button>`;
}

/** stamp while dragging: just the arrow + base number (no computed outcome) */
export function setStamp(g: Game, el: HTMLElement, d: Dir | null, progress: number): void {
  const stamp = el.querySelector<HTMLElement>('.stamp');
  el.querySelectorAll('.edge.hot').forEach((x) => x.classList.remove('hot'));
  if (!stamp) return;
  if (!d || progress < 0.1) { stamp.style.opacity = '0'; return; }
  el.querySelector(`.e-${d}`)?.classList.add('hot');
  const p = g.current();
  const off = !!g.blockReason(p, d) || (!!p.ad && !p.ad.done);
  const html = off ? `<span class="c-sub">${ICON.x}</span>` : `${arrow(d)}`;
  if (stamp.dataset.h !== html) { stamp.innerHTML = html; stamp.dataset.h = html; }
  stamp.style.opacity = String(Math.min(1, progress));
}
