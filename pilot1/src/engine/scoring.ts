/**
 * THE GAIN PIPELINE — how a swipe turns into dopa. Balatro-style: a single
 * running value flows left→right through your saved effects, so ORDER MATTERS
 * (+2 then ×2 = 6, ×2 then +2 = 4).
 *
 *   1. base       BASE_SWIPE_GAIN for ↑/↓ (boss can override)
 *   2. card       the card's own action value for that direction
 *   3. effects    saved effects, left → right, if their trigger matches
 *   4. mods       run modifiers (coffee crash, melatonin…)
 *   5. boss       boss gain multiplier
 *   6. decay      repeat penalty for ↑/↓ on the same card (only shrinks gains)
 *
 * Pure: computeGain() doesn't mutate state, so the UI calls it to preview
 * what each swipe would give before you commit.
 */
import type { Config } from '../config';
import type { ActionDef, CardInstance, Dir, EffectInstance, GainCtx, GainResult, GainStep, GameApi, GameState } from '../types';
import { round2, signed, mult, fmt } from '../util';

export const DEFAULT_ACTIONS: Record<Dir, ActionDef> = {
  up: {},
  down: {},
  left: {},
  right: { label: 'nothing', tone: 'neutral' },
};

export function actionOf(card: CardInstance, dir: Dir): ActionDef {
  return card.def[dir] ?? DEFAULT_ACTIONS[dir];
}

export function evalNum(n: ActionDef['gain'], c: GainCtx): number {
  if (n === undefined) return 0;
  return typeof n === 'function' ? n(c) : n;
}

export function triggers(e: EffectInstance, dir: Dir): boolean {
  return !e.def.triggers || e.def.triggers.includes(dir);
}

/** apply one effect's gain fn, honouring inversion + copy effects */
function applyEffect(v: number, c: GainCtx, e: EffectInstance, list: EffectInstance[], i: number): number {
  let src = e;
  if (e.def.copy) {
    const n = list[e.def.copy === 'right' ? i + 1 : i - 1];
    if (!n || n.def.copy || !n.def.gain) return v; // no copy-of-copy chains
    src = n;
  }
  if (!src.def.gain || !triggers(src, c.dir)) return v;
  const out = src.def.gain(v, c, src);
  // inversion mirrors the delta: +2 becomes −2, ×2 (on 3 → 6) becomes 3 → 0
  return e.inverted ? 2 * v - out : out;
}

/** breakdown text for one effect step: "×2" for multiplicative effects, "+2" otherwise */
function describe(before: number, after: number, e: EffectInstance): string {
  if (e.def.op === 'mult' && before !== 0 && !e.inverted) return mult(after / before);
  return signed(after - before);
}

export function computeGain(s: GameState, g: GameApi, card: CardInstance, dir: Dir, cfg: Config): GainResult {
  const c: GainCtx = { s, g, card, dir };
  const a = actionOf(card, dir);
  const steps: GainStep[] = [];
  const boss = s.bossActive ? s.boss : null;

  // 1. base
  let v = 0;
  const vertical = dir === 'up' || dir === 'down';
  if (!a.noBase && (vertical || (dir === 'right' && cfg.SAVE_GIVES_BASE))) {
    v = boss?.baseGain ?? cfg.BASE_SWIPE_GAIN;
    steps.push({ src: 'base', text: fmt(v), after: v });
  }

  // 2. card
  const cardGain = evalNum(a.gain, c);
  if (cardGain !== 0) {
    v += cardGain;
    steps.push({ src: 'card', text: signed(cardGain), after: v, icon: card.def.art });
  }

  // 3. saved effects, left → right
  s.saved.forEach((e, i) => {
    const before = v;
    v = applyEffect(v, c, e, s.saved, i);
    if (Math.abs(v - before) > 1e-9) steps.push({ src: 'effect', text: describe(before, v, e), after: v, uid: e.uid, icon: e.def.icon });
  });

  // 4. modifiers
  for (const m of s.mods) {
    if (m.gainMult !== undefined && m.gainMult !== 1 && v > 0) {
      v *= m.gainMult;
      steps.push({ src: 'mod', text: mult(m.gainMult), after: v, icon: m.icon });
    }
  }

  // 5. boss
  if (boss?.gainMult !== undefined && v > 0) {
    v *= boss.gainMult;
    steps.push({ src: 'boss', text: mult(boss.gainMult), after: v, icon: boss.icon });
  }

  // 6. repeat decay (anti up/down farming). only ever shrinks positive gains.
  if (vertical && v > 0) {
    const n = card.leaves[dir];
    const f = Math.max(cfg.REPEAT_DECAY_MIN, 1 - n * cfg.REPEAT_DECAY_STEP);
    if (f < 1) {
      v *= f;
      steps.push({ src: 'decay', text: `·${fmt(f)}`, after: v, icon: '♻' });
    }
  }

  return { total: round2(v), steps };
}
