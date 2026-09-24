/**
 * CONFIG — every tunable number in the game lives here.
 *
 * The in-game TWEAKS panel (⏸ → tweaks) edits this object live and persists
 * your overrides in localStorage, so you can tune on your phone without
 * redeploying. When something feels right, copy the JSON from the panel and
 * paste the values into DEFAULTS below to make them the new baseline.
 *
 * Rule: no magic numbers elsewhere. If you catch yourself hardcoding a
 * balance value in engine/ or content/, move it here.
 */

const DEFAULTS = {
  // ── economy ─────────────────────────────────────────────
  START_DOPA: 10,
  /** base dopa for an up/down swipe, before card + saved effects */
  BASE_SWIPE_GAIN: 1,
  /** if true, a right-swipe (save) also gets the base gain */
  SAVE_GIVES_BASE: false,
  /** each repeat of the same swipe on the same card loses this fraction (1 → .9 → .8 …) */
  REPEAT_DECAY_STEP: 0.1,
  /** floor for the repeat-decay multiplier */
  REPEAT_DECAY_MIN: 0,
  /** dopa lost when you try a disabled swipe */
  BAD_SWIPE_PENALTY: 1,
  /** saved-effect slots at run start */
  SAVED_SLOTS: 5,
  /** hard cap for slots (chargers etc. can raise SAVED_SLOTS up to this) */
  MAX_SLOTS: 8,

  // ── time ────────────────────────────────────────────────
  /** at 1× speed, how many real seconds one fake minute takes (1 → 1 hour = 60s, full night = 8min) */
  REAL_SECONDS_PER_FAKE_MINUTE: 1,
  /** game speed multiplier (testing lever, not a mechanic yet) */
  SPEED: 1,
  /** reach this hour to win (8 → 08:00) */
  VICTORY_HOUR: 8,
  /** show the between-hours choice screen */
  HOUR_BREAKS: true,
  /** pause the clock while a sheet (effect detail, tweaks) is open */
  PAUSE_ON_SHEET: true,

  // ── drain ───────────────────────────────────────────────
  /** dopa lost per fake minute during hour 0 */
  DRAIN_BASE: 0.4,
  /** drain grows by this fraction per hour: base × (1 + growth × hour) × exp^hour */
  DRAIN_HOUR_GROWTH: 0.35,
  /** exponential hourly drain growth (balatro blinds). 1 = off */
  DRAIN_HOUR_EXP: 1.6,
  /** TOLERANCE: extra drain = this fraction of your positive dopa, per fake minute. stops hoarding */
  DRAIN_TOLERANCE: 0.01,
  /** the last N fake minutes of every hour are the BOSS window */
  BOSS_MINUTES: 10,
  /** drain multiplier during the boss window */
  BOSS_DRAIN_MULT: 2,
  /** drain multiplier while trapped on a premium-ad website */
  WEBSITE_DRAIN_MULT: 3,
  /** drain multiplier while dopa is below zero (the drowsy spiral) */
  NEGATIVE_DRAIN_MULT: 1.5,

  // ── sleep ───────────────────────────────────────────────
  /** you fall asleep when dopa ≤ this. negative = beta grace zone */
  SLEEP_AT: -10,
  /** below this dopa your eyes start closing (visual only) */
  DROWSY_AT: 3,
  /** never fall asleep (for exploring content) */
  GOD_MODE: false,

  // ── spawns / events ─────────────────────────────────────
  /** chance per fake minute that a notification pops up */
  NOTIF_CHANCE_PER_MIN: 0.07,
  /** fake minutes a notification stays before counting as ignored */
  NOTIF_LIFETIME_MIN: 6,
  /** dopa cost per remaining fake minute when you skip an ad early */
  AD_SKIP_COST_PER_MIN: 1,
  /** AUTOPLAY boss: forced up-swipe every N fake minutes */
  AUTOPLAY_EVERY_MIN: 2,
  /** show the scripted intro cards at run start */
  INTRO_CARDS: true,

  // ── feel ────────────────────────────────────────────────
  /** drag distance (px) to commit a swipe (slik used 100) */
  SWIPE_THRESHOLD_PX: 90,
  /** a fast flick commits even under the threshold (px/ms) */
  FLICK_VELOCITY: 0.5,
  /** movement (px) before the gesture locks to an axis */
  AXIS_LOCK_PX: 10,
  /** card fly-out / fly-in duration (ms) */
  ANIM_MS: 220,
  /** how much a disabled direction resists the drag (0 = frozen, 1 = free) */
  RUBBER_BAND: 0.3,
  SOUND: true,
  HAPTICS: true,
  /** show the balatro-style scoring breakdown under the HUD */
  SHOW_BREAKDOWN: true,
  /** show computed "= +3.4" previews on card edges */
  SHOW_PREVIEWS: true,
  /** scanline overlay */
  CRT: true,
};

