/**
 * NOTIFICATIONS — banners over the feed. Each shows its three outcomes in the
 * same op notation:  TAP +2   SWIPE −1   WAIT −2
 * WAIT happens when its timer (CFG.NOTIF_SECS, real seconds) runs out.
 * Special outcomes: 'website' (premium-ad trap), 'gift' (random saved effect).
 */
import { parseOp } from '../engine/ops';
import type { NotifDef, OutcomeDef } from '../types';

const o = (s: string): OutcomeDef =>
  s === 'WEB' ? { special: 'website' } : s === 'GIFT' ? { special: 'gift' } : { op: parseOp(s) };

/** from, tap, swipe, wait */
const n = (id: string, from: string, tap: string, swipe: string, wait: string, weight = 10): NotifDef => ({
  id, from, tap: o(tap), swipe: o(swipe), wait: o(wait), weight,
});

export const NOTIFS: NotifDef[] = [
  n('mom', 'MOM', '+2', '-1', '-2'),
  n('group', 'GROUP CHAT', '+3', '+0', '-1'),
  n('ex', 'EX', '?+8,-8', '+2', '+0', 6),
  n('bank', 'BANK', '-3', '+1', '+0'),
  n('like', 'NEW LIKE', '+3', '+1', '+1'),
  n('friend', 'FRIEND', '+2', '-1', '-1'),
  n('work', 'WORK', '-4', '-1', '+1', 6),
  n('streak', 'STREAK', '+2', '-3', '-3'),
  n('spam', 'YOU WON', 'WEB', '+1', '+0', 6),
  n('algo', 'THE ALGORITHM', 'GIFT', '-2', '-1', 5),
  n('coupon', 'COUPON', 'x1.1', '+0', '+0', 5),
];
