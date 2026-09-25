/**
 * CONFIG — every tunable number. The in-game TWEAKS panel edits this live and
 * saves overrides on the device. "copy config" → paste into DEFAULTS to make
 * a tweak the new baseline. No balance numbers anywhere else.
 */

const DEFAULTS = {
  // ── core ────────────────────────────────────────────────
  START_DOPA: 10,
  /** you fall asleep at or below this */
  SLEEP_AT: -10,
  /** never fall asleep (for poking around) */
  GOD_MODE: false,
  SAVE_SLOTS: 5,
  /** repeat ↑/↓ on the same post: value × (1 − step × times) */
  REPEAT_DECAY_STEP: 0.1,
  /** dopa lost when you try something that isn't allowed */
  BAD_MOVE_PENALTY: 1,

  // ── pacing / feedback ───────────────────────────────────
  /** show the scoring tally between posts (input is locked while it plays) */
  FEEDBACK: true,
  /** ms per step of the tally (base, each saved effect, decay…) */
  TALLY_STEP_MS: 220,
  /** ms the final result stays before the next post slides in */
  TALLY_HOLD_MS: 280,
  /** extra ms when a check (upkeep / quota) happens */
  CHECK_HOLD_MS: 900,

  // ── night / clock ───────────────────────────────────────
  /** win at this fake hour (8 → 08:00) */
  WIN_HOUR: 8,
  /** turn modes: fake minutes per action (5 → 12 actions per hour, 96 to win) */
  MIN_PER_TURN: 5,

  // ── mode: UPKEEP ────────────────────────────────────────
  /** every N actions you pay upkeep */
  UPKEEP_EVERY: 12,
  UPKEEP_BASE: 10,
  /** upkeep × this every time it's paid */
  UPKEEP_GROWTH: 1.6,

  // ── mode: QUOTA ─────────────────────────────────────────
  /** every N actions you must HAVE at least the quota (not spent) */
  QUOTA_EVERY: 12,
  QUOTA_BASE: 15,
  QUOTA_GROWTH: 1.85,

  // ── mode: CLOCK (real time) ─────────────────────────────
  /** real seconds per fake minute (1 → 1 hour per real minute, 8 min run) */
  CLOCK_SEC_PER_MIN: 1,
  /** dopa drained per real second in hour 0 */
  CLOCK_DRAIN: 0.5,
  /** drain × (1 + growth × hour) */
  CLOCK_DRAIN_GROWTH: 0.5,
  /** TOLERANCE: also lose this fraction of your (positive) dopa per second. stops hoarding */
  CLOCK_TOLERANCE: 0.01,

  // ── ads ─────────────────────────────────────────────────
  /** roughly one ad every N posts */
  AD_EVERY: 7,
  /** chance an ad is PREMIUM (website trap) */
  PREMIUM_CHANCE: 0.25,
  AD_SECS_MIN: 3,
  AD_SECS_MAX: 5,
  PREMIUM_SECS: 8,
  /** each skip attempt costs tries × this */
  AD_TRY_COST: 1,
  /** each skip attempt adds this many seconds */
  AD_TRY_ADD_SECS: 1,
  /** dopa lost per second while trapped on a website */
  WEBSITE_DRAIN: 1,
  /** real X taps needed to escape */
  WEBSITE_POPUPS: 3,

  // ── notifications ───────────────────────────────────────
  /** chance per action that a notification pops */
  NOTIF_CHANCE: 0.18,
  /** real seconds before it counts as WAIT (ignored) */
  NOTIF_SECS: 5,

  // ── feel ────────────────────────────────────────────────
  SWIPE_THRESHOLD_PX: 80,
  FLICK_VELOCITY: 0.5,
  AXIS_LOCK_PX: 10,
  ANIM_MS: 200,
  SOUND: true,
  HAPTICS: true,
  CRT: true,
};

export type Config = { -readonly [K in keyof typeof DEFAULTS]: (typeof DEFAULTS)[K] };
export type ConfigKey = keyof Config;

