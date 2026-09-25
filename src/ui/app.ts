/**
 * APP — all DOM. Listens to Game events, forwards input.
 *
 * PACING: after every action the post flies away and a TALLY plays in the
 * middle of the screen (op → each saved effect → decay → total). Input is
 * locked until it finishes, so you actually see what your choice did.
 * Tunable: FEEDBACK, TALLY_STEP_MS, TALLY_HOLD_MS, CHECK_HOLD_MS.
 */
import { CFG } from '../config';
import type { ActEvent, Game } from '../engine/game';
import { loadRecords, MODES } from '../engine/game';
import { opHtml, signCls, signedText } from '../engine/ops';
import type { Action, Dir, ModeId, OutcomeDef } from '../types';
import { clamp, clock, fmt } from '../util';
import { buzz, sfx, unlockAudio } from './audio';
import { byId, esc, h, setText } from './dom';
import { Gestures } from './gestures';
import { arrow, frameStyle, ICON, modsHtml } from './pixel';
import { kebabMenuHtml, renderPost, setStamp, updatePost } from './postView';
import { openTweaks } from './tweaks';

const EASE = 'cubic-bezier(.25,.46,.45,.94)';

const OUT: Record<Action, Keyframe> = {
  up: { transform: 'translate(0,-115%)' },
  down: { transform: 'translate(0,115%)' },
  left: { transform: 'translate(-140%,4%) rotate(-18deg)' },
  right: { transform: 'translate(140%,4%) rotate(18deg)' },
  save: { transform: 'translate(0,-60%) scale(.15)', opacity: 0 },
  block: { transform: 'translate(0,30%) scale(.85)', opacity: 0 },
  report: { transform: 'translate(0,30%) scale(.85)', opacity: 0 },
};
const IN: Record<Action, string> = {
  up: 'translate(0,100%)', down: 'translate(0,-100%)', left: 'scale(.9)', right: 'scale(.9)',
  save: 'scale(.9)', block: 'scale(.9)', report: 'scale(.9)',
};

export class App {
  private stage!: HTMLElement;
  private postEl: HTMLElement | null = null;
  private gestures!: Gestures;
  private busy = false;
  private timers: number[] = [];
  private pauseReasons = new Set<string>();
  private shownDopa = 0;
  /** while the tally plays, the HUD shows this instead of the real dopa */
  private hudHold: number | null = null;
  private refreshT = 0;
  private dragDir: Dir | null = null;

  constructor(private g: Game, private root: HTMLElement) {
    this.build();
    this.wire();
    this.applyCfgClasses();
    this.renderOverlay();
  }

  /* ── skeleton ─────────────────────────────────────────────────────── */

  private build(): void {
    this.root.innerHTML = `
      <header id="hud">
        <div class="hud-row">
          <div class="dopa-box"><div class="lbl">DOPA</div><div id="dopa">10</div></div>
          <div class="right-box"><div id="clock">00:00</div><div id="status"></div></div>
          <button id="pausebtn" aria-label="pause">${ICON.pause}</button>
        </div>
        <div id="chips"></div>
      </header>
      <main id="stage">
        <div id="tally"><div class="t-small"></div><div class="t-big"></div></div>
        <div id="notif"></div>
      </main>
      <div id="floats"></div>
      <div id="toast"></div>
      <div id="website"></div>
      <div id="overlay"></div>
      <div id="sheet"></div>
      <div id="crt"></div>
    `;
    this.stage = byId('stage');
    byId('pausebtn').setAttribute('style', frameStyle('#ffffff', 'solid', 2, 0));
  }

