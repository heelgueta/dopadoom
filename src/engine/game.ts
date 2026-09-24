/**
 * GAME — owns the state and every rule that mutates it. No DOM in here.
 * The UI calls swipe()/update()/choose()… and listens to events to animate.
 *
 * Flow of a swipe:
 *   UI gesture → game.swipe(physicalDir)
 *     → mapDir (Mirror World boss swaps ←→)
 *     → blockReason?  → deny: penalty + 'denied' event
 *     → premium ad ↑  → website trap
 *     → computeGain (engine/scoring.ts) → dopa
 *     → move through the feed (forward / back / reject / save)
 *     → action.then() side effects
 *     → 'swiped' event → UI animates old card out, new card in
 */
import { CFG } from '../config';
import { BOSSES, SUNRISE } from '../content/bosses';
import { CARD_BY_ID, INTRO, POOL } from '../content/cards';
import { CHOICES } from '../content/choices';
import { EFFECTS } from '../content/effects';
import { NOTIFS } from '../content/notifications';
import type {
  ActiveNotif, CardDef, CardInstance, Dir, EffectInstance, GainCtx, GainResult, GameApi, GameState, Modifier,
  Phase, Tone, WebsiteState,
} from '../types';
import { bigNum, makeRng, randomSeed, weightedPick } from '../util';
import { actionOf, computeGain } from './scoring';

/* ── tiny typed event emitter ───────────────────────────────────────── */

export interface SwipeEvent {
  /** physical direction (for animation) */
  dir: Dir;
  /** what it meant after boss remaps */
  meaning: Dir;
  from: CardInstance;
  to: CardInstance;
  result: GainResult;
  forced: boolean;
}

export interface GameEvents {
  swiped: SwipeEvent;
  denied: { dir: Dir; reason: string };
  toast: { msg: string; tone: Tone };
  float: { amount: number; label: string };
  gain: GainResult;
  phase: Phase;
  boss: boolean;
  notif: ActiveNotif | null;
  effects: undefined;
  website: WebsiteState | null;
  adDone: CardInstance;
  /** current card must be re-rendered without animation */
  refresh: undefined;
  reset: undefined;
}

type Handler<T> = (p: T) => void;

class Emitter<E> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): void {
    (this.handlers[k] ??= []).push(fn);
  }
  protected emit<K extends keyof E>(k: K, p: E[K]): void {
    this.handlers[k]?.forEach((f) => f(p));
  }
}

/* ── records (localStorage) ─────────────────────────────────────────── */

