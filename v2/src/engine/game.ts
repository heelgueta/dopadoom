/**
 * GAME — state + rules, no DOM. The UI calls act()/update() and listens.
 *
 *   ↑ skip     next post
 *   ↓ back     previous (non-blocked) post
 *   ← dislike  once per post, then next post
 *   → like     once per post, then next post
 *   SAVE       (bookmark button) take the post's effect INSTEAD of a swipe, then next
 *   BLOCK      (⋮ menu) remove the post for good, then next
 *   REPORT     (⋮ menu) same, but pays off only on fake news
 *
 * Every action applies an op to dopa, then your saved effects modify the gain
 * left → right (order matters), then repeat-decay for ↑/↓.
 *
 * MODES (how the night hurts you):
 *   upkeep  every N actions you PAY a growing amount
 *   quota   every N actions you must HAVE a growing amount
 *   clock   dopa drains in real time
 */
import { CFG } from '../config';
import { NOTIFS } from '../content/notifs';
import { AD_TYPE, GIFTS, POST_TYPES, PREMIUM_TYPE, TUTORIAL } from '../content/posts';
import type {
  Action, Check, Dir, GameState, ModeId, Notif, Op, Phase, Post, PostType, Result, TallyStep, Website,
} from '../types';
import { fmt, makeRng, randomSeed, round2, weightedPick } from '../util';
import { applyOp, modCls, modText, OP_CLS, opText, parseMod, parseTemplate } from './ops';

/* ── events ─────────────────────────────────────────────────────────── */

export interface ActEvent {
  action: Action;
  from: Post;
  to: Post;
  result: Result;
  check: Check | null;
}

export interface Events {
  acted: ActEvent;
  denied: { action: Action; reason: string };
  adTry: { cost: number; add: number };
  float: { amount: number; label: string };
  toast: string;
  notif: Notif | null;
  website: Website | null;
  phase: Phase;
  effects: undefined;
  adDone: Post;
}

type Handler<T> = (p: T) => void;
class Emitter<E> {
  private h: { [K in keyof E]?: Handler<E[K]>[] } = {};
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): void { (this.h[k] ??= []).push(fn); }
  protected emit<K extends keyof E>(k: K, p: E[K]): void { this.h[k]?.forEach((f) => f(p)); }
}

/* ── records ────────────────────────────────────────────────────────── */

