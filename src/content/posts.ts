/**
 * POST TYPES — placeholders on purpose. Theme comes later; right now a type
 * is just a name, a border colour and a few number templates.
 *
 * Template notation (see engine/ops.ts):
 *   'u+1 d+1 lx2 r+1 | +2u'
 *    ↑+1  ↓+1  ←×2  →+1    saving it gives you "+2 on every ↑"
 *   B = block value (kebab menu, default ±0), R = report (default −2)
 *   ?x2,/2 = coin flip
 *
 * Border colours avoid red/blue — those mean − and + on the numbers.
 */
import type { PostType } from '../types';

export const POST_TYPES: PostType[] = [
  {
    id: 'post', name: 'POST', color: '#e8e8e8', weight: 26,
    templates: [
      'u+1 d+1 l+1 r+1',
      'u+1 d+1 l+2 r+1 | +1r',
      'u+1 d+1 l-1 r+2 | +1u',
      'u+2 d+1 l+0 r+1',
    ],
  },
  {
    id: 'meme', name: 'MEME', color: '#5dff7a', weight: 18,
    templates: [
      'u+1 d+1 l-1 r+2 | +1r',
      'u+2 d+1 l-1 r+2 | +1u',
      'u+1 d+2 l+1 r+3',
    ],
  },
  {
    id: 'cute', name: 'CUTE', color: '#f2a8ff', weight: 12,
    templates: [
      'u+2 d+2 l-3 r+3 | +2d',
      'u+1 d+3 l-2 r+2 | +1a',
    ],
  },
  {
    id: 'rage', name: 'RAGEBAIT', color: '#a45cff', weight: 12,
    templates: [
      'u+2 d-2 lx1.5 r-3 B+1 | +2l',
      'u+3 d-1 l+4 r-3 B+1 | +3l',
      'u+2 d+0 l+3 r-4 B+1',
    ],
  },
  {
    id: 'fake', name: 'FAKE NEWS', color: '#a45cff', weight: 8, border: 'dashed',
    templates: [
      'u+1 d+1 l+2 r/2 R+6',
      'u+2 d+0 l+1 r-3 R+5 | +2r -1u',
    ],
  },
  {
    id: 'satisfying', name: 'SATISFYING', color: '#ffffff', weight: 4, border: 'rainbow',
    templates: [
      'u+4 d+3 l-3 r+4 | x1.5u',
      'u+5 d+2 l-2 r+3 | x2d',
    ],
  },
  {
    id: 'crypto', name: 'CRYPTO', color: '#ffb000', weight: 7,
    templates: [
      'u+1 d-1 l+2 r?x2,/2',
      'u+1 d+0 l+1 r?x1.5,/1.5 | x2u -1a',
    ],
  },
  {
    id: 'grind', name: 'GRINDSET', color: '#9a9a9a', weight: 7, border: 'double',
    templates: [
      'u+3 d-2 l+1 r+1 | +3u -2d',
      'u+2 d-1 l+2 r+0 | +1u',
    ],
  },
];

/**
 * The very first post of every run (your design): ↑+1 ↓+1 ←×2 →+1, save +2↑.
 * ×DOPA ops multiply your whole total, so they're rare and small in the pool.
 */
export const TUTORIAL = 'u+1 d+1 lx2 r+1 | +2u';

/** what an ad turns into once you've watched it */
export const AD_TYPE: PostType = {
  id: 'ad', name: 'AD', color: '#ffe14d', weight: 0,
  templates: ['u+3 d+1 l-1 r+1 | -1a'],
};

export const PREMIUM_TYPE: PostType = {
  id: 'premium', name: 'PREMIUM AD', color: '#ffe14d', weight: 0, border: 'double',
  templates: ['u+10 d+2 l-2 r+2 | x1.5a'],
};

/** mods the ALGORITHM notification can gift you */
export const GIFTS = ['+1u', 'x1.5u', '+2r', '+1a', '-1a', '+2l', '+3d'];
