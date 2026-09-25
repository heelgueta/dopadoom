/**
 * THE FEED — every reel-card that can show up.
 *
 * Each card defines up to four actions (up/down/left/right). Anything omitted
 * falls back to DEFAULT_ACTIONS in engine/scoring.ts:
 *   up    SKIP   → base gain only
 *   down  BACK   → base gain only (if there's a card behind you)
 *   left  REJECT → removes the card, gives nothing
 *   right SAVE   → "nothing"
 *
 * Helpers below keep entries short:
 *   plus(3)        flat +3
 *   times(2)       ×2 your CURRENT dopa (risky when negative!)
 *   save('id')     push effect `id` (content/effects.ts) to the saved strip
 *   blocked('why') direction disabled, with reason shown on the card
 *
 * Spawning: weight (default 10), minHour/maxHour, unique. Bosses can bias kinds.
 * INTRO lists the scripted first cards; POOL is everything random.
 */
import type { ActionDef, AdSpec, CardDef, GainCtx } from '../types';

/* ── helpers ────────────────────────────────────────────────────────── */

const plus = (n: number, extra: Partial<ActionDef> = {}): ActionDef => ({ gain: n, ...extra });
const times = (k: number, extra: Partial<ActionDef> = {}): ActionDef => ({
  gain: (c) => c.s.dopa * (k - 1),
  label: `×${k} DOPA`,
  tone: 'risky',
  ...extra,
});
const save = (id: string, extra: Partial<ActionDef> = {}): ActionDef => ({ save: id, tone: 'save', ...extra });
const blocked = (reason: string): ActionDef => ({ block: reason });

/** dopa cost of skipping this ad right now */
export function adSkipCost(c: GainCtx): number {
  const ad = c.card.def.ad;
  if (!ad || c.card.adDone) return 0;
  if (c.g.hasEffect('ad_blocker') || c.g.hasEffect('premium_sub')) return 0;
  return Math.ceil(Math.max(0, ad.minutes - c.card.adWatched) * c.g.cfg.AD_SKIP_COST_PER_MIN);
}

/** builds an ad card: can't reject while playing, skipping early costs dopa */
function ad(d: Omit<CardDef, 'kind' | 'ad'> & { ad: AdSpec }): CardDef {
  const premium = !!d.ad.premium;
  return {
    kind: premium ? 'premium' : 'ad',
    weight: 7,
    ...d,
    up: {
      gain: (c) => (c.card.adDone ? d.ad.reward : premium ? 0 : -adSkipCost(c)),
      label: (c) =>
        c.card.adDone ? `✓ +${d.ad.reward}` : premium ? 'skip → 🌐 trap' : adSkipCost(c) ? `skip −${adSkipCost(c)}` : 'skip (free)',
      noBase: false,
    },
    left: {
      block: (c) => (c.card.adDone ? null : "can't report an ad while it plays"),
      gain: 2,
      label: 'block brand',
      then: (g, card) => {
        if (card.def.brand) g.s.blockedBrands.push(card.def.brand);
        g.toast(`blocked ${card.def.handle ?? 'brand'}`);
      },
    },
    right: d.right ?? save('brand_loyalty', { label: 'subscribe' }),
  };
}

/* ── scripted intro ─────────────────────────────────────────────────── */

export const INTRO: CardDef[] = [
  {
    id: 'intro_title',
    kind: 'intro',
    art: '📱',
    title: 'DOPADOOM',
    body: "it's 00:00. you should sleep.\nyou won't.\n\nswipe up.",
    handle: 'your phone',
    up: { label: 'start' },
    down: blocked('there is nothing before the feed'),
    left: { gain: -1, keep: true, label: 'close app', then: (g) => g.toast("you tried to close the app. it didn't work.", 'bad') },
    right: blocked('nothing to save. yet.'),
  },
  {
    id: 'intro_first',
    kind: 'meme',
    art: '🐈',
    title: 'cat knocks glass off table, looks at camera',
    body: 'your first reel. every swipe does something.\nread the edges.',
    handle: '@catlord9000',
    left: times(2),
    right: save('first_like'),
  },
  {
    id: 'intro_second',
    kind: 'neutral',
    art: '🍳',
    title: 'guy cooks an egg for 11 minutes',
    body: 'saved effects stack left → right.\norder matters. tap a chip to move it.',
    handle: '@eggman',
    down: plus(2),
    left: plus(10),
    right: save('double_tap'),
  },
];