const STORAGE_KEY = 'dopadoom2.config';

function loadOverrides(): Partial<Config> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Config>) : {};
  } catch {
    return {};
  }
}

export const CFG: Config = { ...DEFAULTS, ...loadOverrides() };

export function configDiff(): Partial<Config> {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULTS) as ConfigKey[]) if (CFG[k] !== DEFAULTS[k]) diff[k] = CFG[k];
  return diff as Partial<Config>;
}

export function saveConfig(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(configDiff())); } catch { /* ignore */ }
}

export function resetConfig(): void {
  Object.assign(CFG, DEFAULTS);
  saveConfig();
}

/* ── tweaks panel metadata ── */

export interface FieldMeta {
  key: ConfigKey;
  group: string;
  min?: number;
  max?: number;
  step?: number;
}

const f = (group: string, key: ConfigKey, min?: number, max?: number, step?: number): FieldMeta => ({ key, group, min, max, step });

export const FIELDS: FieldMeta[] = [
  f('core', 'START_DOPA', 0, 100, 1),
  f('core', 'SLEEP_AT', -50, 0, 1),
  f('core', 'GOD_MODE'),
  f('core', 'SAVE_SLOTS', 1, 8, 1),
  f('core', 'REPEAT_DECAY_STEP', 0, 0.5, 0.05),
  f('core', 'BAD_MOVE_PENALTY', 0, 5, 0.5),

  f('pacing', 'FEEDBACK'),
  f('pacing', 'TALLY_STEP_MS', 0, 800, 20),
  f('pacing', 'TALLY_HOLD_MS', 0, 1500, 20),
  f('pacing', 'CHECK_HOLD_MS', 0, 3000, 50),

  f('night', 'WIN_HOUR', 1, 12, 1),
  f('night', 'MIN_PER_TURN', 1, 30, 1),

  f('upkeep', 'UPKEEP_EVERY', 3, 30, 1),
  f('upkeep', 'UPKEEP_BASE', 0, 50, 1),
  f('upkeep', 'UPKEEP_GROWTH', 1, 3, 0.05),

  f('quota', 'QUOTA_EVERY', 3, 30, 1),
  f('quota', 'QUOTA_BASE', 0, 100, 1),
  f('quota', 'QUOTA_GROWTH', 1, 3, 0.05),

  f('clock', 'CLOCK_SEC_PER_MIN', 0.25, 10, 0.25),
  f('clock', 'CLOCK_DRAIN', 0, 3, 0.05),
  f('clock', 'CLOCK_DRAIN_GROWTH', 0, 2, 0.05),
  f('clock', 'CLOCK_TOLERANCE', 0, 0.05, 0.0025),

  f('ads', 'AD_EVERY', 2, 30, 1),
  f('ads', 'PREMIUM_CHANCE', 0, 1, 0.05),
  f('ads', 'AD_SECS_MIN', 1, 15, 1),
  f('ads', 'AD_SECS_MAX', 1, 20, 1),
  f('ads', 'PREMIUM_SECS', 1, 30, 1),
  f('ads', 'AD_TRY_COST', 0, 5, 0.5),
  f('ads', 'AD_TRY_ADD_SECS', 0, 5, 0.5),
  f('ads', 'WEBSITE_DRAIN', 0, 5, 0.25),
  f('ads', 'WEBSITE_POPUPS', 1, 10, 1),

  f('notifs', 'NOTIF_CHANCE', 0, 1, 0.02),
  f('notifs', 'NOTIF_SECS', 1, 20, 0.5),

  f('feel', 'SWIPE_THRESHOLD_PX', 30, 200, 5),
  f('feel', 'FLICK_VELOCITY', 0.1, 2, 0.05),
  f('feel', 'AXIS_LOCK_PX', 2, 40, 1),
  f('feel', 'ANIM_MS', 60, 600, 10),
  f('feel', 'SOUND'),
  f('feel', 'HAPTICS'),
  f('feel', 'CRT'),
];