  private wire(): void {
    const g = this.g;
    this.gestures = new Gestures(this.stage, {
      onStart: () => { unlockAudio(); this.closeMenu(); },
      onMove: (dx, dy, dir) => this.drag(dx, dy, dir),
      onEnd: (dir) => this.release(dir),
    });

    g.on('acted', (e) => this.onActed(e));
    g.on('denied', (e) => this.onDenied(e.reason));
    g.on('adTry', (e) => { this.shake(); sfx.deny(); this.float(-e.cost, 'AD'); this.refresh(); });
    g.on('float', (f) => this.float(f.amount, f.label));
    g.on('toast', (t) => this.toast(t));
    g.on('effects', () => { this.renderChips(); this.refresh(); });
    g.on('notif', () => this.renderNotif());
    g.on('website', () => this.renderWebsite());
    g.on('phase', () => this.renderOverlay());
    g.on('adDone', () => { sfx.adDone(); this.refresh(); });

    byId('pausebtn').addEventListener('click', () => { unlockAudio(); this.openPause(); });
    byId('chips').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip[data-uid]');
      if (chip) this.openChip(Number(chip.dataset.uid));
    });

    window.addEventListener('keydown', (e) => {
      const map: Record<string, Action> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', b: 'save',
      };
      if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); this.pauseReasons.has('menu') ? this.closePause() : this.openPause(); return; }
      const a = map[e.key];
      if (a && !e.repeat) { e.preventDefault(); unlockAudio(); this.doAct(a); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.g.s.phase === 'playing') this.openPause();
    });
    document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.scroll')) e.preventDefault(); }, { passive: false });
  }

  applyCfgClasses(): void {
    this.root.classList.toggle('crt', CFG.CRT);
  }

  private setPaused(reason: string, on: boolean): void {
    if (on) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    this.g.s.paused = this.pauseReasons.size > 0;
  }

  /* ── frame ────────────────────────────────────────────────────────── */

  frame(dt: number): void {
    const s = this.g.s;
    // HUD dopa counts toward its target (Balatro-ish tick-up)
    const target = this.hudHold ?? s.dopa;
    this.shownDopa += (target - this.shownDopa) * Math.min(1, dt * 12);
    if (Math.abs(target - this.shownDopa) < 0.05) this.shownDopa = target;
    const d = byId('dopa');
    setText(d, fmt(this.shownDopa));
    d.className = this.shownDopa < 0 ? 'c-sub neg' : '';
    setText(byId('clock'), clock(s.minute));
    this.renderStatus();

    this.refreshT += dt;
    if (this.refreshT > 0.15) { this.refreshT = 0; if (!this.gestures.dragging) this.refresh(); }
    if (s.notif) {
      const bar = document.querySelector<HTMLElement>('#notif .nbar');
      if (bar) bar.style.width = `${clamp(s.notif.left / CFG.NOTIF_SECS, 0, 1) * 100}%`;
    }
    // drowsy: the screen darkens as you approach sleep
    const drowsy = clamp((3 - s.dopa) / (3 - CFG.SLEEP_AT), 0, 1);
    this.stage.style.filter = drowsy > 0 ? `brightness(${1 - drowsy * 0.6}) saturate(${1 - drowsy * 0.7})` : '';
  }

  private renderStatus(): void {
    const g = this.g;
    const st = byId('status');
    const nc = g.nextCheck();
    let html: string;
    if (nc?.kind === 'upkeep') html = `PAY <span class="c-sub">${nc.amount}</span> IN ${nc.in}`;
    else if (nc?.kind === 'quota') html = `NEED <span class="${g.s.dopa >= nc.amount ? 'c-add' : 'c-sub'}">${nc.amount}</span> IN ${nc.in}`;
    else html = `<span class="c-sub">−${g.drainRate().toFixed(2)}/S</span>`;
    if (st.dataset.h !== html) { st.innerHTML = html; st.dataset.h = html; }
  }

  private refresh(): void {
    const p = this.g.current();
    if (this.postEl && Number(this.postEl.dataset.uid) === p.uid) updatePost(this.g, this.postEl, p);
  }

  /* ── posts ────────────────────────────────────────────────────────── */

  private mountPost(from: Action | null): void {
    const p = this.g.current();
    const el = renderPost(this.g, p);
    this.stage.insertBefore(el, byId('tally'));
    if (this.postEl && !this.postEl.classList.contains('leaving')) this.postEl.remove();
    this.postEl = el;
    this.g.viewing = p.uid;
    if (from) el.animate([{ transform: IN[from], opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: CFG.ANIM_MS, easing: EASE });

    const stop = (e: Event) => e.stopPropagation();
    const save = el.querySelector<HTMLElement>('.b-save')!;
    const keb = el.querySelector<HTMLElement>('.b-kebab')!;
    [save, keb].forEach((b) => b.addEventListener('pointerdown', stop));
    save.addEventListener('click', () => { unlockAudio(); this.doAct('save'); });
    keb.addEventListener('click', () => { unlockAudio(); this.toggleMenu(); });
  }

  private toggleMenu(): void {
    const el = this.postEl;
    if (!el || this.busy) return;
    const p = this.g.current();
    if (p.ad && !p.ad.done) { this.doAct('block'); return; } // counts as an ad skip attempt
    const menu = el.querySelector<HTMLElement>('.menu')!;
    if (menu.classList.contains('show')) { this.closeMenu(); return; }
    menu.innerHTML = kebabMenuHtml(this.g, p);
    menu.setAttribute('style', frameStyle('#ffffff', 'solid', 3, 0));
    menu.classList.add('show');
    menu.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => { this.closeMenu(); this.doAct(b.dataset.act as Action); });
    });
    sfx.click();
  }

  private closeMenu(): void {
    this.postEl?.querySelector('.menu')?.classList.remove('show');
  }

  private doAct(a: Action): void {
    if (this.busy || this.g.s.phase !== 'playing' || this.g.s.paused) return;
    this.g.act(a);
  }

  private drag(dx: number, dy: number, dir: Dir | null): void {
    const el = this.postEl;
    const s = this.g.s;
    if (!el || !dir || this.busy || s.phase !== 'playing' || s.paused) return;
    if (dir !== this.dragDir) {
      this.dragDir = dir;
      el.dataset.blocked = this.g.blockReason(this.g.current(), dir) ? '1' : '';
    }
    const f = el.dataset.blocked ? 0.3 : 1;
    el.style.transform = dy ? `translate(0,${dy * f}px)` : `translate(${dx * f}px,0) rotate(${(dx * f) / 20}deg)`;
    setStamp(this.g, el, dir, Math.abs(dx + dy) / CFG.SWIPE_THRESHOLD_PX);
  }

  private release(dir: Dir | null): void {
    this.dragDir = null;
    const el = this.postEl;
    if (!el) return;
    if (dir && !this.busy && this.g.s.phase === 'playing' && !this.g.s.paused && this.g.act(dir)) return;
    this.snapBack(el);
  }

  private snapBack(el: HTMLElement): void {
    const from = el.style.transform;
    el.style.transform = '';
    setStamp(this.g, el, null, 0);
    if (from) el.animate([{ transform: from }, { transform: 'none' }], { duration: 160, easing: EASE });
  }

  private shake(): void {
    const el = this.postEl;
    if (!el) return;
    this.snapBack(el);
    el.animate([0, -10, 10, -6, 6, 0].map((v) => ({ transform: `translateX(${v}px)` })), { duration: 260 });
  }

  private onDenied(reason: string): void {
    this.shake();
    sfx.deny();
    if (CFG.BAD_MOVE_PENALTY) this.float(-CFG.BAD_MOVE_PENALTY, reason);
  }

  /* ── the tally (feedback between posts) ───────────────────────────── */

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private onActed(e: ActEvent): void {
    this.gestures.cancel();
    this.closeMenu();
    const s = this.g.s;
    this.busy = true;

    // fly the old post away
    const old = this.postEl;
    if (old) {
      old.classList.add('leaving');
      const from = old.style.transform || 'none';
      old.animate([{ transform: from }, OUT[e.action]], { duration: CFG.ANIM_MS, easing: EASE, fill: 'forwards' }).onfinish = () => old.remove();
      this.postEl = null;
    }
    if (e.action === 'save') sfx.save(); else if (e.action === 'block' || e.action === 'report') sfx.reject(); else sfx.swipe();

    const r = e.result;
    const checkDelta = e.check?.kind === 'upkeep' ? -e.check.amount : 0;
    const pre = s.dopa - r.total - checkDelta;
    const next = () => { this.hudHold = null; this.mountPost(e.action); this.busy = false; };

    if (!CFG.FEEDBACK || !r.steps.length) {
      if (r.total) this.float(r.total, '');
      if (e.check) this.showCheck(e);
      this.later(CFG.ANIM_MS * 0.6, next);
      return;
    }

    this.hudHold = pre;
    const T = byId('tally');
    const big = T.querySelector<HTMLElement>('.t-big')!;
    const small = T.querySelector<HTMLElement>('.t-small')!;
    T.className = 'show';
    const step = CFG.TALLY_STEP_MS;

    r.steps.forEach((st, i) => {
      this.later(i * step, () => {
        small.innerHTML = `<span class="${st.cls}">${esc(st.text)}</span>`;
        big.innerHTML = `<span class="${signCls(st.after)}">${signedText(st.after)}</span>`;
        big.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 140 });
        if (st.effect !== undefined) {
          document.querySelector<HTMLElement>(`.chip[data-uid="${st.effect}"]`)
            ?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }], { duration: 180 });
        }
        if (i > 0) sfx.chip(i);
      });
    });

    const tEnd = r.steps.length * step;
    this.later(tEnd, () => {
      small.innerHTML = '';
      big.innerHTML = `<span class="${signCls(r.total)}">${signedText(r.total)}</span>`;
      big.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 200, easing: EASE });
      this.hudHold = pre + r.total;
      sfx.gain(r.total);
      buzz(r.total >= 0 ? 12 : [20, 30, 20]);
    });

    let tNext = tEnd + CFG.TALLY_HOLD_MS;
    if (e.check) {
      this.later(tNext, () => this.showCheck(e));
      tNext += CFG.CHECK_HOLD_MS;
    }
    this.later(tNext, () => { T.className = ''; next(); });
  }

  private showCheck(e: ActEvent): void {
    const c = e.check;
    if (!c) return;
    const T = byId('tally');
    T.className = 'show check';
    const big = T.querySelector<HTMLElement>('.t-big')!;
    const small = T.querySelector<HTMLElement>('.t-small')!;
    if (c.kind === 'upkeep') {
      small.textContent = 'UPKEEP';
      big.innerHTML = `<span class="c-sub">−${c.amount}</span>`;
    } else {
      small.innerHTML = c.ok ? '<span class="c-add">QUOTA OK</span>' : '<span class="c-sub">QUOTA FAILED</span>';
      big.innerHTML = `<span class="${c.ok ? 'c-add' : 'c-sub'}">${c.amount}</span>`;
    }
    big.animate([{ transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 260, easing: EASE });
    this.hudHold = null;
    c.ok ? sfx.hour() : sfx.sleep();
  }

  /* ── HUD chips (saved effects) ────────────────────────────────────── */

  private renderChips(): void {
    const s = this.g.s;
    const parts: string[] = [];
    s.effects.forEach((e) => parts.push(`<button class="chip" data-uid="${e.uid}" style="${frameStyle(e.color, 'solid', 2, 0.1)}">${modsHtml(e.mods)}</button>`));
    for (let i = s.effects.length; i < CFG.SAVE_SLOTS; i++) parts.push(`<div class="chip empty" style="${frameStyle('#444444', 'dashed', 2, 0)}"></div>`);
    const html = parts.join('');
    const wrap = byId('chips');
    if (wrap.dataset.h !== html) { wrap.innerHTML = html; wrap.dataset.h = html; }
  }

  private openChip(uid: number): void {
    const g = this.g;
    const i = g.s.effects.findIndex((e) => e.uid === uid);
    const e = g.s.effects[i];
    if (!e) return;
    const body = this.openSheet(`
      <div class="chip-big" style="${frameStyle(e.color, 'solid', 4, 0.1)}">${modsHtml(e.mods)}</div>
      <p class="dim">SLOT ${i + 1}/${CFG.SAVE_SLOTS} · APPLIES LEFT ${arrow('right')} RIGHT</p>
      <div class="row">
        <button class="btn" data-mv="-1" ${i === 0 ? 'disabled' : ''}>${arrow('left')}</button>
        <button class="btn" data-mv="1" ${i === g.s.effects.length - 1 ? 'disabled' : ''}>${arrow('right')}</button>
      </div>
      <button class="btn red" data-del>DELETE</button>
      <button class="btn" data-close>CLOSE</button>`);
    body.querySelectorAll<HTMLElement>('[data-mv]').forEach((b) =>
      b.addEventListener('click', () => { g.moveEffect(uid, Number(b.dataset.mv)); sfx.click(); this.openChip(uid); }));
    body.querySelector('[data-del]')?.addEventListener('click', () => { g.removeEffect(uid); sfx.reject(); this.closeSheet(); });
  }

  /* ── floats / toast ───────────────────────────────────────────────── */

  float(amount: number, label: string): void {
    const el = h('div', `float ${signCls(amount)}`, `${signedText(amount)}${label ? ` <small>${esc(label)}</small>` : ''}`);
    el.style.left = `${16 + Math.random() * 40}px`;
    byId('floats').appendChild(el);
    el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-40px)', opacity: 0 }], { duration: 1000, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  toast(msg: string): void {
    const t = byId('toast');
    t.textContent = msg;
    t.className = 'show';
    this.later(1400, () => { t.className = ''; });
  }

  /* ── notifications ────────────────────────────────────────────────── */

  private outcomeHtml(o: OutcomeDef): string {
    if (o.special === 'website') return '<span class="c-sub">WEB</span>';
    if (o.special === 'gift') return '<span class="c-add">GIFT</span>';
    return o.op ? opHtml(o.op) : '';
  }

  private renderNotif(): void {
    const wrap = byId('notif');
    const n = this.g.s.notif;
    wrap.innerHTML = '';
    if (!n) return;
    sfx.notif();
    const el = h('div', 'nb', `
      <div class="nfrom">${esc(n.def.from)}</div>
      <div class="nouts">
        <span>TAP ${this.outcomeHtml(n.def.tap)}</span>
        <span>SWIPE ${this.outcomeHtml(n.def.swipe)}</span>
        <span>WAIT ${this.outcomeHtml(n.def.wait)}</span>
      </div>
      <div class="nbar"></div>`);
    el.setAttribute('style', frameStyle('#ffffff', 'solid', 3, 0.12));
    wrap.appendChild(el);
    el.animate([{ transform: 'translateY(-120%)' }, { transform: 'none' }], { duration: 220, easing: EASE });

    let x0 = 0, y0 = 0, id = -1, dx = 0, dy = 0;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); unlockAudio(); id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      e.stopPropagation();
      dx = e.clientX - x0; dy = e.clientY - y0;
      el.style.transform = `translate(${dx}px,${Math.min(0, dy)}px)`;
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return;
      e.stopPropagation();
      id = -1;
      if (Math.abs(dx) > 50 || dy < -30) this.g.resolveNotif('swipe');
      else if (Math.hypot(dx, dy) < 12) this.g.resolveNotif('tap');
      else el.style.transform = '';
    });
  }

  /* ── premium-ad website trap ──────────────────────────────────────── */

  private renderWebsite(): void {
    const wrap = byId('website');
    const w = this.g.s.website;
    if (!w) { wrap.innerHTML = ''; wrap.className = ''; return; }
    wrap.className = 'show';
    wrap.innerHTML = `
      <div class="site">
        <div class="url">HTTPS://W1N-FR33-PR1ZE.BIZ</div>
        <div class="blink">YOU WON!!!</div>
        <div class="sitebody">CLOSE ${w.popups} POPUP${w.popups === 1 ? '' : 'S'}<br><span class="c-sub">−${fmt(CFG.WEBSITE_DRAIN)}/S</span></div>
        <button class="decoy" style="left:${w.dx}%;top:${w.dy}%">CLAIM PRIZE ${ICON.x}</button>
        <div class="popup" style="left:${w.x}%;top:${w.y}%">
          <button class="realx" aria-label="close">${ICON.x}</button>
          DON'T GO!!
        </div>
      </div>`;
    wrap.querySelector('.realx')?.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.click(); buzz(10); this.g.websiteTap(true); });
    wrap.querySelector('.decoy')?.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.deny(); this.g.websiteTap(false); });
  }

  /* ── overlays ─────────────────────────────────────────────────────── */

  private renderOverlay(): void {
    const s = this.g.s;
    const ov = byId('overlay');
    if (this.pauseReasons.has('menu')) return;
    if (s.phase === 'menu') ov.innerHTML = this.menuHtml();
    else if (s.phase === 'over') { sfx.sleep(); ov.innerHTML = this.endHtml(false); }
    else if (s.phase === 'won') { sfx.win(); ov.innerHTML = this.endHtml(true); }
    else { ov.className = ''; ov.innerHTML = ''; return; }
    ov.className = 'show';
    this.bindOverlay(ov);
  }

  private bindOverlay(ov: HTMLElement): void {
    ov.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.startMode(b.dataset.mode as ModeId)));
    ov.querySelector('[data-a=again]')?.addEventListener('click', () => this.startMode(this.g.s.mode));
    ov.querySelector('[data-a=modes]')?.addEventListener('click', () => this.toMenu());
    ov.querySelector('[data-a=help]')?.addEventListener('click', () => this.openHelp());
    ov.querySelector('[data-a=tweaks]')?.addEventListener('click', () => openTweaks(this.g, this));
    ov.querySelector('[data-a=resume]')?.addEventListener('click', () => this.closePause());
    ov.querySelector('[data-a=restart]')?.addEventListener('click', () => { this.closePause(); this.startMode(this.g.s.mode); });
    ov.querySelector('[data-a=sound]')?.addEventListener('click', (e) => {
      CFG.SOUND = !CFG.SOUND;
      (e.currentTarget as HTMLElement).textContent = `SOUND ${CFG.SOUND ? 'ON' : 'OFF'}`;
    });
  }

  startMode(mode: ModeId): void {
    unlockAudio();
    this.clearTimers();
    this.busy = false;
    this.hudHold = null;
    this.pauseReasons.clear();
    this.closeSheet();
    byId('tally').className = '';
    this.g.start(mode);
    this.shownDopa = this.g.s.dopa;
    this.renderChips();
    this.mountPost(null);
  }

  private toMenu(): void {
    this.clearTimers();
    this.pauseReasons.clear();
    this.closeSheet();
    this.g.s.phase = 'menu';
    this.g.s.notif = null;
    this.renderNotif();
    this.renderOverlay();
  }

  private menuHtml(): string {
    const rec = loadRecords();
    const modes = MODES.map((m) => {
      const r = rec[m.id];
      const best = r ? `BEST ${clock(r.best)} · ${r.wins}/${r.runs}` : 'NEW';
      return `<button class="mode" data-mode="${m.id}" style="${frameStyle('#ffffff', 'solid', 3, 0.06)}"><b>${m.name}</b><span>${m.line}</span><em>${best}</em></button>`;
    }).join('');
    return `
      <div class="ov scroll">
        <h1 class="title">DOPADOOM</h1>
        <p class="dim">STAY AWAKE TILL 08:00</p>
        ${modes}
        <div class="row">
          <button class="btn" data-a="help">HOW TO</button>
          <button class="btn" data-a="tweaks">TWEAKS</button>
        </div>
        <a class="dim small" href="./pilot1/">PLAY PILOT 1</a>
      </div>`;
  }

  private endHtml(won: boolean): string {
    const s = this.g.s;
    const st = s.stats;
    const mode = MODES.find((m) => m.id === s.mode)?.name ?? '';
    return `
      <div class="ov scroll">
        <p class="dim">${mode}</p>
        <h1 class="title ${won ? 'c-add' : 'c-sub'}">${won ? 'AWAKE' : 'ASLEEP'}</h1>
        <div class="bigclock">${clock(s.minute)}</div>
        <p class="dim">${won ? 'YOU MADE IT' : esc(s.deathMsg)}</p>
        <div class="stats">
          <div><span>MOVES</span><b>${st.actions}</b></div>
          <div><span>PEAK</span><b>${fmt(st.peak)}</b></div>
          <div><span>LIKED</span><b>${st.liked}</b></div>
          <div><span>DISLIKED</span><b>${st.disliked}</b></div>
          <div><span>SAVED</span><b>${st.saved}</b></div>
          <div><span>ADS</span><b>${st.ads}</b></div>
        </div>
        <button class="btn big" data-a="again">AGAIN</button>
        <button class="btn" data-a="modes">MODES</button>
      </div>`;
  }

  openPause(): void {
    const s = this.g.s;
    if (s.phase !== 'playing' && s.phase !== 'website') return;
    this.setPaused('menu', true);
    const ov = byId('overlay');
    ov.innerHTML = `
      <div class="ov scroll">
        <h1 class="title">PAUSED</h1>
        <button class="btn big" data-a="resume">RESUME</button>
        <button class="btn" data-a="restart">RESTART</button>
        <button class="btn" data-a="modes">MODES</button>
        <button class="btn" data-a="help">HOW TO</button>
        <button class="btn" data-a="tweaks">TWEAKS</button>
        <button class="btn" data-a="sound">SOUND ${CFG.SOUND ? 'ON' : 'OFF'}</button>
      </div>`;
    ov.className = 'show';
    this.bindOverlay(ov);
  }

  closePause(): void {
    this.setPaused('menu', false);
    byId('overlay').className = '';
    byId('overlay').innerHTML = '';
    this.renderOverlay();
  }

  /* ── sheets ───────────────────────────────────────────────────────── */

  openSheet(html: string): HTMLElement {
    const sh = byId('sheet');
    sh.innerHTML = `<div class="sheet-bg"></div><div class="sheet-body scroll">${html}</div>`;
    sh.className = 'show';
    this.setPaused('sheet', true);
    sh.querySelector('.sheet-bg')?.addEventListener('click', () => this.closeSheet());
    sh.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeSheet()));
    const body = sh.querySelector<HTMLElement>('.sheet-body')!;
    body.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 200, easing: EASE });
    return body;
  }

  closeSheet(): void {
    const sh = byId('sheet');
    sh.className = '';
    sh.innerHTML = '';
    this.setPaused('sheet', false);
  }

  private openHelp(): void {
    const A = arrow;
    this.openSheet(`
      <h2>HOW TO</h2>
      <div class="help">
        <div>${A('up')} SKIP</div><div>${A('down')} BACK</div>
        <div>${A('left')} DISLIKE</div><div>${A('right')} LIKE</div>
        <div class="wide">${ICON.bookmark} SAVE: TAKE ITS EFFECT INSTEAD</div>
        <div class="wide">${ICON.kebab} BLOCK / REPORT</div>
        <div class="wide">${A('left')} ${A('right')} ONCE PER POST</div>
        <div class="wide">SAVED EFFECTS: LEFT ${A('right')} RIGHT</div>
        <div class="wide"><span class="c-add">+</span> <span class="c-mul">×</span> GOOD · <span class="c-sub">−</span> <span class="c-div">÷</span> BAD</div>
        <div class="wide">ADS CAN'T BE SKIPPED. TRYING COSTS.</div>
        <div class="wide">UPKEEP: PAY EVERY ${CFG.UPKEEP_EVERY} MOVES</div>
        <div class="wide">QUOTA: HAVE ENOUGH EVERY ${CFG.QUOTA_EVERY}</div>
        <div class="wide">CLOCK: REAL TIME DRAIN</div>
        <div class="wide">SLEEP AT ${CFG.SLEEP_AT}</div>
      </div>
      <button class="btn" data-close>OK</button>`);
  }
}
