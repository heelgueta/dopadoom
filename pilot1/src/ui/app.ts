/**
 * APP — the whole UI. Listens to Game events and animates; forwards input to
 * the Game. Sections:
 *   skeleton · frame loop · card stage (drag + fly animations) · HUD & chips ·
 *   floats/toasts/breakdown · notifications · website trap · overlays · sheets
 */
import { CFG } from '../config';
import type { Game, SwipeEvent } from '../engine/game';
import { loadRecords } from '../engine/game';
import type { Dir, EffectInstance, GainResult, Tone } from '../types';
import { ARROW } from '../types';
import { clamp, clock, fmt, signed } from '../util';
import { buzz, sfx, unlockAudio } from './audio';
import { renderCard, setStamp, updateCard } from './cardView';
import { byId, esc, h, setText } from './dom';
import { Gestures } from './gestures';
import { openTweaks } from './tweaks';

const EASE = 'cubic-bezier(.25,.46,.45,.94)'; // slik's curve

const OUT: Record<Dir, string> = {
  up: 'translate(0,-115%)',
  down: 'translate(0,115%)',
  left: 'translate(-140%,4%) rotate(-24deg)',
  right: 'translate(140%,4%) rotate(24deg)',
};
const IN: Record<Dir, string> = {
  up: 'translate(0,100%)',
  down: 'translate(0,-100%)',
  left: 'scale(.9)',
  right: 'scale(.9)',
};

export class App {
  private stage!: HTMLElement;
  private cardEl!: HTMLElement;
  private gestures!: Gestures;
  private pauseReasons = new Set<string>();
  private labelTimer = 0;
  private chipTimer = 0;
  private dragDir: Dir | null = null;

  constructor(private g: Game, private root: HTMLElement) {
    this.build();
    this.wire();
    this.mountCard(false);
    this.renderChips();
    this.applyCfgClasses();
  }

  /* ── skeleton ─────────────────────────────────────────────────────── */

  private build(): void {
    this.root.innerHTML = `
      <header id="hud">
        <div class="hud-row">
          <div class="dopa-box">
            <div class="lbl">DOPA</div>
            <div id="dopa">10</div>
            <div id="drain"></div>
          </div>
          <div class="clock-box">
            <div id="clock">00:00</div>
            <div id="bossinfo"></div>
          </div>
          <button id="pausebtn" aria-label="pause">❚❚</button>
        </div>
        <div id="chips"></div>
        <div id="breakdown"></div>
        <div id="mods"></div>
      </header>
      <main id="stage">
        <div id="notif"></div>
        <div id="hint">↑ swipe up</div>
      </main>
      <div id="floats"></div>
      <div id="toasts"></div>
      <div id="lids"><div class="lid top"></div><div class="lid bot"></div></div>
      <div id="crt"></div>
      <div id="website"></div>
      <div id="overlay"></div>
      <div id="sheet"></div>
    `;
    this.stage = byId('stage');
  }

