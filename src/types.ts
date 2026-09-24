/**
 * Core data model. Content (cards, effects, bosses…) is written as TS objects
 * against these interfaces, so it can hold small functions for the weird stuff
 * while staying mostly declarative.
 */
import type { Config } from './config';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** what the swipe MEANS. physical direction can differ (see Mirror World boss) */
export const VERB: Record<Dir, string> = { up: 'SKIP', down: 'BACK', left: 'REJECT', right: 'SAVE' };
export const ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export type Kind =
  | 'intro'
  | 'neutral'
  | 'meme'
  | 'wholesome'
  | 'godlike'
  | 'ragebait'
  | 'conspiracy'
  | 'ad'
  | 'premium'
  | 'crypto'
  | 'brocult'
  | 'dm'
  | 'cursed'
  | 'system';

/** colours the edge label: good=green bad=red risky=yellow save=blue */
export type Tone = 'good' | 'bad' | 'risky' | 'save' | 'neutral';

export type Phase = 'playing' | 'website' | 'hourbreak' | 'over' | 'won';

/* ── scoring ─────────────────────────────────────────────────────────── */

export interface GainCtx {
  s: GameState;
  g: GameApi;
  card: CardInstance;
  dir: Dir;
}

export type Num = number | ((c: GainCtx) => number);
export type Str = string | ((c: GainCtx) => string);

export interface GainStep {
  src: 'base' | 'card' | 'effect' | 'mod' | 'boss' | 'decay';
  /** short text e.g. "+2", "×1.5" */
  text: string;
  /** running value after this step */
  after: number;
  /** effect instance uid (so the chip can pulse) */
  uid?: number;
  icon?: string;
}

export interface GainResult {
  total: number;
  steps: GainStep[];
}

/* ── cards ───────────────────────────────────────────────────────────── */

export interface ActionDef {
  /** short text on the card edge ("×2 DOPA", "+3"). omitted → auto from gain/save */
  label?: Str;
  tone?: Tone;
  /** added to the running value after the base gain. fn for dynamic (×DOPA etc) */
  gain?: Num;
  /** effect id pushed to the saved list (right swipe) */
  save?: string;
  /** reason string → this direction is disabled. fn for conditional */
  block?: string | ((c: GainCtx) => string | null);
  /** side effect after the swipe resolved and the feed moved */
  then?: (g: GameApi, card: CardInstance) => void;
  /** left only: don't remove the card (e.g. "close app" on the title card) */
  keep?: boolean;
  /** skip the base gain for this action */
  noBase?: boolean;
}

export interface AdSpec {
  /** fake minutes to watch until done */
  minutes: number;
  /** skip-gain once the ad has been watched */
  reward: number;
  /** premium: skipping early traps you on a website */
  premium?: boolean;
}

export interface CardDef {
  id: string;
  kind: Kind;
  title: string;
  body?: string;
  /** placeholder art. emoji / ascii for now */
  art: string;
  handle?: string;
  /** spawn weight (default 10) */
  weight?: number;
  /** earliest hour it can spawn */
  minHour?: number;
  maxHour?: number;
  /** only once per run */
  unique?: boolean;
  /** ads: brand key, blocking a brand stops it spawning */
  brand?: string;
  ad?: AdSpec;
  up?: ActionDef;
  down?: ActionDef;
  left?: ActionDef;
  right?: ActionDef;
  /** runs when the card first appears */
  onEnter?: (g: GameApi, card: CardInstance) => void;
}

export interface CardInstance {
  uid: number;
  def: CardDef;
  rejected: boolean;
  saved: boolean;
  /** times the player left this card in each direction → repeat decay */
  leaves: Record<Dir, number>;
  adWatched: number;
  adDone: boolean;
  likes: string;
  comments: string;
  /** free per-instance storage for weird cards */
  data: Record<string, number>;
}

/* ── saved effects ───────────────────────────────────────────────────── */

