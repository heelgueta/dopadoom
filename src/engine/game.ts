/**
 * GAME v3 — state + rules, no DOM.
 *
 *   ↑ skip · ↓ back · ← dislike · → like      → base stat ± points
 *        (saved effects modify it left → right, repeat ↑/↓ decays)
 *   ← / → again:  same reaction = +0 · opposite reaction = dopa × REREACT_MULT
 *        (either way you move on)
 *   SAVE     adds the post's effect to your chips. no points. you STAY.
 *   REPORT   dopa × post.report, post removed, next
 *   BLOCK    dopa × post.block,  post removed, next
 *   ads      unskippable while the timer runs. real: pay + wait longer,
 *            scam: website trap, game: playable-ad trap
 *   CAPTCH   tap the tiles in order to get through
 *
 * MODES: clock (real-time drain) · upkeep (pay every N moves) · quota (have N)
 */
import { CFG } from '../config';
import type {
  Action, AdKind, CaptchaState, Check, Dir, GameState, ModeId, Notif, Phase, Post, PostDef, Result, TallyStep, Trap,
} from '../types';
import { makeRng, randomSeed, round2, weightedPick } from '../util';
import { applyTransform, MODIFIERS, NOTIFS, POSTS, resolveSave, roll, rollSave, scaleSave } from './data';
import { modText, modValueCls, multCls, multText, signCls, signedText } from './ops';

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
  adTry: { cost: number };
  float: { amount: number; label: string };
  toast: string;
  notif: Notif | null;
  trap: Trap | null;
  phase: Phase;
  effects: undefined;
  refresh: undefined;
}

type Handler<T> = (p: T) => void;
class Emitter<E> {
  private h: { [K in keyof E]?: Handler<E[K]>[] } = {};
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): void { (this.h[k] ??= []).push(fn); }
  protected emit<K extends keyof E>(k: K, p: E[K]): void { this.h[k]?.forEach((f) => f(p)); }
}

/* ── records ────────────────────────────────────────────────────────── */

export interface Rec { runs: number; wins: number; best: number }
const REC_KEY = 'dopadoom3.records';
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
  { id: 'clock', name: 'CLOCK', line: 'DOPA DRAINS IN REAL TIME' },
  { id: 'upkeep', name: 'UPKEEP', line: 'PAY DOPA EVERY FEW MOVES' },
  { id: 'quota', name: 'QUOTA', line: 'HAVE ENOUGH DOPA EVERY FEW MOVES' },
];

/* ── game ───────────────────────────────────────────────────────────── */

export class Game extends Emitter<Events> {
  s!: GameState;
  private rng: () => number = Math.random;
  /** uid of the post the UI is showing (ad timers only tick while it's seen) */
  viewing = -1;

  constructor() {
    super();
    this.start('clock');
    this.s.phase = 'menu';
  }

  start(mode: ModeId, seed: string = randomSeed()): void {
    this.rng = makeRng(seed);
    this.s = {
      mode, seed, phase: 'playing', paused: false,
      dopa: CFG.START_DOPA, minute: 0, turn: 0, level: 0,
      feed: [], index: 0, effects: [], notif: null, trap: null, uid: 1,
      stats: { moves: 0, liked: 0, disliked: 0, saved: 0, blocked: 0, reported: 0, peak: CFG.START_DOPA },
      deathMsg: '',
    };
    // always open on a plain CUTE
    const first = POSTS.find((p) => p.name === 'CUTE') ?? POSTS[0];
    this.s.feed.push(this.makePost(first, false));
    this.emit('notif', null);
    this.emit('trap', null);
    this.emit('effects', undefined);
    this.emit('phase', 'playing');
  }

  current(): Post { return this.s.feed[this.s.index]; }
  hour(): number { return Math.floor(this.s.minute / 60); }
  get clockMode(): boolean { return this.s.mode === 'clock'; }

  /* ── feed ── */