export interface Rec { runs: number; wins: number; best: number }
const REC_KEY = 'dopadoom2.records';
export function loadRecords(): Record<string, Rec> {
  try { return JSON.parse(localStorage.getItem(REC_KEY) ?? '{}'); } catch { return {}; }
}
function saveRecord(mode: ModeId, minute: number, won: boolean): void {
  const all = loadRecords();
  const r = all[mode] ?? { runs: 0, wins: 0, best: 0 };
  r.runs++;
  if (won) r.wins++;
  r.best = Math.max(r.best, Math.floor(minute));
  all[mode] = r;
  try { localStorage.setItem(REC_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

export const MODES: { id: ModeId; name: string; line: string }[] = [
  { id: 'upkeep', name: 'UPKEEP', line: 'PAY DOPA EVERY FEW MOVES' },
  { id: 'quota', name: 'QUOTA', line: 'HAVE ENOUGH DOPA EVERY FEW MOVES' },
  { id: 'clock', name: 'CLOCK', line: 'DOPA DRAINS IN REAL TIME' },
];

/* ── game ───────────────────────────────────────────────────────────── */

export class Game extends Emitter<Events> {
  s!: GameState;
  private rng: () => number = Math.random;
  /** uid of the post the UI is currently showing (ads only tick while seen) */
  viewing = -1;

  constructor() {
    super();
    this.start('upkeep');
    this.s.phase = 'menu';
  }

  start(mode: ModeId, seed: string = randomSeed()): void {
    this.rng = makeRng(seed);
    this.s = {
      mode, seed, phase: 'playing', paused: false,
      dopa: CFG.START_DOPA, minute: 0, turn: 0, level: 0,
      feed: [], index: 0, effects: [], notif: null, website: null,
      postsSinceAd: 0, uid: 1,
      stats: { actions: 0, liked: 0, disliked: 0, saved: 0, blocked: 0, ads: 0, peak: CFG.START_DOPA },
      deathMsg: '',
    };
    // the first post is always the tutorial one: ↑+1 ↓+1 ←×2 →+1, save +2↑
    this.s.feed.push(this.makePost(POST_TYPES[0], TUTORIAL));
    this.emit('notif', null);
    this.emit('website', null);
    this.emit('effects', undefined);
    this.emit('phase', 'playing');
  }

  current(): Post { return this.s.feed[this.s.index]; }
  get clockMode(): boolean { return this.s.mode === 'clock'; }

  /* ── feed ── */

  private makePost(type: PostType, template?: string, ad?: 'normal' | 'premium'): Post {
    const t = parseTemplate(template ?? type.templates[Math.floor(this.rng() * type.templates.length)]);
    const secs = ad === 'premium' ? CFG.PREMIUM_SECS : Math.round(CFG.AD_SECS_MIN + this.rng() * Math.max(0, CFG.AD_SECS_MAX - CFG.AD_SECS_MIN));
    return {
      uid: this.s.uid++, type, handle: `@user${Math.floor(this.rng() * 9000 + 1000)}`, art: Math.floor(this.rng() * 1e9),
      acts: t.acts, save: t.save, block: t.block, report: t.report,
      ad: ad ? { premium: ad === 'premium', left: secs, tries: 0, done: false } : null,
      reacted: '', saved: false, blocked: false, leaves: { up: 0, down: 0 },
    };
  }

  private spawn(): Post {
    const s = this.s;
    s.postsSinceAd++;
    const due = s.postsSinceAd >= CFG.AD_EVERY + 2 || (s.postsSinceAd >= CFG.AD_EVERY && this.rng() < 0.5);
    if (due) {
      s.postsSinceAd = 0;
      return this.rng() < CFG.PREMIUM_CHANCE ? this.makePost(PREMIUM_TYPE, undefined, 'premium') : this.makePost(AD_TYPE, undefined, 'normal');
    }
    return this.makePost(weightedPick(POST_TYPES, (t) => t.weight, this.rng()) ?? POST_TYPES[0]);
  }

  private forwardIndex(): number {
    const s = this.s;
    for (let i = s.index + 1; i < s.feed.length; i++) if (!s.feed[i].blocked) return i;
    s.feed.push(this.spawn());
    return s.feed.length - 1;
  }

  backIndex(): number | null {
    for (let i = this.s.index - 1; i >= 0; i--) if (!this.s.feed[i].blocked) return i;
    return null;
  }

  /* ── rules ── */

  /** null = allowed, otherwise a SHORT reason (shown in caps on the card) */
  blockReason(p: Post, a: Action): string | null {
    const s = this.s;
    if (p.ad && !p.ad.done) return 'AD';
    if (a === 'down' && this.backIndex() === null) return 'NOTHING BEHIND';
    if ((a === 'left' || a === 'right') && p.reacted) return p.reacted.toUpperCase();
    if (a === 'save') {
      if (!p.save) return 'NOTHING TO SAVE';
      if (p.saved) return 'SAVED';
      if (s.effects.length >= CFG.SAVE_SLOTS) return 'SLOTS FULL';
    }
    return null;
  }

  private opFor(p: Post, a: Action): Op | null {
    if (a === 'save') return null;
    if (a === 'block') return p.block;
    if (a === 'report') return p.report;
    return p.acts[a];
  }

  /**
   * THE SCORING PIPELINE. roll=false for previews: coin-flip ops return NaN
   * (the UI shows the op itself instead of a number).
   */
  compute(p: Post, a: Action, roll: boolean): Result {
    const s = this.s;
    let op = this.opFor(p, a);
    const steps: TallyStep[] = [];
    if (!op) return { total: 0, steps };
    if (op.alt) {
      if (!roll) return { total: NaN, steps };
      op = this.rng() < 0.5 ? { k: op.k, n: op.n } : op.alt;
    }
    let v = applyOp(s.dopa, op) - s.dopa;
    steps.push({ text: opText(op), cls: OP_CLS[op.k], after: v });

    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
      const dir: Dir = a;
      for (const e of s.effects) {
        for (const m of e.mods) {
          if (m.dir !== 'all' && m.dir !== dir) continue;
          v = m.k === '+' ? v + m.n : v * m.n;
          steps.push({ text: modText(m), cls: modCls(m), after: v, effect: e.uid });
        }
      }
      if ((dir === 'up' || dir === 'down') && v > 0) {
        const f = Math.max(0, 1 - CFG.REPEAT_DECAY_STEP * p.leaves[dir]);
        if (f < 1) {
          v *= f;
          steps.push({ text: `×${fmt(f)} REPEAT`, cls: 'c-dim', after: v });
        }
      }
    }
    return { total: round2(v), steps };
  }

  act(a: Action): boolean {
    const s = this.s;
    if (s.phase !== 'playing' || s.paused) return false;
    const p = this.current();

    if (p.ad && !p.ad.done) { this.adTry(p); return false; }
    const reason = this.blockReason(p, a);
    if (reason) {
      this.changeDopa(-CFG.BAD_MOVE_PENALTY);
      this.emit('denied', { action: a, reason });
      this.checkEnd();
      return false;
    }

    const result = this.compute(p, a, true);
    this.changeDopa(result.total);

    switch (a) {
      case 'up': case 'down': p.leaves[a]++; break;
      case 'left': p.reacted = 'disliked'; s.stats.disliked++; break;
      case 'right': p.reacted = 'liked'; s.stats.liked++; break;
      case 'save':
        p.saved = true; s.stats.saved++;
        s.effects.push({ uid: s.uid++, mods: p.save ?? [], color: p.type.color });
        this.emit('effects', undefined);
        break;
      case 'block': case 'report': p.blocked = true; s.stats.blocked++; break;
    }
    if (p.ad) s.stats.ads++;

    s.index = a === 'down' ? this.backIndex() ?? s.index : this.forwardIndex();
    const check = this.tickTurn();
    this.emit('acted', { action: a, from: p, to: this.current(), result, check });
    if (!s.notif && this.rng() < CFG.NOTIF_CHANCE) this.spawnNotif();
    this.checkEnd();
    return true;
  }

  private changeDopa(d: number): void {
    this.s.dopa += d;
    this.s.stats.peak = Math.max(this.s.stats.peak, this.s.dopa);
  }

  addDopa(d: number, label: string): void {
    if (!d) return;
    this.changeDopa(d);
    this.emit('float', { amount: d, label });
    this.checkEnd();
  }

  /* ── modes ── */

  private tickTurn(): Check | null {
    const s = this.s;
    s.turn++;
    s.stats.actions++;
    if (this.clockMode) return null;
    s.minute += CFG.MIN_PER_TURN;
    const every = s.mode === 'upkeep' ? CFG.UPKEEP_EVERY : CFG.QUOTA_EVERY;
    if (s.turn % every !== 0) return null;
    const amount = this.checkAmount();
    s.level++;
    if (s.mode === 'upkeep') {
      this.changeDopa(-amount);
      const ok = s.dopa > CFG.SLEEP_AT || CFG.GOD_MODE;
      if (!ok) s.deathMsg = "COULDN'T PAY UPKEEP";
      return { kind: 'upkeep', amount, ok };
    }
    const ok = s.dopa >= amount || CFG.GOD_MODE;
    if (!ok) { s.deathMsg = 'MISSED THE QUOTA'; this.sleep(); }
    return { kind: 'quota', amount, ok };
  }

  private checkAmount(): number {
    const s = this.s;
    return s.mode === 'upkeep'
      ? Math.round(CFG.UPKEEP_BASE * Math.pow(CFG.UPKEEP_GROWTH, s.level))
      : Math.round(CFG.QUOTA_BASE * Math.pow(CFG.QUOTA_GROWTH, s.level));
  }

  /** next checkpoint for the HUD. in = actions left */
  nextCheck(): { kind: 'upkeep' | 'quota'; amount: number; in: number } | null {
    const s = this.s;
    if (s.mode === 'clock') return null;
    const every = s.mode === 'upkeep' ? CFG.UPKEEP_EVERY : CFG.QUOTA_EVERY;
    return { kind: s.mode, amount: this.checkAmount(), in: every - (s.turn % every) };
  }

  drainRate(): number {
    const hour = Math.floor(this.s.minute / 60);
    let r = 0;
    if (this.clockMode) {
      r = CFG.CLOCK_DRAIN * (1 + CFG.CLOCK_DRAIN_GROWTH * hour);
      if (this.s.dopa > 0) r += this.s.dopa * CFG.CLOCK_TOLERANCE; // the bigger the bank, the faster it leaks
    }
    if (this.s.phase === 'website') r += CFG.WEBSITE_DRAIN;
    return r;
  }

  /** real-time part: clock drain, ad timers, notifications, website drain */
  update(dt: number): void {
    const s = this.s;
    if (s.paused || (s.phase !== 'playing' && s.phase !== 'website')) return;
    if (this.clockMode) s.minute += dt / CFG.CLOCK_SEC_PER_MIN;
    const drain = this.drainRate();
    if (drain) this.changeDopa(-drain * dt);

    const p = this.current();
    if (s.phase === 'playing' && p.ad && !p.ad.done && this.viewing === p.uid) {
      p.ad.left -= dt;
      if (p.ad.left <= 0) { p.ad.done = true; this.emit('adDone', p); }
    }
    if (s.notif) {
      s.notif.left -= dt;
      if (s.notif.left <= 0) this.resolveNotif('wait');
    }
    this.checkEnd();
  }

  private checkEnd(): void {
    const s = this.s;
    if (s.phase === 'over' || s.phase === 'won' || s.phase === 'menu') return;
    // sleep is checked BEFORE the win: the last upkeep at 08:00 can still kill you
    if (!CFG.GOD_MODE && s.dopa <= CFG.SLEEP_AT) {
      if (!s.deathMsg) s.deathMsg = 'OUT OF DOPA';
      this.sleep();
      return;
    }
    if (s.minute >= CFG.WIN_HOUR * 60) {
      s.minute = CFG.WIN_HOUR * 60;
      saveRecord(s.mode, s.minute, true);
      this.setPhase('won');
    }
  }

  private sleep(): void {
    const s = this.s;
    if (s.phase === 'over') return;
    s.notif = null;
    s.website = null;
    this.emit('notif', null);
    this.emit('website', null);
    saveRecord(s.mode, s.minute, false);
    this.setPhase('over');
  }

  private setPhase(p: Phase): void {
    this.s.phase = p;
    this.emit('phase', p);
  }

  /* ── ads + website trap ── */

  private adTry(p: Post): void {
    if (!p.ad) return;
    if (p.ad.premium) { this.openWebsite(p); return; }
    p.ad.tries++;
    const cost = p.ad.tries * CFG.AD_TRY_COST;
    p.ad.left += CFG.AD_TRY_ADD_SECS;
    this.changeDopa(-cost);
    this.emit('adTry', { cost, add: CFG.AD_TRY_ADD_SECS });
    this.checkEnd();
  }

  /** skip cost of the NEXT attempt (shown on the ad) */
  adNextCost(p: Post): number {
    return p.ad ? (p.ad.tries + 1) * CFG.AD_TRY_COST : 0;
  }

  private randPos(): Pick<Website, 'x' | 'y' | 'dx' | 'dy'> {
    return { x: 4 + this.rng() * 52, y: 28 + this.rng() * 45, dx: 4 + this.rng() * 42, dy: 30 + this.rng() * 50 };
  }

  private openWebsite(post: Post | null): void {
    const s = this.s;
    s.website = { post: post as Post, popups: CFG.WEBSITE_POPUPS, ...this.randPos() };
    this.setPhase('website');
    this.emit('website', s.website);
  }

  /** real = the actual X, false = the decoy */
  websiteTap(real: boolean): void {
    const w = this.s.website;
    if (!w) return;
    if (real) {
      w.popups--;
      if (w.popups <= 0) { this.closeWebsite(); return; }
    } else {
      this.addDopa(-2, 'MALWARE');
      w.popups = Math.min(8, w.popups + 1);
    }
    Object.assign(w, this.randPos());
    this.emit('website', w);
  }

  private closeWebsite(): void {
    const s = this.s;
    const w = s.website;
    s.website = null;
    this.setPhase('playing');
    this.emit('website', null);
    if (!w?.post) return; // came from a notification: back where you were
    if (w.post.ad) w.post.ad.done = true;
    s.index = this.forwardIndex();
    this.emit('acted', { action: 'up', from: w.post, to: this.current(), result: { total: 0, steps: [] }, check: null });
  }

  /* ── notifications ── */

  private spawnNotif(): void {
    const def = weightedPick(NOTIFS, (n) => n.weight ?? 10, this.rng());
    if (!def) return;
    this.s.notif = { uid: this.s.uid++, def, left: CFG.NOTIF_SECS };
    this.emit('notif', this.s.notif);
  }

  resolveNotif(kind: 'tap' | 'swipe' | 'wait'): void {
    const s = this.s;
    const n = s.notif;
    if (!n || (s.phase !== 'playing' && s.phase !== 'website')) return;
    s.notif = null;
    this.emit('notif', null);
    const o = n.def[kind];
    if (o.special === 'website') { if (s.phase === 'playing') this.openWebsite(null); return; }
    if (o.special === 'gift') { this.gift(); return; }
    if (o.op) {
      let op = o.op;
      if (op.alt) op = this.rng() < 0.5 ? { k: op.k, n: op.n } : op.alt;
      this.addDopa(applyOp(s.dopa, op) - s.dopa, n.def.from);
    }
  }

  /* ── saved effects ── */

  gift(): void {
    const s = this.s;
    if (s.effects.length >= CFG.SAVE_SLOTS) { this.emit('toast', 'SLOTS FULL'); return; }
    const mod = parseMod(GIFTS[Math.floor(this.rng() * GIFTS.length)]);
    s.effects.push({ uid: s.uid++, mods: [mod], color: '#ffffff' });
    this.emit('effects', undefined);
    this.emit('toast', `GIFT ${modText(mod)}`);
  }

  removeEffect(uid: number): void {
    this.s.effects = this.s.effects.filter((e) => e.uid !== uid);
    this.emit('effects', undefined);
  }

  moveEffect(uid: number, d: number): void {
    const l = this.s.effects;
    const i = l.findIndex((e) => e.uid === uid);
    const j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.emit('effects', undefined);
  }

  /* ── debug ── */

  debugAd(premium: boolean): void {
    const p = this.makePost(premium ? PREMIUM_TYPE : AD_TYPE, undefined, premium ? 'premium' : 'normal');
    this.s.feed.splice(this.s.index + 1, 0, p);
    this.emit('toast', 'AD NEXT');
  }
  debugNotif(): void { if (!this.s.notif) this.spawnNotif(); }
}

