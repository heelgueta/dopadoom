/**
 * SAVED EFFECTS — what you get by swiping right. They sit in the saved strip
 * (max CFG.SAVED_SLOTS) and transform the gain of every matching swipe,
 * left → right. See engine/scoring.ts for the pipeline.
 *
 * Adding one: copy an entry, give it a unique id, reference the id from a
 * card's `right: save('your_id')`. That's it.
 *
 *   gain(v, ctx, self)  → new running value. v is the value so far.
 *   triggers            → which swipes fire it (omit = all four)
 *   op                  → 'mult' makes the breakdown show "×2" instead of "+3"
 *   removeCost          → dopa to delete it (negative = deleting pays you)
 *   short               → tiny chip text; can be a fn for live numbers
 */
import type { EffectDef } from '../types';
import { fmt, mult } from '../util';

const list: EffectDef[] = [
  /* ── intro ─────────────────────────────────────────────── */
  {
    id: 'first_like', name: 'First Like', icon: '👍', desc: '+2 on every ↑ skip.',
    short: '+2↑', triggers: ['up'], removeCost: 1,
    gain: (v) => v + 2,
  },
  {
    id: 'double_tap', name: 'Double Tap', icon: '✌️', desc: '×2 on every ↑ skip.',
    short: '×2↑', triggers: ['up'], op: 'mult', removeCost: 3,
    gain: (v) => v * 2,
  },

  /* ── simple adders ─────────────────────────────────────── */
  {
    id: 'cat_tax', name: 'Cat Tax', icon: '🐈', desc: '+1 on every ↑ skip.',
    short: '+1↑', triggers: ['up'], removeCost: 1,
    gain: (v) => v + 1,
  },
  {
    id: 'doom_loop', name: 'Doom Loop', icon: '🌀', desc: '+2 on ↑, −1 on ↓. forward only.',
    short: '+2↑−1↓', triggers: ['up', 'down'], removeCost: 2,
    gain: (v, c) => (c.dir === 'up' ? v + 2 : v - 1),
  },
  {
    id: 'nostalgia', name: 'Nostalgia', icon: '📼', desc: '+3 on ↓ back. the past was better.',
    short: '+3↓', triggers: ['down'], removeCost: 1,
    gain: (v) => v + 3,
  },
  {
    id: 'reply_guy', name: 'Reply Guy', icon: '💬', desc: '+3 on ← reject. well actually.',
    short: '+3←', triggers: ['left'], removeCost: 1,
    gain: (v) => v + 3,
  },
  {
    id: 'fomo', name: 'FOMO', icon: '😰', desc: '+3 on ↑, −3 on ↓. never look back.',
    short: '+3↑−3↓', triggers: ['up', 'down'], removeCost: 2,
    gain: (v, c) => (c.dir === 'up' ? v + 3 : v - 3),
  },
  {
    id: 'parasocial', name: 'Parasocial', icon: '💖', desc: '+4 on ↑. drain +10%. they don\'t know you.',
    short: '+4↑', triggers: ['up'], removeCost: 4,
    gain: (v) => v + 4, drainMult: () => 1.1,
  },

  /* ── multipliers ───────────────────────────────────────── */
  {
    id: 'algo_boost', name: 'Algo Boost', icon: '📈', desc: '×1.5 on ↑ skip.',
    short: '×1.5↑', triggers: ['up'], op: 'mult', removeCost: 3,
    gain: (v) => v * 1.5,
  },
  {
    id: 'hate_follow', name: 'Hate Follow', icon: '👁', desc: '×2 on ← reject.',
    short: '×2←', triggers: ['left'], op: 'mult', removeCost: 2,
    gain: (v) => v * 2,
  },
  {
    id: 'meme_lord', name: 'Meme Lord', icon: '🐸', desc: '×2 on any swipe of a meme card.',
    short: '×2 memes', op: 'mult', removeCost: 2,
    gain: (v, c) => (c.card.def.kind === 'meme' ? v * 2 : v),
  },
  {
    id: 'engagement_farmer', name: 'Engagement Farmer', icon: '🎣', desc: '+3 on any swipe of ragebait.',
    short: '+3 rage', removeCost: 2,
    gain: (v, c) => (c.card.def.kind === 'ragebait' ? v + 3 : v),
  },
  {
    id: 'doomer', name: 'Doomer', icon: '🌧', desc: '×0.5 on ↑, ×4 on ↓. it was all downhill.',
    short: '½↑ ×4↓', triggers: ['up', 'down'], op: 'mult', removeCost: 2,
    gain: (v, c) => (c.dir === 'up' ? v * 0.5 : v * 4),
  },
  {
    id: 'night_owl', name: 'Night Owl', icon: '🦉', desc: '↑ gets ×(1 + 0.2 × hour). the later, the better.',
    short: (s) => `×${fmt(1 + 0.2 * s.hour)}↑`, triggers: ['up'], op: 'mult', removeCost: 3,
    gain: (v, c) => v * (1 + 0.2 * c.s.hour),
  },
  {
    id: 'main_character', name: 'Main Character', icon: '🎬', desc: '×3 on everything while dopa < 5. clutch.',
    short: '×3 <5', op: 'mult', removeCost: 3,
    gain: (v, c) => (c.s.dopa < 5 ? v * 3 : v),
  },
  {
    id: 'hustle', name: 'Hustle Culture', icon: '⚡', desc: '×3 on ↑. drain ×1.5. rise and grind.',
    short: '×3↑', triggers: ['up'], op: 'mult', removeCost: 5,
    gain: (v) => v * 3, drainMult: () => 1.5,
  },
  {
    id: 'rage_brain', name: 'Rage Brain', icon: '😡', desc: '×2 on everything. drain +25%.',
    short: '×2 all', op: 'mult', removeCost: 8, curse: true,
    gain: (v) => v * 2, drainMult: () => 1.25,
  },

  /* ── scaling / stateful ────────────────────────────────── */
  {
    id: 'streak', name: 'Streak', icon: '🔥', desc: '+0.25 per consecutive ↑ (max +5). any other swipe resets.',
    short: (s) => `+${fmt(Math.min(5, s.streak * 0.25))}↑`, triggers: ['up'], removeCost: 1,
    gain: (v, c) => v + Math.min(5, c.s.streak * 0.25),
  },
  {
    id: 'grindset', name: 'Grindset', icon: '💪', desc: '+0.1 per swipe this hour on ↑.',
    short: (s) => `+${fmt(s.swipesThisHour * 0.1)}↑`, triggers: ['up'], removeCost: 2,
    gain: (v, c) => v + c.s.swipesThisHour * 0.1,
  },
  {
    id: 'sunk_cost', name: 'Sunk Cost', icon: '🕳', desc: '↑ gets +0.05 per fake minute since you saved it. just keep holding.',
    short: (s, e) => `+${fmt((s.minute - e.savedAt) * 0.05)}↑`, triggers: ['up'], removeCost: 0,
    gain: (v, c, e) => v + (c.s.minute - e.savedAt) * 0.05,
  },
  {
    id: 'echo_chamber', name: 'Echo Chamber', icon: '🔊', desc: '+1 per saved effect (incl. this one) on every swipe.',
    short: (s) => `+${s.saved.length}`, removeCost: 2,
    gain: (v, c) => v + c.s.saved.length,
  },
  {
    id: 'clout', name: 'Clout', icon: '🌟', desc: '+1 on ↑ per 25 total swipes this run.',
    short: (s) => `+${Math.floor(s.stats.swipes / 25)}↑`, triggers: ['up'], removeCost: 2,
    gain: (v, c) => v + Math.floor(c.s.stats.swipes / 25),
  },
  {
    id: 'pattern_seeker', name: 'Pattern Seeker', icon: '🔺', desc: 'every 3rd swipe: +6. it all connects.',
    short: (s) => `+6 in ${3 - (s.stats.swipes % 3)}`, removeCost: 3,
    gain: (v, c) => ((c.s.stats.swipes + 1) % 3 === 0 ? v + 6 : v),
  },
  {
    id: 'your_post', name: 'Your Post', icon: '📸', desc: 'something you posted. +0.1 per fake minute since posting, on every swipe. going viral (slowly).',
    short: (s, e) => `+${fmt((s.minute - e.savedAt) * 0.1)}`, removeCost: 0,
    gain: (v, c, e) => v + (c.s.minute - e.savedAt) * 0.1,
  },

  /* ── copy effects (order puzzles) ──────────────────────── */
  {
    id: 'bot_farm', name: 'Bot Farm', icon: '🤖', desc: 'copies the effect to its RIGHT. position matters.',
    short: 'copy →', copy: 'right', removeCost: 3,
  },
  {
    id: 'mirror', name: 'Mirror', icon: '🪞', desc: 'copies the effect to its LEFT. position matters.',
    short: '← copy', copy: 'left', removeCost: 3,
  },

  /* ── passive / timed ───────────────────────────────────── */
  {
    id: 'mindful', name: 'Mindful Minute', icon: '🧘', desc: '+3 dopa every 10 fake minutes.',
    short: '+3/10m', removeCost: 1,
    onMinute: (g, _e, m) => { if (m % 10 === 0) g.addDopa(3, '🧘'); },
  },
  {
    id: 'touch_grass', name: 'Touch Grass', icon: '🌱', desc: 'drain ×0.75, but −0.5 on every ↑.',
    short: 'drain ×.75', triggers: ['up'], removeCost: 0,
    gain: (v) => v - 0.5, drainMult: () => 0.75,
  },
  {
    id: 'subscription', name: 'Subscription', icon: '📺', desc: '+2 on ↑. −8 dopa every hour. cancelling costs 10.',
    short: '+2↑ −8/h', triggers: ['up'], removeCost: 10,
    gain: (v) => v + 2, onHour: (g) => g.addDopa(-8, '📺 renewal'),
  },
  {
    id: 'brocult', name: 'Sigma Brotherhood', icon: '🗿', desc: '+3 on everything. every hour the cult tithes 25% of your dopa. leaving costs 15.',
    short: '+3 · tithe', removeCost: 15,
    gain: (v) => v + 3,
    onHour: (g) => { if (g.s.dopa > 0) g.addDopa(-g.s.dopa * 0.25, '🗿 tithe'); },
  },
  {
    id: 'crypto_bag', name: '$DOPE Bag', icon: '🪙', desc: '↑ gets ×price. price random-walks every minute (0.2–4). deleting SELLS: +5 × price.',
    short: (_s, e) => mult(e.data.price ?? 1), triggers: ['up'], op: 'mult',
    removeCost: (_s, e) => -5 * (e.data.price ?? 1),
    init: (_g, e) => { e.data.price = 1; },
    gain: (v, _c, e) => v * (e.data.price ?? 1),
    onMinute: (g, e) => {
      const p = (e.data.price ?? 1) * (0.8 + g.rand() * 0.45);
      e.data.price = Math.max(0.2, Math.min(4, Math.round(p * 100) / 100));
    },
  },

  /* ── curses ────────────────────────────────────────────── */
  {
    id: 'brand_loyalty', name: 'Brand Loyalty', icon: '🏷️', desc: '−0.5 on every swipe. you subscribed to an ad. why.',
    short: '−.5 all', curse: true, removeCost: 6,
    gain: (v) => v - 0.5,
  },
  {
    id: 'microplastics', name: 'Microplastics', icon: '🧴', desc: 'drain +15%. from the detox tea. removal costs 3.',
    short: 'drain +15%', curse: true, removeCost: 3,
    drainMult: () => 1.15,
  },
  {
    id: 'chain_letter', name: 'Chain Letter', icon: '⛓', desc: '−2 on every swipe. keep it until the hour ends and it pays +20. deleting costs 20.',
    short: '−2 → +20/h', curse: true, removeCost: 20,
    gain: (v) => v - 2,
    onHour: (g) => g.addDopa(20, '⛓ blessed'),
  },
  {
    id: 'premium_sub', name: 'Premium Subscriber', icon: '💎', desc: '+3 on ↑, ads are skippable for free. −5 dopa every hour.',
    short: '+3↑ adfree', triggers: ['up'], removeCost: 5,
    gain: (v) => v + 3, onHour: (g) => g.addDopa(-5, '💎 billing'),
  },
  {
    id: 'ad_blocker', name: 'Ad Blocker', icon: '🛡', desc: 'skipping ads early costs nothing.',
    short: 'no ad cost', removeCost: 0,
  },
];

export const EFFECTS: Record<string, EffectDef> = Object.fromEntries(list.map((e) => [e.id, e]));

export function effectShort(id: string): string {
  const e = EFFECTS[id];
  if (!e) return `?${id}`;
  return `${e.icon} ${typeof e.short === 'string' ? e.short : e.name}`;
}

/** used by the tweaks panel and to sanity-check card references at boot */
export function assertEffect(id: string): void {
  if (!EFFECTS[id]) console.warn(`[dopadoom] unknown effect id "${id}"`);
}