export type Config = { -readonly [K in keyof typeof DEFAULTS]: (typeof DEFAULTS)[K] };
export type ConfigKey = keyof Config;

const STORAGE_KEY = 'dopadoom.config.v1';

function loadOverrides(): Partial<Config> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Config>) : {};
  } catch {
    return {};
  }
}

/** The live config. Mutated by the tweaks panel. Read it at use-time, don't cache values. */
export const CFG: Config = { ...DEFAULTS, ...loadOverrides() };

export function defaults(): Config {
  return { ...DEFAULTS };
}

/** Persist only values that differ from DEFAULTS. */
export function saveConfig(): void {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULTS) as ConfigKey[]) {
    if (CFG[k] !== DEFAULTS[k]) diff[k] = CFG[k];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
  } catch {
    /* private mode etc — tweaks just won't persist */
  }
}

export function resetConfig(): void {
  Object.assign(CFG, DEFAULTS);
  saveConfig();
}

export function configDiff(): Partial<Config> {
  const diff: Partial<Config> = {};
  for (const k of Object.keys(DEFAULTS) as ConfigKey[]) {
    if (CFG[k] !== DEFAULTS[k]) (diff as Record<string, unknown>)[k] = CFG[k];
  }
  return diff;
}

/* ── metadata for the tweaks panel ─────────────────────────────────────── */

export interface FieldMeta {
  key: ConfigKey;
  group: string;
  /** shown under the control in the tweaks panel */
  desc: string;
  min?: number;
  max?: number;
  step?: number;
  /** discrete choices for number fields (renders as buttons) */
  choices?: number[];
}