  private wire(): void {
    const g = this.g;
    this.gestures = new Gestures(this.stage, {
      onStart: () => unlockAudio(),
      onMove: (dx, dy, dir) => this.drag(dx, dy, dir),
      onEnd: (dir) => this.release(dir),
    });

    g.on('swiped', (e) => this.onSwiped(e));
    g.on('denied', (e) => this.onDenied(e.dir, e.reason));
    g.on('gain', (r) => this.onGain(r));
    g.on('float', (f) => this.float(f.amount, f.label));
    g.on('toast', (t) => this.toast(t.msg, t.tone));
    g.on('effects', () => { this.renderChips(); this.refreshLabels(); });
    g.on('boss', (on) => this.onBoss(on));
    g.on('notif', () => this.renderNotif());
    g.on('website', () => this.renderWebsite());
    g.on('phase', () => this.renderOverlay());
    g.on('adDone', () => { sfx.adDone(); this.refreshLabels(); });
    g.on('refresh', () => this.mountCard(false));
    g.on('reset', () => { this.pauseReasons.clear(); this.closeSheet(); this.hideOverlay(); this.mountCard(false); this.renderChips(); this.renderOverlay(); this.renderNotif(); this.renderWebsite(); });

    byId('pausebtn').addEventListener('click', () => { unlockAudio(); this.openPause(); });
    byId('chips').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip[data-uid]');
      if (chip) this.openEffectSheet(Number(chip.dataset.uid));
    });

    window.addEventListener('keydown', (e) => {
      const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (e.key === ' ' || e.key === 'Escape' || e.key === 'p') { e.preventDefault(); this.pauseReasons.has('menu') ? this.closeOverlayPause() : this.openPause(); return; }
      const dir = map[e.key];
      if (dir && !e.repeat && this.g.s.phase === 'playing' && !this.g.s.paused) { e.preventDefault(); unlockAudio(); this.g.swipe(dir); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.g.s.started && this.g.s.phase === 'playing') this.openPause();
    });
    // kill pull-to-refresh / bounce like slik did
    document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.scroll')) e.preventDefault(); }, { passive: false });
  }

  setPaused(reason: string, on: boolean): void {
    if (on) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    this.g.s.paused = this.pauseReasons.size > 0;
  }

  applyCfgClasses(): void {
    this.root.classList.toggle('crt', CFG.CRT);
  }

  /* ── frame loop (called from main.ts) ─────────────────────────────── */

  frame(dt: number): void {
    const s = this.g.s;
    this.renderHud();
    this.labelTimer += dt;
    if (this.labelTimer > 0.2) { this.labelTimer = 0; if (!this.gestures.dragging) this.refreshLabels(); }
    this.chipTimer += dt;
    if (this.chipTimer > 0.5) { this.chipTimer = 0; this.renderChips(); }
    this.renderLids();
    if (s.notif) {
      const bar = document.querySelector<HTMLElement>('#notif .nbar');
      if (bar) bar.style.width = `${clamp((s.notif.expiresAt - s.minute) / CFG.NOTIF_LIFETIME_MIN, 0, 1) * 100}%`;
    }
    byId('hint').classList.toggle('show', !s.started && s.phase === 'playing');
  }

  /* ── card stage ───────────────────────────────────────────────────── */

  private mountCard(animateFrom: Dir | false): void {
    const old = this.cardEl;
    this.cardEl = renderCard(this.g, this.g.current());
    this.stage.insertBefore(this.cardEl, byId('notif'));
    if (old && !animateFrom) old.remove();
    if (animateFrom) {
      this.cardEl.animate([{ transform: IN[animateFrom], opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: CFG.ANIM_MS, easing: EASE });
    }
  }

  private refreshLabels(): void {
    if (this.cardEl) updateCard(this.g, this.cardEl, this.g.current());
  }

  private drag(dx: number, dy: number, dir: Dir | null): void {
    const s = this.g.s;
    if (s.phase !== 'playing' || s.paused || !dir) return;
    if (dir !== this.dragDir) {
      this.dragDir = dir;
      this.cardEl.dataset.blocked = this.g.preview(dir).reason ? '1' : '';
    }
    const f = this.cardEl.dataset.blocked ? CFG.RUBBER_BAND : 1;
    const t = dy ? `translate(0,${dy * f}px)` : `translate(${dx * f}px,0) rotate(${(dx * f) / 18}deg)`;
    this.cardEl.style.transform = t;
    setStamp(this.g, this.cardEl, dir, Math.abs(dx + dy) / CFG.SWIPE_THRESHOLD_PX);
  }

  private release(dir: Dir | null): void {
    this.dragDir = null;
    const s = this.g.s;
    const el = this.cardEl;
    if (dir && s.phase === 'playing' && !s.paused && this.g.swipe(dir)) return; // onSwiped animates
    this.snapBack(el);
  }

  private snapBack(el: HTMLElement): void {
    const from = el.style.transform;
    el.style.transform = '';
    setStamp(this.g, el, null, 0);
    if (from) el.animate([{ transform: from }, { transform: 'none' }], { duration: 180, easing: EASE });
  }

  private onSwiped(e: SwipeEvent): void {
    this.gestures.cancel();
    this.dragDir = null;
    const old = this.cardEl;

    if (e.from === e.to) {
      // card stays (e.g. "close app"): just wobble
      this.snapBack(old);
      old.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 200 });
      this.refreshLabels();
      return;
    }

    // fly the old card out from wherever the finger left it
    if (e.forced) setStamp(this.g, old, e.dir, 1);
    const from = old.style.transform || 'none';
    old.classList.add('leaving');
    old.animate([{ transform: from }, { transform: OUT[e.dir], opacity: e.meaning === 'left' ? 0.2 : 1 }], { duration: CFG.ANIM_MS, easing: EASE, fill: 'forwards' })
      .onfinish = () => old.remove();

    this.mountCard(e.dir);

    if (e.meaning === 'right') sfx.save();
    else if (e.meaning === 'left') sfx.reject();
    else sfx.swipe();
  }

  private onDenied(dir: Dir, reason: string): void {
    const el = this.cardEl;
    this.snapBack(el);
    const ax = dir === 'left' || dir === 'right' ? 'X' : 'Y';
    el.animate(
      [0, -10, 10, -6, 6, 0].map((v) => ({ transform: `translate${ax}(${v}px)` })),
      { duration: 260, easing: 'ease-out' },
    );
    el.classList.add('denied');
    setTimeout(() => el.classList.remove('denied'), 320);
    sfx.deny();
    this.toast(`${ARROW[dir]} ✕ ${reason}`, 'bad');
    if (CFG.BAD_SWIPE_PENALTY) this.float(-CFG.BAD_SWIPE_PENALTY, 'nope');
  }

  /* ── HUD ──────────────────────────────────────────────────────────── */

  private renderHud(): void {
    const g = this.g;
    const s = g.s;
    const dopaEl = byId('dopa');
    setText(dopaEl, fmt(s.dopa));
    dopaEl.className = s.dopa < 0 ? 'neg' : s.dopa < 5 ? 'low' : '';
    setText(byId('drain'), `−${g.drainRate().toFixed(2)}/min${CFG.SPEED !== 1 ? ` · ${CFG.SPEED}×` : ''}`);
    setText(byId('clock'), clock(s.minute));

    const info = byId('bossinfo');
    const b = s.boss;
    if (b && s.bossActive) {
      setText(info, `⚠ ${b.icon} ${b.name} · ${Math.ceil(60 - g.hourMinute())}m`);
      info.className = 'active';
    } else if (b) {
      setText(info, `boss @ :${60 - CFG.BOSS_MINUTES} · ${b.icon} ${b.name}`);
      info.className = '';
    }
    this.stage.classList.toggle('boss', s.bossActive);
    this.stage.classList.toggle('dim', s.bossActive && !!b?.dim);
  }

  private renderChips(): void {
    const s = this.g.s;
    const wrap = byId('chips');
    const html: string[] = [];
    s.saved.forEach((e) => html.push(this.chipHtml(e)));
    for (let i = s.saved.length; i < s.slots; i++) html.push('<div class="chip empty"></div>');
    const out = html.join('');
    if (wrap.dataset.h !== out) { wrap.innerHTML = out; wrap.dataset.h = out; }

    const mods = byId('mods');
    const m = s.mods.map((x) => `<span class="mod">${x.icon} ${esc(x.label)}</span>`).join('');
    if (mods.dataset.h !== m) { mods.innerHTML = m; mods.dataset.h = m; }
  }

  private chipHtml(e: EffectInstance): string {
    const short = typeof e.def.short === 'function' ? e.def.short(this.g.s, e) : e.def.short;
    const cls = ['chip', e.def.curse ? 'curse' : '', e.inverted ? 'inv' : '', e.def.copy ? 'copy' : ''].join(' ');
    return `<button class="${cls}" data-uid="${e.uid}"><span class="ci">${e.def.icon}</span><span class="cs">${e.inverted ? '⇄ ' : ''}${esc(short)}</span></button>`;
  }

  /* ── floats, toasts, breakdown ────────────────────────────────────── */

  private onGain(r: GainResult): void {
    if (r.total !== 0) this.float(r.total, '');
    sfx.gain(r.total);
    // balatro jiggle: chips fire left → right
    const effectSteps = r.steps.filter((st) => st.uid !== undefined);
    effectSteps.forEach((st, i) => {
      setTimeout(() => {
        const chip = document.querySelector<HTMLElement>(`.chip[data-uid="${st.uid}"]`);
        chip?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 180 });
        sfx.chip(i);
      }, 60 + i * 90);
    });
    const bd = byId('breakdown');
    if (!CFG.SHOW_BREAKDOWN || !r.steps.length) { bd.textContent = ''; return; }
    bd.innerHTML =
      r.steps.map((st) => `<span class="st st-${st.src}">${st.icon && st.src !== 'base' ? `${st.icon}` : ''}${esc(st.text)}</span>`).join('<i>›</i>') +
      `<b class="${r.total >= 0 ? 'pos' : 'neg'}">= ${signed(r.total)}</b>`;
    bd.classList.remove('flash');
    void bd.offsetWidth;
    bd.classList.add('flash');
  }

  float(amount: number, label: string): void {
    const el = h('div', `float ${amount >= 0 ? 'pos' : 'neg'}`, `${signed(amount)}${label ? ` <small>${esc(label)}</small>` : ''}`);
    el.style.left = `${18 + Math.random() * 30}px`;
    byId('floats').appendChild(el);
    el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-46px)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => el.remove();
    const d = byId('dopa');
    d.animate([{ transform: 'scale(1)' }, { transform: `scale(${amount >= 0 ? 1.18 : 0.9})` }, { transform: 'scale(1)' }], { duration: 160 });
  }

  toast(msg: string, tone: Tone = 'neutral'): void {
    const wrap = byId('toasts');
    const el = h('div', `toast t-${tone}`, esc(msg));
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.firstElementChild?.remove();
    el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 150 });
    setTimeout(() => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => el.remove(), 1800);
  }

  private onBoss(on: boolean): void {
    const b = this.g.s.boss;
    if (on && b) {
      sfx.boss();
      this.toast(`⚠ BOSS: ${b.icon} ${b.name} — ${b.desc}`, 'bad');
      this.stage.animate([{ filter: 'brightness(2)' }, { filter: 'none' }], { duration: 400 });
    }
    this.refreshLabels();
  }

  /* ── eyelids (drowsiness) ─────────────────────────────────────────── */

  private renderLids(): void {
    const s = this.g.s;
    const span = Math.max(0.01, CFG.DROWSY_AT - CFG.SLEEP_AT);
    let c = clamp((CFG.DROWSY_AT - s.dopa) / span, 0, 1);
    if (CFG.GOD_MODE) c = Math.min(c, 0.6);
    if (s.phase === 'over') c = 1;
    // occasional heavy blink when drowsy
    const blink = c > 0.3 && Math.sin(performance.now() / 700) > 0.97 ? 0.3 : 0;
    const pct = Math.min(50, (c * 0.85 + blink) * 50);
    const top = document.querySelector<HTMLElement>('.lid.top');
    const bot = document.querySelector<HTMLElement>('.lid.bot');
    if (top && bot) { top.style.height = `${pct}%`; bot.style.height = `${pct}%`; }
    this.stage.style.filter = c > 0 && s.phase !== 'over' ? `saturate(${1 - c * 0.8}) blur(${c > 0.6 ? (c - 0.6) * 3 : 0}px)` : '';
  }

  /* ── notifications ────────────────────────────────────────────────── */

  private renderNotif(): void {
    const wrap = byId('notif');
    const n = this.g.s.notif;
    if (!n) {
      const cur = wrap.firstElementChild as HTMLElement | null;
      if (cur) cur.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-30px)' }], { duration: 180 }).onfinish = () => cur.remove();
      return;
    }
    sfx.notif();
    wrap.innerHTML = '';
    const el = h('div', 'nbanner', `
      <div class="nicon">${n.def.icon}</div>
      <div class="ntext"><b>${esc(n.def.from)}</b><span>${esc(n.def.text)}</span><em>tap: open · swipe: dismiss</em></div>
      <div class="nbar"></div>`);
    wrap.appendChild(el);
    el.animate([{ transform: 'translateY(-120%)' }, { transform: 'none' }], { duration: 250, easing: EASE });

    // own gesture: keep it from reaching the card
    let x0 = 0, y0 = 0, id = -1, dx = 0, dy = 0;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); });
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
      if (this.g.s.phase !== 'playing') { el.style.transform = ''; return; }
      if (Math.abs(dx) > 60 || dy < -40) this.g.resolveNotif('dismiss');
      else if (Math.hypot(dx, dy) < 12) this.g.resolveNotif('open');
      else el.style.transform = '';
    });
  }

  /* ── premium-ad website trap ──────────────────────────────────────── */

  private renderWebsite(): void {
    const wrap = byId('website');
    const w = this.g.s.website;
    if (!w) { wrap.innerHTML = ''; wrap.classList.remove('show'); return; }
    wrap.classList.add('show');
    wrap.innerHTML = `
      <div class="browser">
        <div class="urlbar">🔒 <span>${esc(w.url)}</span></div>
        <div class="site">
          <marquee>${esc(w.headline)} ✦ ${esc(w.headline)}</marquee>
          <div class="site-body">🤑 🎁 ⌚ 💎 🐺<br>ACT NOW<br><small>dopa draining ×${CFG.WEBSITE_DRAIN_MULT} while you're here</small></div>
          <div class="popcount">close ${w.popupsLeft} popup${w.popupsLeft === 1 ? '' : 's'} to escape</div>
        </div>
        <button class="decoy" style="left:${w.dx}%;top:${w.dy}%">🎁 CLAIM PRIZE ✕</button>
        <div class="popup" style="left:${w.x}%;top:${w.y}%">
          <button class="realx" aria-label="close">✕</button>
          <div>WAIT!! don't leave 🥺</div>
        </div>
      </div>`;
    wrap.querySelector('.realx')?.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.click(); buzz(10); this.g.websiteTap(true); });
    wrap.querySelector('.decoy')?.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.deny(); this.g.websiteTap(false); });
  }

  /* ── overlays: hour break / sleep / win / pause ───────────────────── */

  private renderOverlay(): void {
    const s = this.g.s;
    const ov = byId('overlay');
    if (this.pauseReasons.has('menu')) return; // pause menu owns the overlay
    if (s.phase === 'hourbreak') { sfx.hour(); ov.innerHTML = this.hourBreakHtml(); this.showOverlay(); }
    else if (s.phase === 'over') { sfx.sleep(); ov.innerHTML = this.endHtml(false); this.showOverlay(); }
    else if (s.phase === 'won') { sfx.win(); ov.innerHTML = this.endHtml(true); this.showOverlay(); }
    else { this.hideOverlay(); return; }

    ov.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) =>
      b.addEventListener('click', () => { sfx.click(); this.g.choose(b.dataset.choice || null); }),
    );
    ov.querySelector('[data-act=again]')?.addEventListener('click', () => this.restart());
    ov.querySelector('[data-act=same]')?.addEventListener('click', () => this.restart(this.g.s.seed));
    ov.querySelector('[data-act=endless]')?.addEventListener('click', () => this.g.continueEndless());
    ov.querySelector('[data-act=tweaks]')?.addEventListener('click', () => openTweaks(this.g, this));
  }

  private showOverlay(): void {
    const ov = byId('overlay');
    ov.classList.add('show');
    ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  }
  private hideOverlay(): void {
    const ov = byId('overlay');
    ov.classList.remove('show');
    ov.innerHTML = '';
  }

  private hourBreakHtml(): string {
    const g = this.g;
    const s = g.s;
    const b = s.boss;
    const choices = s.choices
      .map((c) => `<button class="choice" data-choice="${c.id}"><span class="ch-i">${c.icon}</span><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></button>`)
      .join('');
    return `
      <div class="ov-inner scroll">
        <div class="kicker">☀️ ${clock(s.minute)}</div>
        <h1>hour ${s.hour} survived</h1>
        <p class="sub">dopa ${fmt(s.dopa)} · drain now −${g.drainRate().toFixed(2)}/min</p>
        ${b ? `<div class="nextboss">next boss @ :${60 - CFG.BOSS_MINUTES}<br><b>${b.icon} ${esc(b.name)}</b><br><small>${esc(b.desc)}</small></div>` : ''}
        <div class="choices">${choices}</div>
        <button class="btn ghost" data-choice="">keep scrolling →</button>
      </div>`;
  }

  private endHtml(won: boolean): string {
    const s = this.g.s;
    const st = s.stats;
    const r = loadRecords();
    const rows: [string, string][] = [
      ['swipes', String(st.swipes)], ['reels seen', String(st.cardsSeen)], ['saved', String(st.saved)],
      ['rejected', String(st.rejected)], ['peak dopa', fmt(st.peakDopa)], ['lowest', fmt(st.lowDopa)],
      ['ads watched', String(st.adsWatched)], ['websites', String(st.websites)], ['denied', String(st.denied)],
    ];
    return `
      <div class="ov-inner scroll">
        <div class="big">${won ? '🌅' : '💤'}</div>
        <h1>${won ? `${clock(s.minute)}. you made it.` : `you fell asleep at ${clock(s.minute)}`}</h1>
        <p class="sub">${won ? 'the sun is up. you are not okay.' : esc(s.deathMsg)}</p>
        <div class="stats">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="saved-final">${s.saved.map((e) => `${e.def.icon} ${esc(e.def.name)}`).join(' · ') || 'no saved effects'}</div>
        <p class="rec">best ${clock(r.bestMinute)} · runs ${r.runs} · wins ${r.wins} · seed ${esc(s.seed)}</p>
        ${won ? '<button class="btn" data-act="endless">keep scrolling (endless)</button>' : ''}
        <button class="btn ${won ? 'ghost' : ''}" data-act="again">${won ? 'new run' : 'wake up. scroll again.'}</button>
        <button class="btn ghost" data-act="same">replay same seed</button>
        <button class="btn ghost small" data-act="tweaks">⚙ tweaks</button>
      </div>`;
  }

  restart(seed?: string): void {
    this.g.reset(seed);
    byId('breakdown').innerHTML = '';
    byId('toasts').innerHTML = '';
  }

  openPause(): void {
    const s = this.g.s;
    if (s.phase === 'over' || s.phase === 'won') return;
    this.setPaused('menu', true);
    const ov = byId('overlay');
    const speeds = [0.5, 1, 2, 4].map((v) => `<button class="seg ${CFG.SPEED === v ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('');
    ov.innerHTML = `
      <div class="ov-inner scroll">
        <div class="kicker">${clock(s.minute)} · seed ${esc(s.seed)}</div>
        <h1>paused</h1>
        <button class="btn" data-act="resume">resume</button>
        <div class="segrow">${speeds}</div>
        <button class="btn ghost" data-act="sound">sound: ${CFG.SOUND ? 'on' : 'off'}</button>
        <button class="btn ghost" data-act="tweaks">⚙ tweaks & debug</button>
        <button class="btn ghost" data-act="help">how to play</button>
        <button class="btn ghost" data-act="restart">restart run</button>
      </div>`;
    this.showOverlay();
    ov.querySelector('[data-act=resume]')?.addEventListener('click', () => this.closeOverlayPause());
    ov.querySelector('[data-act=restart]')?.addEventListener('click', () => { this.closeOverlayPause(); this.restart(); });
    ov.querySelector('[data-act=tweaks]')?.addEventListener('click', () => openTweaks(this.g, this));
    ov.querySelector('[data-act=help]')?.addEventListener('click', () => this.openHelp());
    ov.querySelector('[data-act=sound]')?.addEventListener('click', (e) => {
      CFG.SOUND = !CFG.SOUND;
      (e.target as HTMLElement).textContent = `sound: ${CFG.SOUND ? 'on' : 'off'}`;
    });
    ov.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        CFG.SPEED = Number(b.dataset.speed);
        ov.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
  }

  closeOverlayPause(): void {
    this.setPaused('menu', false);
    this.hideOverlay();
    this.renderOverlay(); // phase overlay (hour break etc) comes back if needed
  }

  /* ── sheets (bottom) ──────────────────────────────────────────────── */

  openSheet(html: string, onClose?: () => void): HTMLElement {
    const sh = byId('sheet');
    sh.innerHTML = `<div class="sheet-bg"></div><div class="sheet-body scroll">${html}</div>`;
    sh.classList.add('show');
    if (CFG.PAUSE_ON_SHEET) this.setPaused('sheet', true);
    const close = () => { this.closeSheet(); onClose?.(); };
    sh.querySelector('.sheet-bg')?.addEventListener('click', close);
    sh.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const body = sh.querySelector<HTMLElement>('.sheet-body')!;
    body.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 220, easing: EASE });
    return body;
  }

  closeSheet(): void {
    const sh = byId('sheet');
    sh.classList.remove('show');
    sh.innerHTML = '';
    this.setPaused('sheet', false);
  }

  private openEffectSheet(uid: number): void {
    const g = this.g;
    const s = g.s;
    const i = s.saved.findIndex((e) => e.uid === uid);
    const e = s.saved[i];
    if (!e) return;
    const cost = g.effectCost(e);
    const trig = e.def.triggers ? e.def.triggers.map((d) => ARROW[d]).join(' ') : 'all swipes';
    const body = this.openSheet(`
      <div class="fx-head"><span class="fx-icon">${e.def.icon}</span><div><h2>${esc(e.def.name)}</h2><small>slot ${i + 1} of ${s.slots} · triggers: ${trig}</small></div></div>
      <p class="fx-desc">${esc(e.def.desc)}</p>
      ${e.inverted ? '<p class="fx-warn">⇄ INVERTED — its effect is mirrored.</p>' : ''}
      ${e.def.curse ? '<p class="fx-warn">☠ curse</p>' : ''}
      <p class="fx-note">effects apply left → right. order matters.</p>
      <div class="fx-btns">
        <button class="btn ghost" data-mv="-1" ${i === 0 ? 'disabled' : ''}>◀ move left</button>
        <button class="btn ghost" data-mv="1" ${i === s.saved.length - 1 ? 'disabled' : ''}>move right ▶</button>
      </div>
      <button class="btn ${cost > 0 ? 'danger' : ''}" data-del>${cost < 0 ? `sell (+${fmt(-cost)} dopa)` : cost === 0 ? 'delete (free)' : `delete (−${fmt(cost)} dopa)`}</button>
      <button class="btn ghost" data-close>close</button>
    `);
    body.querySelectorAll<HTMLElement>('[data-mv]').forEach((b) =>
      b.addEventListener('click', () => { g.moveEffect(uid, Number(b.dataset.mv)); sfx.click(); this.openEffectSheet(uid); }),
    );
    body.querySelector('[data-del]')?.addEventListener('click', () => { g.removeEffect(uid); sfx.reject(); this.closeSheet(); });
  }

  private openHelp(): void {
    this.openSheet(`
      <h2>how to play</h2>
      <p>stay awake until <b>08:00</b>. dopa drains every fake minute. hit <b>${CFG.SLEEP_AT}</b> and you sleep.</p>
      <ul class="help">
        <li><b>↑ skip</b> next reel. base +${CFG.BASE_SWIPE_GAIN}.</li>
        <li><b>↓ back</b> previous reel (if you didn't reject it). base +${CFG.BASE_SWIPE_GAIN}.</li>
        <li><b>← reject</b> one-shot effect, the reel is gone forever.</li>
        <li><b>→ save</b> put its effect in your saved strip (max ${CFG.SAVED_SLOTS}).</li>
        <li>every edge of a reel tells you what that swipe does, <b>= total</b> includes your effects.</li>
        <li>swiping the same way on the same reel again decays: ×1 → ×.9 → ×.8 …</li>
        <li>saved effects apply <b>left → right</b>. tap a chip to reorder or delete.</li>
        <li>last ${CFG.BOSS_MINUTES} minutes of every hour: <b>boss</b>. drain ×${CFG.BOSS_DRAIN_MULT} + a rule.</li>
        <li>ads can't be rejected while playing; skipping early costs dopa. premium ads trap you on a website.</li>
        <li>notifications: tap to open, swipe to dismiss, or ignore them.</li>
        <li>desktop: arrow keys / WASD, space = pause.</li>
      </ul>
      <button class="btn ghost" data-close>ok</button>
    `);
  }
}