export interface EffectDef {
  id: string;
  name: string;
  icon: string;
  /** one-line human description */
  desc: string;
  /** tiny chip text ("+2↑"). fn for live values */
  short: string | ((s: GameState, self: EffectInstance) => string);
  /** how the breakdown shows it: "×2" (mult) or "+2" (add, default) */
  op?: 'add' | 'mult';
  /** which swipes trigger gain(). omitted → all four */
  triggers?: Dir[];
  curse?: boolean;
  /** transforms the running gain value, left→right through the saved list */
  gain?: (v: number, c: GainCtx, self: EffectInstance) => number;
  /** copies the neighbour's gain() (Blueprint / Brainstorm style) */
  copy?: 'left' | 'right';
  /** multiplies dopa drain while saved */
  drainMult?: (s: GameState, self: EffectInstance) => number;
  onMinute?: (g: GameApi, self: EffectInstance, minute: number) => void;
  onHour?: (g: GameApi, self: EffectInstance, hour: number) => void;
  /** dopa cost to delete. negative = deleting PAYS you */
  removeCost: number | ((s: GameState, self: EffectInstance) => number);
  onRemove?: (g: GameApi, self: EffectInstance) => void;
  init?: (g: GameApi, self: EffectInstance) => void;
}

export interface EffectInstance {
  uid: number;
  def: EffectDef;
  /** inverted: its delta is mirrored (v → 2v − f(v)) */
  inverted: boolean;
  savedAt: number;
  data: Record<string, number>;
}

/* ── run-level modifiers (night choices, notifications…) ─────────────── */

export interface Modifier {
  id: string;
  icon: string;
  label: string;
  gainMult?: number;
  drainMult?: number;
  /** expires when the clock reaches this fake minute. omitted → whole run */
  untilMinute?: number;
}

export interface BossDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  minHour: number;
  weight?: number;
  /** extra drain on top of CFG.BOSS_DRAIN_MULT */
  extraDrain?: number;
  blockDirs?: Dir[];
  /** overrides BASE_SWIPE_GAIN */
  baseGain?: number;
  gainMult?: number;
  kindBias?: Kind[];
  /** every Nth spawned card is an ad */
  adEvery?: number;
  swapLR?: boolean;
  autoplay?: boolean;
  scramble?: boolean;
  dim?: boolean;
}

export interface Outcome {
  label: string;
  run: (g: GameApi) => void;
}

export interface NotifDef {
  id: string;
  icon: string;
  from: string;
  text: string;
  minHour?: number;
  weight?: number;
  open: Outcome;
  dismiss: Outcome;
  ignore: Outcome;
}

export interface ActiveNotif {
  uid: number;
  def: NotifDef;
  bornAt: number;
  expiresAt: number;
}

export interface ChoiceDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  weight?: number;
  minHour?: number;
  run: (g: GameApi) => void;
}

export interface WebsiteState {
  card: CardInstance;
  popupsLeft: number;
  /** real X position, percent of viewport */
  x: number;
  y: number;
  /** decoy button position */
  dx: number;
  dy: number;
  url: string;
  headline: string;
}

export interface Stats {
  swipes: number;
  cardsSeen: number;
  rejected: number;
  saved: number;
  denied: number;
  peakDopa: number;
  lowDopa: number;
  gained: number;
  lost: number;
  adsWatched: number;
  websites: number;
  notifs: number;
}

export interface GameState {
  seed: string;
  phase: Phase;
  paused: boolean;
  /** clock only runs after the first swipe */
  started: boolean;
  dopa: number;
  /** fake minutes since 00:00 (float) */
  minute: number;
  hour: number;
  feed: CardInstance[];
  index: number;
  /** can't swipe back to indices below this (burned bridges) */
  barrier: number;
  saved: EffectInstance[];
  slots: number;
  mods: Modifier[];
  boss: BossDef | null;
  bossActive: boolean;
  endless: boolean;
  notif: ActiveNotif | null;
  website: WebsiteState | null;
  choices: ChoiceDef[];
  blockedBrands: string[];
  seenUnique: string[];
  /** consecutive up swipes */
  streak: number;
  swipesThisHour: number;
  stats: Stats;
  deathMsg: string;
  uid: number;
}

/**
 * What content code is allowed to touch. The Game class implements this.
 * Keeping it an interface avoids import cycles (content → types ← engine).
 */
export interface GameApi {
  s: GameState;
  cfg: Config;
  rand(): number;
  pick<T>(arr: T[]): T;
  /** instant dopa change with a floating label */
  addDopa(amount: number, label: string): void;
  toast(msg: string, tone?: Tone): void;
  addMod(m: Modifier): void;
  /** push an effect to the saved list. false if full */
  saveEffect(id: string): boolean;
  hasEffect(id: string): boolean;
  removeEffect(uid: number, free?: boolean): void;
  invertEffects(): void;
  burnBridges(): void;
  /** insert a specific card right after the current one */
  queueCard(defId: string): void;
  skipMinutes(n: number): void;
  hourNow(): number;
}
