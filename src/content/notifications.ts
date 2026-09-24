/**
 * NOTIFICATIONS — banners that drop over the feed (CFG.NOTIF_CHANCE_PER_MIN).
 * tap = open · swipe the banner away = dismiss · wait it out = ignore.
 * Each outcome is a tiny function against the GameApi.
 */
import type { NotifDef } from '../types';

export const NOTIFS: NotifDef[] = [
  {
    id: 'mom', icon: '👩', from: 'Mom', text: 'are you sleeping??',
    open: { label: 'you replied "yes" (+2)', run: (g) => g.addDopa(2, '👩 lie') },
    dismiss: { label: 'guilt (−1)', run: (g) => g.addDopa(-1, '👩 guilt') },
    ignore: { label: 'she called. twice. (−2)', run: (g) => g.addDopa(-2, '👩 missed call') },
  },
  {
    id: 'groupchat', icon: '💬', from: 'the group chat', text: '47 new messages',
    open: { label: '+5, but lost 3 minutes', run: (g) => { g.addDopa(5, '💬 drama'); g.skipMinutes(3); } },
    dismiss: { label: 'muted', run: () => {} },
    ignore: { label: 'fomo (−1)', run: (g) => g.addDopa(-1, '💬 fomo') },
  },
  {
    id: 'ex', icon: '🥀', from: 'ex', text: 'u up?',
    open: { label: 'coin flip: ±10', run: (g) => g.addDopa(g.rand() < 0.5 ? 10 : -10, '🥀 u up') },
    dismiss: { label: 'growth (+3)', run: (g) => g.addDopa(3, '🥀 growth') },
    ignore: { label: 'left on read', run: () => {} },
  },
  {
    id: 'bank', icon: '🏦', from: 'Bank', text: 'your balance is low',
    open: { label: 'ouch (−3)', run: (g) => g.addDopa(-3, '🏦 reality') },
    dismiss: { label: 'denial (+1)', run: (g) => g.addDopa(1, '🏦 denial') },
    ignore: { label: 'nothing happened', run: () => {} },
  },
  {
    id: 'algo', icon: '👁', from: 'The Algorithm', text: "we noticed you're still awake. want a gift?", minHour: 1, weight: 6,
    open: {
      label: 'a random effect appears',
      run: (g) => {
        const pool = ['algo_boost', 'cat_tax', 'streak', 'fomo', 'rage_brain', 'bot_farm', 'brand_loyalty'];
        const id = g.pick(pool);
        if (!g.saveEffect(id)) g.toast('saved list full. the gift dissolves.', 'bad');
      },
    },
    dismiss: { label: 'it remembers (−2)', run: (g) => g.addDopa(-2, '👁') },
    ignore: { label: 'it remembers more (−4)', run: (g) => g.addDopa(-4, '👁') },
  },
  {
    id: 'screentime', icon: '⏱️', from: 'Screen Time', text: 'you averaged 9h 41m a day this week',
    open: { label: 'shame (+1?)', run: (g) => g.addDopa(1, '⏱️') },
    dismiss: { label: 'swiped (+1)', run: (g) => g.addDopa(1, '⏱️') },
    ignore: { label: '', run: () => {} },
  },
  {
    id: 'pump', icon: '🚀', from: '$DOPE alerts', text: '$DOPE is pumping 🚀🚀🚀', minHour: 1,
    open: {
      label: 'bags ×2 (or +2)',
      run: (g) => {
        const bag = g.s.saved.find((e) => e.def.id === 'crypto_bag');
        if (bag) { bag.data.price = Math.min(4, (bag.data.price ?? 1) * 2); g.toast(`🪙 $DOPE ×${bag.data.price}`, 'good'); }
        else g.addDopa(2, '🚀');
      },
    },
    dismiss: { label: 'fomo (−1)', run: (g) => g.addDopa(-1, '🚀 fomo') },
    ignore: { label: '', run: () => {} },
  },
  {
    id: 'delivery', icon: '📦', from: 'Delivery', text: 'your package is delayed',
    open: { label: '−1', run: (g) => g.addDopa(-1, '📦') },
    dismiss: { label: '', run: () => {} },
    ignore: { label: '', run: () => {} },
  },
  {
    id: 'cult', icon: '🗿', from: 'Brother Chad', text: 'the 4am call starts now. camera on.', minHour: 3,
    open: {
      label: '+8, drain +20% this hour',
      run: (g) => {
        g.addDopa(8, '🗿 call');
        g.addMod({ id: 'cultcall', icon: '🗿', label: '4am call', drainMult: 1.2, untilMinute: (g.hourNow() + 1) * 60 });
      },
    },
    dismiss: { label: 'brother is disappointed (−3)', run: (g) => g.addDopa(-3, '🗿') },
    ignore: { label: '−2', run: (g) => g.addDopa(-2, '🗿') },
  },
  {
    id: 'like', icon: '❤️', from: 'someone', text: 'liked your post', minHour: 1,
    open: { label: '+3', run: (g) => g.addDopa(3, '❤️') },
    dismiss: { label: '+1', run: (g) => g.addDopa(1, '❤️') },
    ignore: { label: '+1', run: (g) => g.addDopa(1, '❤️') },
  },
];