  private makePost(def: PostDef, modify = true): Post {
    const r = this.rng;
    const stats = {
      up: roll(def.stats.up, r), down: roll(def.stats.down, r), left: roll(def.stats.left, r), right: roll(def.stats.right, r),
    };
    let save = resolveSave(def.save, r);
    let report = def.report;
    let block = def.block;
    let name = def.name;

    if (modify && def.kind !== 'special') {
      const hour = this.hour();
      const variants = MODIFIERS.filter((m) => m.group === 'variant' && m.minHour <= hour && (!m.appliesTo || m.appliesTo === def.kind));
      const mults = MODIFIERS.filter((m) => m.group === 'mult' && m.minHour <= hour);
      const chosen = [];
      if (variants.length && r() < CFG.VARIANT_CHANCE) chosen.push(weightedPick(variants, (m) => m.weight, r()));
      if (mults.length && r() < CFG.MULT_CHANCE) chosen.push(weightedPick(mults, (m) => m.weight, r()));
      for (const m of chosen) {
        if (!m) continue;
        name += m.name;
        for (const d of Object.keys(m.stats) as Dir[]) stats[d] = applyTransform(stats[d], m.stats[d]!);
        if (save && m.save !== undefined) save = scaleSave(save, m.save);
        if (m.report !== undefined) report = m.report;
        if (m.block !== undefined) block = m.block;
      }
    }

    const secs = Math.round(CFG.AD_SECS_MIN + r() * Math.max(0, CFG.AD_SECS_MAX - CFG.AD_SECS_MIN));
    return {
      uid: this.s.uid++, name, def, stats, save, report, block,
      ad: def.ad ? { kind: def.ad, left: secs, tries: 0, done: false } : null,
      captcha: def.special === 'captcha' ? this.newCaptcha() : null,
      reacted: '', saved: false, blocked: false, leaves: { up: 0, down: 0 },
    };
  }

  private newCaptcha(): CaptchaState {
    const tiles = Array.from({ length: CFG.CAPTCHA_TILES }, (_, i) => i + 1);
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return { tiles, next: 1 };
  }