export interface Records {
  runs: number;
  wins: number;
  bestMinute: number;
}
const REC_KEY = 'dopadoom.records.v1';
export function loadRecords(): Records {
  try {
    return { runs: 0, wins: 0, bestMinute: 0, ...JSON.parse(localStorage.getItem(REC_KEY) ?? '{}') };
  } catch {
    return { runs: 0, wins: 0, bestMinute: 0 };
  }
}
function saveRecords(r: Records): void {
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

const SLEEP_LINES = [
  'your phone fell on your face.',
  'the algorithm tucked you in.',
  'you blinked for too long.',
  'autoplay kept going without you.',
  'you dreamt of reels.',
];
const SITES = ['w1n-fr33-r0lex.biz', 'your-prize.claim.now', 'hot-singles-near.you', 'metaland.shop/?ref=wolf', 'totally-not-a-scam.io'];
const HEADLINES = ['CONGRATULATIONS!! YOU ARE THE 1,000,000th SCROLLER', 'YOUR PHONE HAS 37 VIRUSES', 'ONE WEIRD TRICK TO NEVER SLEEP AGAIN', 'CLAIM YOUR FREE WOLF WATCH'];

/* ── the game ───────────────────────────────────────────────────────── */

export class Game extends Emitter<GameEvents> implements GameApi {
  s!: GameState;
  cfg = CFG;
  private rng: () => number = Math.random;
  private introQueue: CardDef[] = [];

  constructor(seed?: string) {
    super();
    this.reset(seed);
  }

  reset(seed: string = randomSeed()): void {
    const c = this.cfg;
    this.rng = makeRng(seed);
    this.s = {
      seed, phase: 'playing', paused: false, started: false,
      dopa: c.START_DOPA, minute: 0, hour: 0,
      feed: [], index: 0, barrier: 0,
      saved: [], slots: c.SAVED_SLOTS, mods: [],
      boss: null, bossActive: false, endless: false,
      notif: null, website: null, choices: [],
      blockedBrands: [], seenUnique: [], streak: 0, swipesThisHour: 0,
      stats: {
        swipes: 0, cardsSeen: 0, rejected: 0, saved: 0, denied: 0,
        peakDopa: c.START_DOPA, lowDopa: c.START_DOPA, gained: 0, lost: 0,
        adsWatched: 0, websites: 0, notifs: 0,
      },
      deathMsg: '', uid: 1,
    };
    this.introQueue = c.INTRO_CARDS ? [...INTRO] : [INTRO[0]];
    this.s.feed.push(this.makeCard(this.nextDef()));
    this.enter(this.s.feed[0]);
    this.rollBoss();
    this.emit('reset', undefined);
  }

  /* ── GameApi basics ── */

  rand(): number { return this.rng(); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.rng() * arr.length)]; }
  hourNow(): number { return this.s.hour; }
  current(): CardInstance { return this.s.feed[this.s.index]; }
  toast(msg: string, tone: Tone = 'neutral'): void { this.emit('toast', { msg, tone }); }

  addDopa(amount: number, label: string): void {
    if (!amount) return;
    this.changeDopa(amount);
    this.emit('float', { amount, label });
    this.checkSleep();
  }

  private changeDopa(amount: number): void {
    const s = this.s;
    s.dopa += amount;
    if (amount > 0) s.stats.gained += amount; else s.stats.lost -= amount;
    s.stats.peakDopa = Math.max(s.stats.peakDopa, s.dopa);
    s.stats.lowDopa = Math.min(s.stats.lowDopa, s.dopa);
  }

  addMod(m: Modifier): void {
    this.s.mods = this.s.mods.filter((x) => x.id !== m.id);
    this.s.mods.push(m);
    this.emit('effects', undefined);
  }

  skipMinutes(n: number): void {
    const s = this.s;
    const cap = (s.hour + 1) * 60 - 0.01; // never skip across an hour boundary
    const to = Math.min(cap, s.minute + n);
    this.changeDopa(-this.drainRate() * (to - s.minute));
    s.minute = to;
    this.toast(`⏭ lost ${n} minutes`);
  }

  /* ── feed ── */

  private makeCard(def: CardDef): CardInstance {
    return {
      uid: this.s.uid++, def, rejected: false, saved: false,
      leaves: { up: 0, down: 0, left: 0, right: 0 },
      adWatched: 0, adDone: false,
      likes: bigNum(this.rng()), comments: bigNum(this.rng() * 0.7),
      data: {},
    };
  }

  /** which card spawns next: intro first, then weighted pool filtered by hour/boss */
  private nextDef(): CardDef {
    const first = this.introQueue.shift();
    if (first) return first;
    const s = this.s;
    const boss = s.bossActive ? s.boss : null;
    const recent = s.feed.slice(-4).map((c) => c.def.id);
    const base = POOL.filter(
      (d) =>
        (d.minHour ?? 0) <= s.hour &&
        (d.maxHour ?? 99) >= s.hour &&
        !(d.unique && s.seenUnique.includes(d.id)) &&
        !(d.brand && s.blockedBrands.includes(d.brand)) &&
        !recent.includes(d.id),
    );
    const forceAd = !!boss?.adEvery && s.feed.length % boss.adEvery === 0;
    const ads = base.filter((d) => d.ad);
    const pool = forceAd && ads.length ? ads : base;
    const weight = (d: CardDef) =>
      (d.weight ?? 10) * (boss?.kindBias ? (boss.kindBias.includes(d.kind) ? 1 : 0.02) : 1);
    return weightedPick(pool, weight, this.rng()) ?? POOL[0];
  }

  private forwardIndex(): number {
    const s = this.s;
    for (let i = s.index + 1; i < s.feed.length; i++) if (!s.feed[i].rejected) return i;
    s.feed.push(this.makeCard(this.nextDef()));
    return s.feed.length - 1;
  }

  backIndex(): number | null {
    const s = this.s;
    for (let i = s.index - 1; i >= s.barrier; i--) if (!s.feed[i].rejected) return i;
    return null;
  }

  private enter(card: CardInstance): void {
    if (card.data.entered) return;
    card.data.entered = 1;
    this.s.stats.cardsSeen++;
    if (card.def.unique) this.s.seenUnique.push(card.def.id);
    card.def.onEnter?.(this, card);
  }

  queueCard(defId: string): void {
    const def = CARD_BY_ID[defId];
    if (!def) return;
    this.s.feed.splice(this.s.index + 1, 0, this.makeCard(def));
  }

  burnBridges(): void {
    this.s.barrier = this.s.index;
    this.toast('🔥 bridges burned. no going back.', 'risky');
  }

  /* ── swipe rules ── */

  /** Mirror World boss swaps ← and → */
  mapDir(d: Dir): Dir {
    if (this.s.bossActive && this.s.boss?.swapLR) {
      if (d === 'left') return 'right';
      if (d === 'right') return 'left';
    }
    return d;
  }

  ctx(card: CardInstance, dir: Dir): GainCtx {
    return { s: this.s, g: this, card, dir };
  }

  /** null = allowed. otherwise the human reason it's disabled */
  blockReason(card: CardInstance, dir: Dir): string | null {
    const s = this.s;
    const boss = s.bossActive ? s.boss : null;
    if (boss?.blockDirs?.includes(dir)) return `${boss.icon} ${boss.name.toLowerCase()}`;
    const a = actionOf(card, dir);
    if (a.block) {
      const r = typeof a.block === 'string' ? a.block : a.block(this.ctx(card, dir));
      if (r) return r;
    }
    if (dir === 'down' && this.backIndex() === null) {
      if (s.index === 0) return 'nothing before the feed';
      if (s.barrier >= s.index) return 'bridges burned';
      return 'you rejected everything behind';
    }
    if (dir === 'right') {
      if (card.saved) return 'already saved';
      if (a.save && s.saved.length >= s.slots) return `saved list full (${s.slots}/${s.slots})`;
    }
    return null;
  }

  /** what would happen — used by the UI for edge labels and the drag stamp */
  preview(phys: Dir): { meaning: Dir; reason: string | null; result: GainResult; trap: boolean } {
    const card = this.current();
    const meaning = this.mapDir(phys);
    const reason = this.blockReason(card, meaning);
    const trap = meaning === 'up' && !!card.def.ad?.premium && !card.adDone;
    const result = reason ? { total: -this.cfg.BAD_SWIPE_PENALTY, steps: [] } : computeGain(this.s, this, card, meaning, this.cfg);
    return { meaning, reason, result, trap };
  }

  swipe(phys: Dir, forced = false): boolean {
    const s = this.s;
    if (s.phase !== 'playing') return false;
    const dir = this.mapDir(phys);
    const card = this.current();

    const reason = this.blockReason(card, dir);
    if (reason) {
      if (!forced) this.deny(phys, reason);
      return false;
    }
    if (dir === 'up' && card.def.ad?.premium && !card.adDone) {
      this.openWebsite(card);
      return false;
    }

    const a = actionOf(card, dir);
    const result = computeGain(s, this, card, dir, this.cfg);
    s.started = true;
    s.stats.swipes++;
    s.swipesThisHour++;
    s.streak = dir === 'up' ? s.streak + 1 : 0;
    card.leaves[dir]++;
    this.changeDopa(result.total);
    this.emit('gain', result);

    if (dir === 'right') {
      if (a.save) this.saveEffect(a.save);
      card.saved = true;
      s.stats.saved++;
    }
    const stays = dir === 'left' && a.keep;
    if (dir === 'left' && !stays) {
      card.rejected = true;
      s.stats.rejected++;
    }

    if (dir === 'down') s.index = this.backIndex() ?? s.index;
    else if (!stays) s.index = this.forwardIndex();
    const to = this.current();
    this.enter(to);
    a.then?.(this, card);

    this.emit('swiped', { dir: phys, meaning: dir, from: card, to, result, forced });
    this.checkSleep();
    return true;
  }

  private deny(dir: Dir, reason: string): void {
    this.s.stats.denied++;
    this.changeDopa(-this.cfg.BAD_SWIPE_PENALTY);
    this.emit('denied', { dir, reason });
    this.checkSleep();
  }

  /* ── saved effects ── */

  saveEffect(id: string): boolean {
    const def = EFFECTS[id];
    const s = this.s;
    if (!def) { console.warn(`[dopadoom] unknown effect ${id}`); return false; }
    if (s.saved.length >= s.slots) return false;
    const inst: EffectInstance = { uid: s.uid++, def, inverted: false, savedAt: s.minute, data: {} };
    def.init?.(this, inst);
    s.saved.push(inst);
    this.emit('effects', undefined);
    return true;
  }

  hasEffect(id: string): boolean {
    return this.s.saved.some((e) => e.def.id === id);
  }

  effectCost(e: EffectInstance): number {
    const c = e.def.removeCost;
    return Math.round((typeof c === 'function' ? c(this.s, e) : c) * 10) / 10;
  }

  removeEffect(uid: number, free = false): void {
    const s = this.s;
    const i = s.saved.findIndex((e) => e.uid === uid);
    if (i < 0) return;
    const e = s.saved[i];
    const cost = this.effectCost(e);
    s.saved.splice(i, 1);
    if (!free && cost !== 0) this.addDopa(-cost, `${e.def.icon} ${cost < 0 ? 'sold' : 'deleted'}`);
    e.def.onRemove?.(this, e);
    this.emit('effects', undefined);
  }

  moveEffect(uid: number, delta: number): void {
    const list = this.s.saved;
    const i = list.findIndex((e) => e.uid === uid);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.emit('effects', undefined);
  }

  invertEffects(): void {
    for (const e of this.s.saved) e.inverted = !e.inverted;
    this.toast('⇄ every saved effect inverted', 'risky');
    this.emit('effects', undefined);
  }

  /* ── time ── */

  hourMinute(): number { return this.s.minute - this.s.hour * 60; }

  drainRate(): number {
    const s = this.s;
    const c = this.cfg;
    let r = c.DRAIN_BASE * (1 + c.DRAIN_HOUR_GROWTH * s.hour) * Math.pow(c.DRAIN_HOUR_EXP, s.hour);
    // tolerance: the more dopa you hold, the faster it leaks
    if (s.dopa > 0) r += s.dopa * c.DRAIN_TOLERANCE;
    if (s.bossActive) r *= c.BOSS_DRAIN_MULT * (s.boss?.extraDrain ?? 1);
    if (s.phase === 'website') r *= c.WEBSITE_DRAIN_MULT;
    if (s.dopa < 0) r *= c.NEGATIVE_DRAIN_MULT;
    for (const e of s.saved) if (e.def.drainMult) r *= e.def.drainMult(s, e);
    for (const m of s.mods) if (m.drainMult) r *= m.drainMult;
    return r;
  }

  /** called every frame with real seconds */
  update(dtReal: number): void {
    const s = this.s;
    const c = this.cfg;
    if (s.paused || !s.started) return;
    if (s.phase !== 'playing' && s.phase !== 'website') return;

    const dm = (dtReal * c.SPEED) / c.REAL_SECONDS_PER_FAKE_MINUTE;
    const prev = s.minute;
    s.minute += dm;
    this.changeDopa(-this.drainRate() * dm);

    for (let m = Math.floor(prev) + 1; m <= Math.floor(s.minute); m++) {
      this.onMinute(m);
      if (s.phase !== 'playing' && s.phase !== 'website') return;
    }

    // ads tick while you're looking at them
    const card = this.current();
    if (s.phase === 'playing' && card.def.ad && !card.adDone) {
      card.adWatched += dm;
      if (card.adWatched >= card.def.ad.minutes) {
        card.adDone = true;
        s.stats.adsWatched++;
        this.emit('adDone', card);
      }
    }

    if (s.notif && s.minute >= s.notif.expiresAt) this.resolveNotif('ignore');

    const inBoss = this.hourMinute() >= 60 - c.BOSS_MINUTES;
    if (inBoss !== s.bossActive) {
      s.bossActive = inBoss;
      this.emit('boss', inBoss);
    }

    const h = Math.floor(s.minute / 60);
    if (h > s.hour) this.endHour(h);
    this.checkSleep();
  }

  private onMinute(m: number): void {
    const s = this.s;
    for (const e of [...s.saved]) e.def.onMinute?.(this, e, m);
    const before = s.mods.length;
    s.mods = s.mods.filter((x) => x.untilMinute === undefined || x.untilMinute > m);
    if (s.mods.length !== before) this.emit('effects', undefined);
    if (!s.notif && s.phase === 'playing' && this.rng() < this.cfg.NOTIF_CHANCE_PER_MIN) this.spawnNotif();
    if (s.bossActive && s.boss?.autoplay && m % this.cfg.AUTOPLAY_EVERY_MIN === 0) this.swipe('up', true);
  }

  private endHour(h: number): void {
    const s = this.s;
    s.minute = h * 60;
    s.hour = h;
    s.swipesThisHour = 0;
    s.bossActive = false;
    this.emit('boss', false);
    for (const e of [...s.saved]) e.def.onHour?.(this, e, h);

    if (!s.endless && h >= this.cfg.VICTORY_HOUR) {
      this.setPhase('won');
      const r = loadRecords();
      r.runs++; r.wins++; r.bestMinute = Math.max(r.bestMinute, s.minute);
      saveRecords(r);
      return;
    }
    this.rollBoss();
    if (this.cfg.HOUR_BREAKS) {
      this.rollChoices();
      this.setPhase('hourbreak');
    }
    this.checkSleep();
  }

  private rollChoices(): void {
    const s = this.s;
    const pool = CHOICES.filter((c) => (c.minHour ?? 0) <= s.hour);
    const out = [];
    while (out.length < 3 && pool.length) {
      const c = weightedPick(pool, (x) => x.weight ?? 10, this.rng());
      if (!c) break;
      out.push(c);
      pool.splice(pool.indexOf(c), 1);
    }
    s.choices = out;
  }

  /** pick a night choice (null = keep scrolling) */
  choose(id: string | null): void {
    const s = this.s;
    if (s.phase !== 'hourbreak') return;
    const c = s.choices.find((x) => x.id === id);
    s.choices = [];
    this.setPhase('playing');
    c?.run(this);
    this.checkSleep();
  }

  continueEndless(): void {
    const s = this.s;
    s.endless = true;
    this.rollBoss();
    if (this.cfg.HOUR_BREAKS) { this.rollChoices(); this.setPhase('hourbreak'); }
    else this.setPhase('playing');
  }

  private rollBoss(): void {
    const s = this.s;
    if (!s.endless && s.hour === this.cfg.VICTORY_HOUR - 1) { s.boss = SUNRISE; return; }
    const prev = s.boss?.id;
    const pool = BOSSES.filter((b) => b.minHour <= s.hour && b.id !== prev);
    s.boss = weightedPick(pool, (b) => b.weight ?? 10, this.rng()) ?? BOSSES[0];
  }

  private setPhase(p: Phase): void {
    this.s.phase = p;
    this.emit('phase', p);
  }

  private checkSleep(): void {
    const s = this.s;
    if (s.phase === 'over' || s.phase === 'won' || this.cfg.GOD_MODE) return;
    if (s.dopa <= this.cfg.SLEEP_AT) {
      if (s.website) { s.website = null; this.emit('website', null); }
      if (s.notif) { s.notif = null; this.emit('notif', null); }
      s.deathMsg = this.pick(SLEEP_LINES);
      const r = loadRecords();
      r.runs++; r.bestMinute = Math.max(r.bestMinute, s.minute);
      saveRecords(r);
      this.setPhase('over');
    }
  }

  /* ── notifications ── */

  private spawnNotif(): void {
    const s = this.s;
    const pool = NOTIFS.filter((n) => (n.minHour ?? 0) <= s.hour);
    const def = weightedPick(pool, (n) => n.weight ?? 10, this.rng());
    if (!def) return;
    s.notif = { uid: s.uid++, def, bornAt: s.minute, expiresAt: s.minute + this.cfg.NOTIF_LIFETIME_MIN };
    s.stats.notifs++;
    this.emit('notif', s.notif);
  }

  resolveNotif(kind: 'open' | 'dismiss' | 'ignore'): void {
    const n = this.s.notif;
    if (!n) return;
    this.s.notif = null;
    const o = n.def[kind];
    o.run(this);
    if (o.label) this.toast(`${n.def.icon} ${o.label}`);
    this.emit('notif', null);
  }

  /* ── premium-ad website trap ── */

  private randPos(): Pick<WebsiteState, 'x' | 'y' | 'dx' | 'dy'> {
    // percentages of the screen; popup ≈40% wide, decoy ≈50% wide
    return { x: 4 + this.rng() * 52, y: 25 + this.rng() * 50, dx: 4 + this.rng() * 42, dy: 30 + this.rng() * 50 };
  }

  private openWebsite(card: CardInstance): void {
    const s = this.s;
    s.stats.websites++;
    s.website = {
      card, popupsLeft: 3 + Math.floor(s.hour / 2), ...this.randPos(),
      url: this.pick(SITES), headline: this.pick(HEADLINES),
    };
    this.setPhase('website');
    this.emit('website', s.website);
  }

  /** real = the actual ✕, false = the decoy button */
  websiteTap(real: boolean): void {
    const w = this.s.website;
    if (!w) return;
    if (real) {
      w.popupsLeft--;
      if (w.popupsLeft <= 0) { this.closeWebsite(); return; }
    } else {
      this.addDopa(-2, '🌐 malware');
      w.popupsLeft = Math.min(8, w.popupsLeft + 1);
    }
    Object.assign(w, this.randPos());
    this.emit('website', w);
  }

  private closeWebsite(): void {
    const s = this.s;
    const w = s.website;
    if (!w) return;
    s.website = null;
    this.setPhase('playing');
    this.emit('website', null);
    w.card.leaves.up++;
    s.index = this.forwardIndex();
    const to = this.current();
    this.enter(to);
    this.toast('escaped. barely.');
    this.emit('swiped', { dir: 'up', meaning: 'up', from: w.card, to, result: { total: 0, steps: [] }, forced: true });
  }

  /* ── debug helpers for the tweaks panel ── */

  debugShowCard(id: string): void {
    this.queueCard(id);
    this.s.index++;
    this.enter(this.current());
    this.emit('refresh', undefined);
  }
  debugJumpBoss(): void {
    this.s.started = true;
    this.s.minute = this.s.hour * 60 + 60 - this.cfg.BOSS_MINUTES - 0.01;
  }
  debugNextHour(): void {
    this.s.started = true;
    this.s.minute = (this.s.hour + 1) * 60 - 0.01;
  }
  debugNotif(): void {
    if (!this.s.notif) this.spawnNotif();
  }
}