/* ── the pool ───────────────────────────────────────────────────────── */

export const POOL: CardDef[] = [
  /* neutral filler — the scroll's background noise */
  {
    id: 'sandwich', kind: 'neutral', art: '🥪', title: 'someone ate a sandwich', body: 'no context. 2.1M views.', handle: '@lunchcore',
    left: plus(1), right: plus(1), weight: 12,
  },
  {
    id: 'routine', kind: 'neutral', art: '🌅', title: 'my 4:30am morning routine', body: 'step 1: be rich', handle: '@thatgirl',
    left: plus(2), right: plus(1), weight: 10,
  },
  {
    id: 'explainer', kind: 'neutral', art: '🎓', title: 'guy explains thing you already knew', body: 'for 9 minutes. with a whiteboard.', handle: '@akshually',
    up: plus(1), left: plus(1), weight: 10,
  },
  {
    id: 'unboxing', kind: 'neutral', art: '📦', title: 'unboxing a box inside a box', body: 'part 3 of 12', handle: '@boxtok',
    down: plus(1), left: plus(1), weight: 10,
  },

  /* memes — reliable, cute, small */
  {
    id: 'cat_table', kind: 'meme', art: '🐈‍⬛', title: 'cat falls off table (4K remaster)', handle: '@catlord9000',
    up: plus(1), left: plus(2), right: save('cat_tax'),
  },
  {
    id: 'frog', kind: 'meme', art: '🐸', title: 'it is wednesday my dudes', body: 'it is not wednesday.', handle: '@frogposter',
    up: plus(1), right: save('meme_lord'),
  },
  {
    id: 'skeleton', kind: 'meme', art: '💀', title: 'skeleton waiting meme but it\'s you waiting for sleep', handle: '@deadinside',
    up: plus(2), left: plus(1), right: save('streak'),
  },
  {
    id: 'distracted', kind: 'meme', art: '👀', title: 'distracted boyfriend but the girlfriend is sleep', handle: '@memearchive',
    down: plus(1), right: save('doom_loop'),
  },
  {
    id: 'pikachu', kind: 'meme', art: '😮', title: 'surprised face when the alarm rings', handle: '@reactionarchive',
    up: plus(1), left: times(1.5),
  },
  {
    id: 'brainrot', kind: 'meme', art: '🧠', title: 'brainrot compilation #847', body: 'skibidi. rizz. gyatt. you understood all of it.', handle: '@rotmaxxer',
    up: plus(1), down: plus(1), right: save('echo_chamber'),
  },

  /* wholesome — trust building */
  {
    id: 'dog_soldier', kind: 'wholesome', art: '🐕', title: 'dog reunites with soldier', body: 'you are not crying. it\'s 2am.', handle: '@goodnews',
    up: plus(2), down: plus(2), left: plus(-2, { label: '−2 monster' }), right: save('mindful'),
  },
  {
    id: 'grandma', kind: 'wholesome', art: '👵', title: 'grandma learns emojis', body: '🍆 to say happy birthday', handle: '@nanatok',
    up: plus(1), down: plus(2), right: save('nostalgia'),
  },
  {
    id: 'tree', kind: 'wholesome', art: '🌳', title: 'guy plants a tree every day for 10 years', handle: '@greenguy',
    up: plus(1), left: plus(-1), right: save('touch_grass'),
  },

  /* godlike — split-screen gameplay energy. rare, huge */
  {
    id: 'runner', kind: 'godlike', art: '🏃‍♂️🚇', title: 'endless runner gameplay (split screen)', body: 'story on top. running on the bottom. perfect.', handle: '@storytime',
    weight: 3, up: plus(5), down: blocked("you can't look away"), left: blocked('impossible.'), right: save('streak'),
  },
  {
    id: 'parkour', kind: 'godlike', art: '🟫🟩', title: 'blocky parkour over lava while a man reads reddit', handle: '@parkourtales',
    weight: 3, up: plus(3), down: plus(3), left: plus(1), right: save('clout'),
  },
  {
    id: 'press', kind: 'godlike', art: '🗜️', title: 'hydraulic press vs everything', handle: '@crushit',
    weight: 3, up: plus(4), left: blocked('you need to see what\'s next'), right: save('algo_boost'),
  },
  {
    id: 'sand', kind: 'godlike', art: '⏳', title: 'kinetic sand ASMR (cutting)', handle: '@satisfying',
    weight: 3, up: plus(3), down: plus(2), right: save('mindful'),
  },
  {
    id: 'soap', kind: 'godlike', art: '🧼', title: 'soap cutting · 10 hours', handle: '@satisfying',
    weight: 2, minHour: 1, up: plus(2), right: save('sunk_cost'),
  },

  /* ragebait — big numbers, nasty saves */
  {
    id: 'politician', kind: 'ragebait', art: '🎤', title: 'you WON\'T BELIEVE what this politician said', body: '(you will. you always do.)', handle: '@outrage_daily',
    up: plus(1), down: plus(2), left: plus(5), right: save('rage_brain'),
  },
  {
    id: 'water', kind: 'ragebait', art: '💧', title: 'unpopular opinion: water is overrated', body: '40K comments', handle: '@hottakes',
    left: times(1.5), right: save('hate_follow'),
  },
  {
    id: 'pillow', kind: 'ragebait', art: '🛏️', title: 'HEALTH SCARE: your pillow is killing you', body: 'doctors HATE this', handle: '@wellness.truth',
    up: plus(3), down: plus(-1), left: plus(10), right: save('doomer'),
  },
  {
    id: 'generations', kind: 'ragebait', art: '👴🆚🧒', title: 'boomers vs zoomers: the final battle', handle: '@debatebros',
    up: plus(1), left: plus(3), right: save('reply_guy'),
  },
  {
    id: 'local_man', kind: 'ragebait', art: '🤬', title: 'local man ruins everything for everyone', body: 'we found his linkedin', handle: '@mainchar',
    up: plus(2), right: save('fomo'),
  },
  {
    id: 'ratio', kind: 'ragebait', art: '🗳️', title: 'political post (ratio\'d)', body: 'the replies are a warzone', handle: '@politicsguy',
    minHour: 1, up: plus(2), down: plus(2), left: times(3), right: save('echo_chamber', { gain: -5, label: '−5 · 🔊 echo' }),
  },
  {
    id: 'rage_farm', kind: 'ragebait', art: '🎣', title: 'I\'m going to say something controversial', body: 'pineapple goes on pizza. and so does ketchup.', handle: '@bait',
    minHour: 1, up: plus(1), left: plus(4), right: save('engagement_farmer'),
  },

  /* conspiracy — weird maths */
  {
    id: 'moon', kind: 'conspiracy', art: '🌕', title: 'the moon landing was filmed in a block game', body: 'look at the pixels. LOOK AT THEM.', handle: '@truthseeker',
    up: plus(-1), down: plus(3), left: { gain: (c) => c.s.dopa * 0.5, label: '+½ DOPA', tone: 'risky' },
    right: save('pattern_seeker', { gain: -10, label: '−10 · 🔺' }),
  },
  {
    id: 'birds', kind: 'conspiracy', art: '🐦', title: 'birds aren\'t real (part 47)', body: 'why do they sit on power lines? charging.', handle: '@birdtruth',
    up: plus(0), down: plus(0), left: times(2), right: save('double_tap', { gain: -3, label: '−3 · ✌️ ×2↑' }),
  },
  {
    id: 'algo_alive', kind: 'conspiracy', art: '🤖', title: 'the algorithm is alive and it loves you', body: 'it made you a bot farm. put it next to something good.', handle: '@machine',
    minHour: 2, weight: 6, up: plus(2), right: save('bot_farm'),
  },
  {
    id: 'flat', kind: 'conspiracy', art: '🥏', title: 'flat earth speedrun any%', handle: '@edgeoftheworld',
    minHour: 2, weight: 6, up: plus(1), left: plus(3), right: save('mirror'),
  },

  /* crypto */
  {
    id: 'dope_coin', kind: 'crypto', art: '🚀', title: '$DOPE coin to the moon', body: 'not financial advice (it is)', handle: '@cryptochad',
    minHour: 1, up: plus(1), left: plus(3, { label: '+3 fud' }), right: save('crypto_bag', { label: 'buy the dip' }),
  },
  {
    id: 'nft', kind: 'crypto', art: '🐒', title: 'NFT of a sad pixel monkey', body: 'floor price: the floor', handle: '@jpegwhale',
    minHour: 1, up: plus(1), left: plus(4), right: save('sunk_cost', { gain: -4, label: '−4 · 🕳 hodl' }),
  },
  {
    id: 'rugpull', kind: 'crypto', art: '🧶', title: 'how I rug pulled 400 people (tutorial)', handle: '@anon',
    minHour: 2, up: plus(2), left: plus(8, { label: '+8 · ⛓', then: (g) => { if (!g.saveEffect('chain_letter')) g.toast('karma found no room'); } }),
    right: save('crypto_bag'),
  },

  /* brocult */
  {
    id: 'icebath', kind: 'brocult', art: '🧊', title: 'sigma morning routine: ice bath at 3am', body: 'sleep is for betas', handle: '@alphagrind',
    minHour: 2, up: plus(2), left: plus(3), right: save('brocult', { label: 'join 🗿' }),
  },
  {
    id: 'podcast', kind: 'brocult', art: '🎙️', title: 'alpha podcast clip (4 hours)', body: '"women want a man who—"', handle: '@hustlepod',
    minHour: 1, up: plus(2), left: plus(4), right: save('grindset'),
  },
  {
    id: 'grind', kind: 'brocult', art: '⚡', title: 'you\'re poor because you sleep', handle: '@grindset.lord',
    minHour: 2, up: plus(1), left: plus(3), right: save('hustle'),
  },

  /* dm / people */
  {
    id: 'stranger_dm', kind: 'dm', art: '📩', title: 'a stranger shared a reel with you', body: '"lol this is so you"', handle: '@user8829102',
    up: plus(1), left: plus(1), right: save('clout', { gain: -1, label: '−1 · 🌟' }),
  },
  {
    id: 'crush_story', kind: 'dm', art: '💘', title: 'your crush posted a story', body: 'at 2am. who are they with.', handle: '@crush',
    up: plus(2), down: plus(3), left: plus(-3, { label: '−3 cope' }), right: save('parasocial'),
  },
  {
    id: 'post_yourself', kind: 'system', art: '📸', title: 'share something?', body: 'post a selfie. it goes to your saved list and slowly goes viral.', handle: 'you',
    minHour: 1, unique: true, weight: 6, up: plus(0), left: plus(1, { label: '+1 no' }), right: save('your_post', { label: 'post it' }),
  },
  {
    id: 'screen_time', kind: 'system', art: '⏱️', title: 'screen time report', body: 'you scrolled 3,284 reels this week. up 400%.', handle: 'settings',
    minHour: 2, weight: 5, left: plus(5, { label: '+5 dismiss' }), right: save('touch_grass'),
  },

  /* ads */
  ad({
    id: 'detox_ad', art: '🍵', title: 'SuperCleanse™ Detox Tea', body: 'lose 10kg of toxins (they are your organs)', handle: 'Sponsored · SuperCleanse', brand: 'supercleanse',
    ad: { minutes: 4, reward: 3 }, right: save('microplastics', { gain: 5, label: '+5 · 🧴' }),
  }),
  ad({
    id: 'game_ad', art: '🎮', title: 'Mobile Game Ad (fake gameplay)', body: 'only 1% can solve this. (the game is not this)', handle: 'Sponsored · RaidKingdoms', brand: 'raid',
    ad: { minutes: 3, reward: 4 },
  }),
  ad({
    id: 'vpn_ad', art: '🔒', title: 'this reel is sponsored by a VPN', body: 'hackers are in your wifi RIGHT NOW', handle: 'Sponsored · ShadyVPN', brand: 'vpn',
    minHour: 1, ad: { minutes: 5, reward: 6 }, right: save('ad_blocker', { gain: -4, label: '−4 · 🛡' }),
  }),
  ad({
    id: 'course_ad', art: '💸', title: 'I made $40K in a week. here\'s my course', body: 'step 1: sell a course', handle: 'Sponsored · GuruMax', brand: 'guru',
    minHour: 1, ad: { minutes: 6, reward: 5 }, right: save('hustle', { gain: -3, label: '−3 · ⚡' }),
  }),
  ad({
    id: 'rolex_ad', art: '⌚', title: 'PREMIUM: luxury watch for wolves', body: 'unskippable. try it.', handle: 'Premium · WolfTime', brand: 'wolf',
    minHour: 2, weight: 4, ad: { minutes: 10, reward: 15, premium: true }, right: save('premium_sub', { gain: -10, label: 'BUY −10 · 💎' }),
  }),
  ad({
    id: 'meta_ad', art: '🥽', title: 'PREMIUM: metaverse real estate', body: 'own land that does not exist', handle: 'Premium · MetaLand', brand: 'metaland',
    minHour: 3, weight: 4, ad: { minutes: 12, reward: 18, premium: true }, right: save('premium_sub', { gain: -12, label: 'BUY −12 · 💎' }),
  }),

  /* the user's original design examples — kept literally-ish */
  {
    id: 'content', kind: 'cursed', art: '♾️', title: 'everything is content', body: 'right burns every bridge behind you.\nleft inverts every saved effect.', handle: '@void',
    minHour: 2, weight: 3, up: plus(0), down: plus(0),
    right: { gain: (c) => c.s.dopa * 4, label: '×5 DOPA · burn bridges', tone: 'risky', then: (g) => g.burnBridges() },
    left: { gain: (c) => c.s.dopa * 9, label: '×10 DOPA · invert all', tone: 'risky', then: (g) => g.invertEffects() },
  },

  /* cursed — late night */
  {
    id: 'looking_back', kind: 'cursed', art: '👁️', title: 'THE FEED IS LOOKING BACK', body: 'it knows what you watched at 01:13', handle: '@@@@',
    minHour: 3, weight: 5, up: plus(6), down: blocked("don't turn around"), left: { gain: (c) => -Math.abs(c.s.dopa) * 0.5, label: '−½ DOPA', tone: 'bad' }, right: save('night_owl'),
  },
  {
    id: 'corrupted', kind: 'cursed', art: '▓▒░', title: '▓▓▓ CORRUPTED REEL ▓▓▓', body: 'r̷e̸a̵d̶ ̵t̸h̷e̸ ̴e̶d̵g̸e̸s̵', handle: '@null',
    minHour: 3, weight: 4,
    onEnter: (g, card) => { card.data.u = Math.round(g.rand() * 16 - 5); card.data.l = Math.round(g.rand() * 20 - 8); },
    up: { gain: (c) => c.card.data.u ?? 0, label: '???' },
    left: { gain: (c) => c.card.data.l ?? 0, label: '???' },
    right: save('chain_letter', { label: '??? ⛓' }),
  },
  {
    id: 'three_am', kind: 'cursed', art: '🕒', title: 'don\'t watch this at 3am', body: 'you are watching this at 3am', handle: '@creepypasta',
    minHour: 3, maxHour: 4, weight: 6, up: plus(4), down: plus(-2), left: times(2), right: save('main_character'),
  },
];

export const ALL_CARDS: CardDef[] = [...INTRO, ...POOL];
export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));