export const FIELDS: FieldMeta[] = [
  { key: 'SPEED', group: 'time', desc: 'game speed. 1× = 1 fake hour per minute', choices: [0.25, 0.5, 1, 2, 4] },
  { key: 'REAL_SECONDS_PER_FAKE_MINUTE', group: 'time', desc: 'real seconds per fake minute at 1×', min: 0.25, max: 10, step: 0.25 },
  { key: 'VICTORY_HOUR', group: 'time', desc: 'survive until this hour to win', min: 1, max: 12, step: 1 },
  { key: 'HOUR_BREAKS', group: 'time', desc: 'show the coffee/choices screen every hour' },
  { key: 'PAUSE_ON_SHEET', group: 'time', desc: 'freeze the clock while an effect sheet is open' },

  { key: 'START_DOPA', group: 'economy', desc: 'dopa at the start of a run (needs restart)', min: 0, max: 100, step: 1 },
  { key: 'BASE_SWIPE_GAIN', group: 'economy', desc: 'base gain for ↑ / ↓', min: 0, max: 5, step: 0.1 },
  { key: 'SAVE_GIVES_BASE', group: 'economy', desc: '→ save also gets the base gain' },
  { key: 'REPEAT_DECAY_STEP', group: 'economy', desc: 'repeat swipes on the same card lose this much each time', min: 0, max: 1, step: 0.05 },
  { key: 'REPEAT_DECAY_MIN', group: 'economy', desc: 'repeat decay never goes below this multiplier', min: 0, max: 1, step: 0.05 },
  { key: 'BAD_SWIPE_PENALTY', group: 'economy', desc: 'dopa lost on a disabled swipe', min: 0, max: 10, step: 0.5 },
  { key: 'SAVED_SLOTS', group: 'economy', desc: 'saved slots at run start (needs restart)', min: 1, max: 8, step: 1 },
  { key: 'MAX_SLOTS', group: 'economy', desc: 'slot cap (phone chargers raise slots up to this)', min: 1, max: 8, step: 1 },

  { key: 'DRAIN_BASE', group: 'drain', desc: 'dopa drained per fake minute in hour 0', min: 0, max: 3, step: 0.05 },
  { key: 'DRAIN_HOUR_GROWTH', group: 'drain', desc: 'drain × (1 + this × hour)', min: 0, max: 2, step: 0.05 },
  { key: 'DRAIN_HOUR_EXP', group: 'drain', desc: 'drain × this^hour (exponential ramp)', min: 1, max: 3, step: 0.05 },
  { key: 'DRAIN_TOLERANCE', group: 'drain', desc: 'tolerance: lose this fraction of positive dopa per fake minute', min: 0, max: 0.1, step: 0.005 },
  { key: 'BOSS_MINUTES', group: 'drain', desc: 'boss window length at the end of each hour', min: 0, max: 30, step: 1 },
  { key: 'BOSS_DRAIN_MULT', group: 'drain', desc: 'drain multiplier during bosses', min: 1, max: 5, step: 0.25 },
  { key: 'WEBSITE_DRAIN_MULT', group: 'drain', desc: 'drain multiplier while trapped on a website', min: 1, max: 10, step: 0.5 },
  { key: 'NEGATIVE_DRAIN_MULT', group: 'drain', desc: 'drain multiplier while dopa < 0', min: 0.5, max: 5, step: 0.25 },

  { key: 'SLEEP_AT', group: 'sleep', desc: 'you fall asleep at this dopa', min: -50, max: 0, step: 1 },
  { key: 'DROWSY_AT', group: 'sleep', desc: 'eyes start closing below this', min: -10, max: 20, step: 1 },
  { key: 'GOD_MODE', group: 'sleep', desc: 'never fall asleep' },

  { key: 'NOTIF_CHANCE_PER_MIN', group: 'events', desc: 'notification chance per fake minute', min: 0, max: 1, step: 0.01 },
  { key: 'NOTIF_LIFETIME_MIN', group: 'events', desc: 'fake minutes before a notification counts as ignored', min: 1, max: 30, step: 1 },
  { key: 'AD_SKIP_COST_PER_MIN', group: 'events', desc: 'skip-ad cost per remaining fake minute', min: 0, max: 5, step: 0.25 },
  { key: 'AUTOPLAY_EVERY_MIN', group: 'events', desc: 'AUTOPLAY boss scrolls every N fake minutes', min: 1, max: 10, step: 1 },
  { key: 'INTRO_CARDS', group: 'events', desc: 'scripted intro cards (needs restart)' },

  { key: 'SWIPE_THRESHOLD_PX', group: 'feel', desc: 'drag distance to commit a swipe', min: 30, max: 200, step: 5 },
  { key: 'FLICK_VELOCITY', group: 'feel', desc: 'flick speed that commits early (px/ms)', min: 0.1, max: 2, step: 0.05 },
  { key: 'AXIS_LOCK_PX', group: 'feel', desc: 'movement before locking to vertical/horizontal', min: 2, max: 40, step: 1 },
  { key: 'ANIM_MS', group: 'feel', desc: 'card animation duration', min: 60, max: 600, step: 10 },
  { key: 'RUBBER_BAND', group: 'feel', desc: 'how far a disabled direction lets you drag', min: 0, max: 1, step: 0.05 },
  { key: 'SOUND', group: 'feel', desc: 'bleeps' },
  { key: 'HAPTICS', group: 'feel', desc: 'vibration (android only, iOS blocks it)' },
  { key: 'SHOW_BREAKDOWN', group: 'feel', desc: 'scoring breakdown line under the HUD' },
  { key: 'SHOW_PREVIEWS', group: 'feel', desc: 'computed totals on card edges' },
  { key: 'CRT', group: 'feel', desc: 'scanlines' },
];
