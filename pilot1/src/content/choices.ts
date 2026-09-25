/**
 * NIGHT CHOICES — shown at every :00 between hours (the "shop"). Three are
 * rolled, plus a free "keep scrolling". Temporary stuff uses a Modifier with
 * untilMinute = end of the coming hour.
 */
import type { ChoiceDef, GameApi } from '../types';

const nextHourEnd = (g: GameApi) => (g.hourNow() + 1) * 60;

export const CHOICES: ChoiceDef[] = [
  {
    id: 'coffee', icon: '☕', name: 'coffee', desc: '+12 dopa. drain +5% for the rest of the night (tolerance).',
    run: (g) => { g.addDopa(12, '☕'); g.addMod({ id: 'caffeine', icon: '☕', label: 'tolerance', drainMult: 1.05 }); },
  },
  {
    id: 'energy', icon: '🥤', name: 'energy drink', desc: '+25 dopa. next hour drain ×1.5 (the crash).',
    run: (g) => { g.addDopa(25, '🥤'); g.addMod({ id: 'crash', icon: '🥤', label: 'crash', drainMult: 1.5, untilMinute: nextHourEnd(g) }); },
  },
  {
    id: 'fridge', icon: '🧊', name: 'fridge raid', desc: '+8 dopa. cold pizza.',
    run: (g) => g.addDopa(8, '🧊'),
  },
  {
    id: 'bathroom', icon: '🚽', name: 'bathroom scroll', desc: '+3 dopa. resets repeat-decay on every card.',
    run: (g) => {
      g.addDopa(3, '🚽');
      for (const c of g.s.feed) c.leaves = { up: 0, down: 0, left: 0, right: 0 };
    },
  },
  {
    id: 'charger', icon: '🔌', name: 'charge phone', desc: '+1 saved slot. −10 dopa.', minHour: 1,
    run: (g) => {
      if (g.s.slots >= g.cfg.MAX_SLOTS) { g.toast('already max slots'); return; }
      g.s.slots++;
      g.addDopa(-10, '🔌');
    },
  },
  {
    id: 'purge', icon: '🧹', name: 'unfollow spree', desc: 'delete every curse for free. −5 dopa.',
    run: (g) => {
      const curses = g.s.saved.filter((e) => e.def.curse);
      for (const e of curses) g.removeEffect(e.uid, true);
      g.addDopa(-5, '🧹');
    },
  },
  {
    id: 'melatonin', icon: '💊', name: 'melatonin (lol)', desc: 'next hour: drain ×0.6, gains ×0.7.',
    run: (g) => g.addMod({ id: 'melatonin', icon: '💊', label: 'melatonin', drainMult: 0.6, gainMult: 0.7, untilMinute: nextHourEnd(g) }),
  },
  {
    id: 'gamble', icon: '🎰', name: 'doom gamble', desc: '50%: dopa ×2. 50%: dopa ×0.5.',
    run: (g) => {
      const d = g.s.dopa;
      g.addDopa(g.rand() < 0.5 ? d : -d / 2, '🎰');
    },
  },
  {
    id: 'nootropics', icon: '🧠', name: 'nootropics', desc: 'next hour: gains ×1.5, drain ×1.2.', minHour: 2,
    run: (g) => g.addMod({ id: 'noots', icon: '🧠', label: 'noots', gainMult: 1.5, drainMult: 1.2, untilMinute: nextHourEnd(g) }),
  },
  {
    id: 'window', icon: '🪟', name: 'open window', desc: 'next hour: drain ×0.85. fresh air.',
    run: (g) => g.addMod({ id: 'window', icon: '🪟', label: 'fresh air', drainMult: 0.85, untilMinute: nextHourEnd(g) }),
  },
  {
    id: 'stretch', icon: '🙆', name: 'stretch', desc: '+5 dopa.',
    run: (g) => g.addDopa(5, '🙆'),
  },
];