  private spawn(): Post {
    const hour = this.hour();
    const pool = POSTS.filter((p) => p.minHour <= hour);
    return this.makePost(weightedPick(pool, (p) => p.weight, this.rng()) ?? POSTS[0]);
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

  /** null = allowed, else a short reason */
  blockReason(p: Post, a: Action): string | null {
    if (p.captcha) return 'CAPTCHA';
    if (p.ad && !p.ad.done) return 'AD';
    if (a === 'down' && this.backIndex() === null) return 'NOTHING BEHIND';
    if (a === 'save') {
      if (!p.save) return 'NOTHING TO SAVE';
      if (p.saved) return 'SAVED';
      if (this.s.effects.length >= CFG.SAVE_SLOTS) return 'SLOTS FULL';
    }
    return null;
  }

  /** swipe scoring: base stat → saved effects L→R → repeat decay */
  private swipeResult(p: Post, d: Dir): Result {
    let v = p.stats[d];
    const steps: TallyStep[] = [{ text: signedText(v), cls: signCls(v), after: v }];
    for (const e of this.s.effects) {
      for (const m of e.mods) {
        if (!m.dirs.includes(d)) continue;
        v = m.k === '+' ? v + m.n : v * m.n;
        steps.push({ text: modText(m), cls: modValueCls(m.k, m.n), after: v, effect: e.uid, mod: m });
      }
    }
    if ((d === 'up' || d === 'down') && v > 0) {
      const f = Math.max(0, 1 - CFG.REPEAT_DECAY_STEP * p.leaves[d]);
      if (f < 1) {
        v *= f;
        steps.push({ text: `${multText(f)} REPEAT`, cls: 'c-dim', after: v });
      }
    }
    return { total: round2(v), steps };
  }

  private multResult(f: number, tag: string): Result {
    const total = round2(this.s.dopa * (f - 1));
    return { total, tag, steps: [{ text: `DOPA ${multText(f)}`, cls: multCls(f), after: total }] };
  }

  act(a: Action): boolean {
    const s = this.s;
    if (s.phase !== 'playing' || s.paused) return false;
    const p = this.current();

    // unskippable ad: swipes and save count as skip attempts (⋮ is disabled while it plays)
    if (p.ad && !p.ad.done) { this.adTry(p); return false; }
    const reason = this.blockReason(p, a);
    if (reason) {
      this.changeDopa(-CFG.BAD_MOVE_PENALTY);
      this.emit('denied', { action: a, reason });
      this.checkEnd();
      return false;
    }

    let result: Result;
    let move: 'next' | 'back' | 'stay' = 'next';
    switch (a) {
      case 'up':
      case 'down':
        result = this.swipeResult(p, a);
        p.leaves[a]++;
        if (a === 'down') move = 'back';
        break;
      case 'left':
      case 'right': {
        const want = a === 'right' ? 'liked' : 'disliked';
        if (p.reacted === want) {
          result = { total: 0, tag: 'SAME', steps: [{ text: 'SAME', cls: 'c-dim', after: 0 }] };
        } else if (p.reacted) {
          result = this.multResult(CFG.REREACT_MULT, 'FLIP');
          p.reacted = want;
        } else {
          result = this.swipeResult(p, a);
          p.reacted = want;
          if (a === 'right') s.stats.liked++; else s.stats.disliked++;
        }
        break;
      }
      case 'save': {
        const mods = rollSave(p.save ?? [], this.rng);
        s.effects.push({ uid: s.uid++, mods, from: p.name });
        p.saved = true;
        s.stats.saved++;
        this.emit('effects', undefined);
        result = { total: 0, tag: 'SAVED', steps: [] };
        move = 'stay';
        break;
      }
      case 'report':
        result = this.multResult(p.report, 'REPORTED');
        p.blocked = true;
        s.stats.reported++;
        break;
      case 'block':
        result = this.multResult(p.block, 'BLOCKED');
        p.blocked = true;
        s.stats.blocked++;
        break;
    }

    this.changeDopa(result.total);
    if (move === 'back') s.index = this.backIndex() ?? s.index;
    else if (move === 'next') s.index = this.forwardIndex();
    const check = this.tickTurn();
    this.emit('acted', { action: a, from: p, to: this.current(), result, check });
    if (!this.clockMode && !s.notif && this.rng() < CFG.NOTIF_CHANCE * 3) this.spawnNotif();
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

  /* ── captcha ── */

  captchaTap(label: number): void {
    const s = this.s;
    const p = this.current();
    const c = p.captcha;
    if (!c || s.phase !== 'playing' || s.paused) return;
    if (label === c.next) {
      c.next++;
      if (c.next > c.tiles.length) {
        p.captcha = null;
        s.index = this.forwardIndex();
        const check = this.tickTurn();
        this.emit('acted', { action: 'up', from: p, to: this.current(), result: { total: 0, tag: 'HUMAN', steps: [] }, check });
        this.checkEnd();
        return;
      }
    } else {
      this.addDopa(-CFG.BAD_MOVE_PENALTY, 'CAPTCHA');
      p.captcha = this.newCaptcha();
    }
    this.emit('refresh', undefined);
  }

  /* ── modes ── */

  private tickTurn(): Check | null {
    const s = this.s;
    s.turn++;
    s.stats.moves++;
    if (this.clockMode) return null;
    s.minute += CFG.MIN_PER_TURN;
    // tolerance: a big bank leaks every move (keeps × multipliers from compounding forever)
    if (s.dopa > 0) this.changeDopa(-s.dopa * CFG.TURN_TOLERANCE);
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

  nextCheck(): { kind: 'upkeep' | 'quota'; amount: number; in: number } | null {
    const s = this.s;
    if (s.mode === 'clock') return null;
    const every = s.mode === 'upkeep' ? CFG.UPKEEP_EVERY : CFG.QUOTA_EVERY;
    return { kind: s.mode, amount: this.checkAmount(), in: every - (s.turn % every) };
  }

  drainRate(): number {
    const s = this.s;
    let r = 0;
    if (this.clockMode) {
      r = CFG.CLOCK_DRAIN * (1 + CFG.CLOCK_DRAIN_GROWTH * this.hour());
      if (s.dopa > 0) r += s.dopa * CFG.CLOCK_TOLERANCE;
    }
    if (s.phase === 'trap') r += CFG.TRAP_DRAIN;
    return r;
  }

  /** real-time part */
  update(dt: number): void {
    const s = this.s;
    if (s.paused || (s.phase !== 'playing' && s.phase !== 'trap')) return;
    if (this.clockMode) s.minute += dt / CFG.CLOCK_SEC_PER_MIN;
    const drain = this.drainRate();
    if (drain) this.changeDopa(-drain * dt);

    const p = this.current();
    if (s.phase === 'playing' && p.ad && !p.ad.done && this.viewing === p.uid) {
      p.ad.left -= dt;
      if (p.ad.left <= 0) { p.ad.done = true; this.emit('refresh', undefined); }
    }
    const t = s.trap;
    if (t?.kind === 'game') {
      // the playable-ad target bounces around
      t.x += t.vx * dt; t.y += t.vy * dt;
      if (t.x < 4 || t.x > 76) { t.vx *= -1; t.x = Math.max(4, Math.min(76, t.x)); }
      if (t.y < 30 || t.y > 80) { t.vy *= -1; t.y = Math.max(30, Math.min(80, t.y)); }
    }
    if (s.notif) {
      s.notif.left -= dt;
      if (s.notif.left <= 0) this.resolveNotif('wait');
    }
    if (this.clockMode && !s.notif && s.phase === 'playing' && this.rng() < CFG.NOTIF_CHANCE * dt) this.spawnNotif();
    this.checkEnd();
  }

  private checkEnd(): void {
    const s = this.s;
    if (s.phase === 'over' || s.phase === 'won' || s.phase === 'menu') return;
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
    s.trap = null;
    this.emit('notif', null);
    this.emit('trap', null);
    saveRecord(s.mode, s.minute, false);
    this.setPhase('over');
  }

  private setPhase(p: Phase): void {
    this.s.phase = p;
    this.emit('phase', p);
  }

  /* ── ads + traps ── */

  private adTry(p: Post): void {
    const ad = p.ad;
    if (!ad) return;
    if (ad.kind === 'scam' || ad.kind === 'game') { this.openTrap(p, ad.kind === 'scam' ? 'website' : 'game'); return; }
    ad.tries++;
    const cost = ad.tries * CFG.AD_TRY_COST;
    ad.left += CFG.AD_TRY_ADD_SECS;
    this.changeDopa(-cost);
    this.emit('adTry', { cost });
    this.checkEnd();
  }

  adNextCost(p: Post): number {
    return p.ad ? (p.ad.tries + 1) * CFG.AD_TRY_COST : 0;
  }

  adKind(p: Post): AdKind | null {
    return p.ad && !p.ad.done ? p.ad.kind : null;
  }

  private placeTrap(t: Trap): void {
    const r = this.rng;
    t.x = 4 + r() * 60; t.y = 30 + r() * 45;
    t.dx = 4 + r() * 42; t.dy = 30 + r() * 50;
    const a = r() * Math.PI * 2;
    t.vx = Math.cos(a) * CFG.GAME_TARGET_SPEED; t.vy = Math.sin(a) * CFG.GAME_TARGET_SPEED;
  }

  private openTrap(post: Post, kind: Trap['kind']): void {
    const t: Trap = { kind, post, hits: CFG.TRAP_HITS, x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 };
    this.placeTrap(t);
    this.s.trap = t;
    this.setPhase('trap');
    this.emit('trap', t);
  }

  /** real = the actual target, false = the decoy */
  trapTap(real: boolean): void {
    const t = this.s.trap;
    if (!t || this.s.paused) return;
    if (real) {
      t.hits--;
      if (t.hits <= 0) { this.closeTrap(); return; }
    } else {
      this.addDopa(this.s.dopa * (CFG.TRAP_DECOY_MULT - 1), t.kind === 'game' ? 'INSTALLED' : 'MALWARE');
      t.hits = Math.min(8, t.hits + 1);
    }
    this.placeTrap(t);
    this.emit('trap', t);
  }

  private closeTrap(): void {
    const s = this.s;
    const t = s.trap;
    s.trap = null;
    this.setPhase('playing');
    this.emit('trap', null);
    if (!t) return;
    if (t.post.ad) t.post.ad.done = true;
    s.index = this.forwardIndex();
    this.emit('acted', { action: 'up', from: t.post, to: this.current(), result: { total: 0, tag: 'ESCAPED', steps: [] }, check: null });
  }

  /* ── notifications ── */

  private spawnNotif(): void {
    const def = weightedPick(NOTIFS, (n) => n.weight, this.rng());
    if (!def) return;
    this.s.notif = { uid: this.s.uid++, def, left: CFG.NOTIF_SECS };
    this.emit('notif', this.s.notif);
  }

  resolveNotif(kind: 'tap' | 'swipe' | 'wait'): void {
    const s = this.s;
    const n = s.notif;
    if (!n || (s.phase !== 'playing' && s.phase !== 'trap')) return;
    s.notif = null;
    this.emit('notif', null);
    const f = n.def[kind];
    this.addDopa(s.dopa * (f - 1), `${n.def.name} ${kind.toUpperCase()}`);
  }

  /* ── saved effects ── */

  removeEffect(uid: number): void {
    this.s.effects = this.s.effects.filter((e) => e.uid !== uid);
    this.emit('effects', undefined);
  }

  moveEffectTo(uid: number, to: number): void {
    const l = this.s.effects;
    const i = l.findIndex((e) => e.uid === uid);
    if (i < 0) return;
    const [e] = l.splice(i, 1);
    l.splice(Math.max(0, Math.min(l.length, to)), 0, e);
    this.emit('effects', undefined);
  }

  /* ── debug ── */

  debugPost(name: string): void {
    const def = POSTS.find((p) => p.name === name);
    if (!def) return;
    this.s.feed.splice(this.s.index + 1, 0, this.makePost(def));
    this.emit('toast', `${name} NEXT`);
  }
  debugNotif(): void { if (!this.s.notif) this.spawnNotif(); }
  debugHour(): void {
    this.s.minute = (this.hour() + 1) * 60;
    this.emit('toast', `HOUR ${this.hour()}`);
  }
}
