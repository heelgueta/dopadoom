/**
 * v3 data model. Content lives in src/data/*.json (see src/data/README.md);
 * engine/data.ts parses it into these shapes.
 *
 * DOPA = your points.
 *   swipes      ± points (post base stats, modified by saved effects)
 *   save        adds a persistent effect on future swipes. no points, you stay
 *   report/block  one-time multiplier on your CURRENT dopa, post is removed
 *   notifications multiplier on current dopa (tap / swipe / wait)
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export type Action = Dir | 'save' | 'block' | 'report';

export type PostKind = 'good' | 'bad' | 'ad' | 'special';
export type AdKind = 'real' | 'scam' | 'game';

/** a number in the data: fixed, rolled when the post appears, or rolled when used */
export type ValSpec = { fixed: number } | { rand: [number, number] } | { pick: number[] };

/** one part of a save effect before it's rolled ("↕↔*pick(3,3,-3)") */
export interface SavePart {
  dirs: Dir[];
  k: '+' | 'x';
  /** one value = fixed. several = picked at random when you save */
  values: number[];
}

/** a rolled, active saved-effect modifier */
export interface Mod {
  dirs: Dir[];
  k: '+' | 'x';
  n: number;
}

export interface PostDef {
  name: string;
  kind: PostKind;
  weight: number;
  minHour: number;
  stats: Record<Dir, ValSpec>;
  /** save parts with rand() already allowed; resolved per post */
  save: { dirs: Dir[]; k: '+' | 'x'; value: ValSpec }[] | null;
  report: number;
  block: number;
  ad?: AdKind;
  special?: 'captcha' | 'glitch';
}

export type StatTransform = { set: number } | { mul: number };

export interface ModifierDef {
  name: string;
  group: 'mult' | 'variant';
  minHour: number;
  weight: number;
  appliesTo?: PostKind;
  stats: Partial<Record<Dir, StatTransform>>;
  /** scale factor for the save effect (see scaleSave) */
  save?: number;
  report?: number;
  block?: number;
}

export interface NotifDef {
  name: string;
  weight: number;
  tap: number;
  swipe: number;
  wait: number;
}

export interface AdState {
  kind: AdKind;
  /** real seconds left */
  left: number;
  tries: number;
  done: boolean;
}

export interface CaptchaState {
  /** tile labels in screen order */
  tiles: number[];
  /** next label to tap (1-based) */
  next: number;
}

export interface Post {
  uid: number;
  /** display name incl. modifiers: CUTE.SLOP.x3 */
  name: string;
  def: PostDef;
  stats: Record<Dir, number>;
  save: SavePart[] | null;
  report: number;
  block: number;
  ad: AdState | null;
  captcha: CaptchaState | null;
  reacted: '' | 'liked' | 'disliked';
  saved: boolean;
  blocked: boolean;
  leaves: { up: number; down: number };
}

export interface Effect {
  uid: number;
  mods: Mod[];
  /** name of the post it came from */
  from: string;
}

export interface TallyStep {
  text: string;
  cls: string;
  /** running value after this step */
  after: number;
  effect?: number;
  /** the saved-effect mod that produced this step (UI draws pixel arrows) */
  mod?: Mod;
}

export interface Result {
  total: number;
  steps: TallyStep[];
  /** short word shown in the tally for special outcomes (SAME, FLIP, SAVED…) */
  tag?: string;
}

export type ModeId = 'clock' | 'upkeep' | 'quota';
export type Phase = 'menu' | 'playing' | 'trap' | 'over' | 'won';

export interface Notif {
  uid: number;
  def: NotifDef;
  left: number;
}

/** scam website or playable ad: tap the real target N times to get out */
export interface Trap {
  kind: 'website' | 'game';
  post: Post;
  hits: number;
  x: number;
  y: number;
  /** playable-ad target velocity (% per second) */
  vx: number;
  vy: number;
  dx: number;
  dy: number;
}

export interface Check {
  kind: 'upkeep' | 'quota';
  amount: number;
  ok: boolean;
}

export interface GameState {
  mode: ModeId;
  seed: string;
  phase: Phase;
  paused: boolean;
  dopa: number;
  minute: number;
  turn: number;
  level: number;
  feed: Post[];
  index: number;
  effects: Effect[];
  notif: Notif | null;
  trap: Trap | null;
  uid: number;
  stats: { moves: number; liked: number; disliked: number; saved: number; blocked: number; reported: number; peak: number };
  deathMsg: string;
}
