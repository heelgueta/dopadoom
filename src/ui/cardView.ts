/**
 * Renders one reel-card. Every edge says what that swipe does, computed live
 * through the real scoring pipeline (so "= +3.4" includes your saved effects
 * and repeat decay). Disabled edges are greyed with the reason.
 */
import { CFG } from '../config';
import { effectShort } from '../content/effects';
import type { Game } from '../engine/game';
import { actionOf } from '../engine/scoring';
import type { CardInstance, Dir, Tone } from '../types';
import { ARROW, VERB } from '../types';
import { signed } from '../util';
import { esc, h } from './dom';

const KIND_LABEL: Record<string, string> = {
  intro: '', neutral: 'reel', meme: 'meme', wholesome: 'wholesome', godlike: 'godlike', ragebait: 'ragebait',
  conspiracy: 'conspiracy', ad: 'sponsored', premium: 'premium ad', crypto: 'crypto', brocult: 'brocult',
  dm: 'dm', cursed: '▓cursed▓', system: 'system',
};

const SCRAMBLE = '▒░▓█▚▞';
function scramble(s: string): string {
  return s.replace(/[^\s]/g, () => SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]);
}

export function renderCard(g: Game, card: CardInstance): HTMLElement {
  const d = card.def;
  const el = h('div', `card k-${d.kind}`);
  el.dataset.uid = String(card.uid);
  el.innerHTML = `
    <!-- edges sit where your thumb starts: ↓ label on top, ↑ label at the bottom -->
    <div class="edge e-down" data-dir="down"></div>
    <div class="card-main">
      <div class="card-head">
        <span class="kind">${esc(KIND_LABEL[d.kind] ?? d.kind)}</span>
        <span class="handle">${esc(d.handle ?? '')}</span>
      </div>
      <div class="art">${esc(d.art)}</div>
      <div class="title">${esc(d.title)}</div>
      ${d.body ? `<div class="body">${esc(d.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${d.ad ? '<div class="adbar"><div class="adfill"></div><span class="adtxt"></span></div>' : ''}
      ${d.kind === 'intro' ? '' : `<div class="meta">♥ ${card.likes} · 💬 ${card.comments}</div>`}
      <div class="flags"></div>
    </div>
    <div class="sides">
      <div class="edge e-left" data-dir="left"></div>
      <div class="edge e-right" data-dir="right"></div>
    </div>
    <div class="edge e-up" data-dir="up"></div>
    <div class="stamp"></div>
  `;
  updateCard(g, el, card);
  return el;
}

/** refresh edge labels, ad bar and flags. cheap; called a few times a second */
export function updateCard(g: Game, el: HTMLElement, card: CardInstance): void {
  const s = g.s;
  const scrambled = s.bossActive && !!s.boss?.scramble;
  for (const phys of ['up', 'down', 'left', 'right'] as Dir[]) {
    const edge = el.querySelector<HTMLElement>(`.e-${phys}`);
    if (!edge) continue;
    const html = edgeHtml(g, card, phys);
    const out = scrambled ? `<span class="verb">${ARROW[phys]} ${scramble('REJECT')}</span> <span class="lbl">${scramble('×2 DOPA')}</span>` : html.html;
    if (edge.dataset.h !== out) {
      edge.innerHTML = out;
      edge.dataset.h = out;
    }
    edge.className = `edge e-${phys} t-${scrambled ? 'neutral' : html.tone}${html.off && !scrambled ? ' off' : ''}`;
  }

  const ad = card.def.ad;
  if (ad) {
    const fill = el.querySelector<HTMLElement>('.adfill');
    const txt = el.querySelector<HTMLElement>('.adtxt');
    const p = Math.min(1, card.adWatched / ad.minutes);
    if (fill) fill.style.width = `${p * 100}%`;
    if (txt) txt.textContent = card.adDone ? '✓ ad complete' : `${ad.premium ? 'PREMIUM · unskippable' : 'ad'} · ${Math.ceil(Math.max(0, ad.minutes - card.adWatched))} fake min left`;
    el.classList.toggle('ad-done', card.adDone);
  }

  const flags: string[] = [];
  if (card.saved) flags.push('★ saved');
  if (card.leaves.up + card.leaves.down > 0) flags.push('♻ seen');
  const f = el.querySelector<HTMLElement>('.flags');
  if (f) f.textContent = flags.join('  ');
}

function toneFor(total: number): Tone {
  return total > 0 ? 'good' : total < 0 ? 'bad' : 'neutral';
}

function edgeHtml(g: Game, card: CardInstance, phys: Dir): { html: string; tone: Tone; off: boolean } {
  const p = g.preview(phys);
  const m = p.meaning;
  const verb = `<span class="verb">${ARROW[phys]} ${VERB[m]}</span>`;
  if (p.reason) {
    return { html: `${verb} <span class="why">✕ ${esc(p.reason)}</span>`, tone: 'neutral', off: true };
  }
  const a = actionOf(card, m);
  const ctx = g.ctx(card, m);
  let label = typeof a.label === 'function' ? a.label(ctx) : a.label ?? '';
  if (!label) {
    const parts: string[] = [];
    if (typeof a.gain === 'number' && a.gain !== 0) parts.push(signed(a.gain));
    if (a.save) parts.push(effectShort(a.save));
    label = parts.join(' · ');
  }
  if (a.save && !label.includes(effectShort(a.save).split(' ')[0])) label += ` · ${effectShort(a.save)}`;

  const total = p.result.total;
  let tone: Tone = a.tone ?? (a.save ? 'save' : toneFor(total));
  let pv = '';
  if (p.trap) {
    tone = 'bad';
  } else if (CFG.SHOW_PREVIEWS && (total !== 0 || !label)) {
    pv = `<span class="pv">${label ? '= ' : ''}${signed(total)}</span>`;
  }
  return { html: `${verb} ${label ? `<span class="lbl">${esc(label)}</span>` : ''} ${pv}`, tone, off: false };
}

/** the big tinder-style stamp while dragging */
export function setStamp(g: Game, el: HTMLElement, phys: Dir | null, progress: number): void {
  const stamp = el.querySelector<HTMLElement>('.stamp');
  el.querySelectorAll('.edge.hot').forEach((e) => e.classList.remove('hot'));
  if (!stamp) return;
  if (!phys || progress <= 0.05) {
    stamp.style.opacity = '0';
    return;
  }
  const p = g.preview(phys);
  el.querySelector(`.e-${phys}`)?.classList.add('hot');
  let text: string;
  let tone: Tone;
  if (p.reason) { text = `✕ ${VERB[p.meaning]}`; tone = 'bad'; }
  else if (p.trap) { text = '🌐 TRAP'; tone = 'bad'; }
  else { text = `${VERB[p.meaning]} ${signed(p.result.total)}`; tone = p.meaning === 'right' ? 'save' : toneFor(p.result.total); }
  stamp.textContent = text;
  stamp.className = `stamp t-${tone} s-${phys}`;
  stamp.style.opacity = String(Math.min(1, progress * 1.2));
}
