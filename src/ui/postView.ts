/**
 * One post on screen. Edges only carry arrow + op ("↓ +1", "← ×2").
 * If your saved effects / repeat decay change the outcome, a small "=+3"
 * follows. The save button (bookmark) shows what saving gives you.
 *
 * Layout (↓ label on top, ↑ label at the bottom: you read where your thumb starts):
 *
 *   ┌──────── ↓ +1 ────────┐
 *   │ TYPE          @user  │
 *   │ ← ×2   [art]   → +1  │
 *   │                 [BM] │
 *   │                 +2↑  │
 *   │                  ⋮   │
 *   └──────── ↑ +1 ────────┘
 */
import { CFG } from '../config';
import type { Game } from '../engine/game';
import { opHtml, signCls, signedText } from '../engine/ops';
import type { Dir, Post } from '../types';
import { fmt } from '../util';
import { esc, h } from './dom';
import { arrow, art, frameStyle, ICON, modsHtml } from './pixel';

export function renderPost(g: Game, p: Post): HTMLElement {
  const el = h('div', `post ty-${p.type.id}${p.ad ? ' is-ad' : ''}`);
  el.dataset.uid = String(p.uid);
  el.innerHTML = `
    <div class="frame" style="${frameStyle(p.type.color, p.type.border ?? 'solid')}"></div>
    <div class="edge e-down"></div>
    <div class="head"><span class="ptype" style="color:${p.type.color}">${esc(p.type.name)}</span><span class="handle">${esc(p.handle)}</span></div>
    <div class="mid">
      <div class="edge e-left"></div>
      <div class="center">${art(p.art, p.type.color)}<div class="adbox"></div></div>
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

function edgeHtml(g: Game, p: Post, d: Dir): { html: string; off: boolean } {
  const reason = g.blockReason(p, d);
  if (reason) {
    const why = reason === 'AD' ? '' : `<small>${esc(reason)}</small>`;
    return { html: `${arrow(d)}<span class="x">${ICON.x}</span>${why}`, off: true };
  }
  const op = p.acts[d];
  const r = g.compute(p, d, false);
  // "=+3" only when effects/decay change the raw op result
  const raw = r.steps[0]?.after;
  const eq = !Number.isNaN(r.total) && raw !== undefined && Math.abs(raw - r.total) > 1e-9
    ? `<small class="eq ${signCls(r.total)}">=${signedText(r.total)}</small>`
    : '';
  return { html: `${arrow(d)}<span class="op">${opHtml(op)}</span>${eq}`, off: false };
}

export function updatePost(g: Game, el: HTMLElement, p: Post): void {
  const adLive = !!p.ad && !p.ad.done;
  for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
    const e = el.querySelector<HTMLElement>(`.e-${d}`);
    if (!e) continue;
    const { html, off } = adLive ? { html: `${arrow(d)}<span class="x">${ICON.x}</span>`, off: true } : edgeHtml(g, p, d);
    if (e.dataset.h !== html) { e.innerHTML = html; e.dataset.h = html; }
    e.classList.toggle('off', off);
  }

  // save button
  const save = el.querySelector<HTMLElement>('.b-save');
  if (save) {
    const ico = save.querySelector<HTMLElement>('.ico')!;
    const rl = save.querySelector<HTMLElement>('.rl')!;
    const icoHtml = p.saved ? ICON.bookmarkOn : ICON.bookmark;
    if (ico.innerHTML !== icoHtml) ico.innerHTML = icoHtml;
    const label = p.save ? modsHtml(p.save) : '<span class="c-dim">—</span>';
    if (rl.dataset.h !== label) { rl.innerHTML = label; rl.dataset.h = label; }
    save.classList.toggle('off', adLive || !!g.blockReason(p, 'save'));
  }
  el.querySelector('.b-kebab')?.classList.toggle('off', adLive);

  // ad countdown
  const box = el.querySelector<HTMLElement>('.adbox');
  if (box && p.ad) {
    let html: string;
    if (!p.ad.done) {
      const skip = p.ad.premium
        ? '<span class="c-sub">SKIP = TRAP</span>'
        : `SKIP <span class="c-sub">−${fmt(g.adNextCost(p))} +${fmt(CFG.AD_TRY_ADD_SECS)}S</span>`;
      html = `<div class="adnum">${Math.ceil(p.ad.left)}</div><div class="adskip">${skip}</div>`;
    } else html = '<div class="adskip c-add">DONE</div>';
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
  }
  el.classList.toggle('ad-live', adLive);
}

export function kebabMenuHtml(g: Game, p: Post): string {
  const row = (a: 'block' | 'report', label: string) => {
    const op = a === 'block' ? p.block : p.report;
    return `<button class="mi" data-act="${a}">${label} <span>${opHtml(op)}</span></button>`;
  };
  return `${row('block', 'BLOCK')}${row('report', 'REPORT')}`;
}

/** big stamp while dragging */
export function setStamp(g: Game, el: HTMLElement, d: Dir | null, progress: number): void {
  const stamp = el.querySelector<HTMLElement>('.stamp');
  el.querySelectorAll('.edge.hot').forEach((x) => x.classList.remove('hot'));
  if (!stamp) return;
  if (!d || progress < 0.1) { stamp.style.opacity = '0'; return; }
  const p = g.current();
  el.querySelector(`.e-${d}`)?.classList.add('hot');
  const reason = g.blockReason(p, d);
  let html: string;
  if (reason) html = `<span class="c-sub">${ICON.x}</span>`;
  else {
    const r = g.compute(p, d, false);
    html = Number.isNaN(r.total) ? opHtml(p.acts[d]) : `<span class="${signCls(r.total)}">${signedText(r.total)}</span>`;
  }
  if (stamp.dataset.h !== html) { stamp.innerHTML = html; stamp.dataset.h = html; }
  stamp.className = `stamp s-${d}`;
  stamp.style.opacity = String(Math.min(1, progress));
}
