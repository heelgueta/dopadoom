/**
 * BOSSES — the last CFG.BOSS_MINUTES of every fake hour. One is rolled per hour
 * and previewed in the HUD ("boss @ :50"), Balatro boss-blind style. During the
 * window, drain is × CFG.BOSS_DRAIN_MULT (× extraDrain) and the boss's rule
 * applies. The final hour always gets THE SUNRISE.
 */
import type { BossDef } from '../types';

export const BOSSES: BossDef[] = [
  { id: 'algorithm', name: 'THE ALGORITHM', icon: '👁', desc: 'just hungry. drain doubles.', minHour: 0 },
  { id: 'shadowban', name: 'SHADOWBAN', icon: '🔇', desc: '↓ back is disabled.', minHour: 1, blockDirs: ['down'] },
  { id: 'engagement', name: 'ENGAGEMENT FARM', icon: '🚜', desc: 'no base gain. only cards + effects count.', minHour: 1, baseGain: 0 },
  { id: 'outrage', name: 'OUTRAGE CYCLE', icon: '📢', desc: 'the feed is only ragebait & conspiracy.', minHour: 1, kindBias: ['ragebait', 'conspiracy'] },
  { id: 'adbreak', name: 'AD BREAK', icon: '📺', desc: 'every other reel is an ad.', minHour: 2, adEvery: 2 },
  { id: 'mirror', name: 'MIRROR WORLD', icon: '🪞', desc: '← and → are swapped.', minHour: 2, swapLR: true },
  { id: 'autoplay', name: 'AUTOPLAY', icon: '⏩', desc: 'the feed scrolls itself. you can\'t stay.', minHour: 3, autoplay: true },
  { id: 'brainrot', name: 'BRAINROT', icon: '🫠', desc: 'you can\'t read the edges anymore.', minHour: 3, scramble: true },
  { id: 'lowbatt', name: 'LOW BATTERY 3%', icon: '🪫', desc: 'screen dims. drain ×1.5 more.', minHour: 4, extraDrain: 1.5, dim: true },
  { id: 'burnout', name: 'BURNOUT', icon: '🕯', desc: 'all gains ×0.5.', minHour: 4, gainMult: 0.5 },
];

/** always the boss of the last hour before VICTORY_HOUR */
export const SUNRISE: BossDef = {
  id: 'sunrise', name: 'THE SUNRISE', icon: '🌅', desc: 'birds are chirping. drain ×2 more.', minHour: 99, extraDrain: 2,
};
