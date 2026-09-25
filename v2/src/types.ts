/**
 * Data model. Everything the player sees is an OP on their dopa:
 *   +2  add · −2 subtract · ×2 multiply · ÷2 divide · ×2/÷2 coin flip
 * Colours follow the op: + and × are blue family, − and ÷ are red family.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** every action the player can take on a post */
export type Action = Dir | 'save' | 'block' | 'report';

export type OpKind = '+' | '-' | 'x' | '/';

export interface Op {
  k: OpKind;
  n: number;
  /** coin flip: 50% this op, 50% `alt` */
  alt?: Op;
}

/** a saved-effect modifier: changes the dopa gained by a matching swipe */
export interface Mod {
  dir: Dir | 'all';
  /** '+' adds to the gain (n can be negative), 'x' multiplies the gain */
  k: '+' | 'x';
  n: number;
}

export interface PostType {
  id: string;
  /** short name shown on the post */
  name: string;
  /** border colour. avoid red/blue: those belong to the numbers */
  color: string;
  weight: number;
  /** compact templates, see content/posts.ts */
  templates: string[];
  /** CSS border style */
  border?: 'solid' | 'dashed' | 'double' | 'rainbow';
}

export interface AdState {
  premium: boolean;
  /** real seconds left */
  left: number;
  tries: number;
  done: boolean;
}

export interface Post {
  uid: number;
  type: PostType;
  handle: string;
  /** seed for the placeholder pixel picture */
  art: number;
  acts: Record<Dir, Op>;
  save: Mod[] | null;
  block: Op;
  report: Op;
  ad: AdState | null;
  /** liked or disliked (← / → are once per post) */
  reacted: '' | 'liked' | 'disliked';
  saved: boolean;
  blocked: boolean;
  /** times you left this post with ↑ / ↓ (repeat decay) */
  leaves: { up: number; down: number };
}

export interface Effect {
  uid: number;
  mods: Mod[];
  /** type colour of the post it came from */
  color: string;
}

export interface TallyStep {
  /** short text: "+1", "+2↑", "×0.9" */
  text: string;
  /** colour class */
  cls: string;
  /** running gain after this step */
  after: number;
  /** chip to flash */
  effect?: number;
}

export interface Result {
  /** change to dopa */
  total: number;
  steps: TallyStep[];
}

export type ModeId = 'upkeep' | 'quota' | 'clock';
export type Phase = 'menu' | 'playing' | 'website' | 'over' | 'won';

export interface OutcomeDef {
  op?: Op;
  /** special outcomes */
  special?: 'website' | 'gift';
}

export interface NotifDef {
  id: string;
  from: string;
  tap: OutcomeDef;
  swipe: OutcomeDef;
  wait: OutcomeDef;
  weight?: number;
}

export interface Notif {
  uid: number;
  def: NotifDef;
  /** real seconds left */
  left: number;
}

export interface Website {
  post: Post;
  popups: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** what happened at an UPKEEP / QUOTA checkpoint */
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
  /** fake minutes since 00:00 */
  minute: number;
  turn: number;
  /** checkpoints passed (upkeep / quota level) */
  level: number;
  feed: Post[];
  index: number;
  effects: Effect[];
  notif: Notif | null;
  website: Website | null;
  postsSinceAd: number;
  uid: number;
  stats: { actions: number; liked: number; disliked: number; saved: number; blocked: number; ads: number; peak: number };
  deathMsg: string;
}
