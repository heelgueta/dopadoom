# DOPADOOM

Stay awake until 08:00. The feed is your only friend.
A doomscroll roguelike: Balatro's scoring, a four-swipe reel feed, and a clock that drains your dopamine.

**Play:** https://heelgueta.github.io/dopadoom/. On your phone, use *Add to Home Screen* to get fullscreen.

## How it plays

| swipe | meaning | default |
|---|---|---|
| ↑ | **skip** to the next reel | +1 base |
| ↓ | **back** to the previous reel you didn't reject | +1 base |
| ← | **reject**: one-shot effect, the reel is gone forever | card-specific |
| → | **save**: puts the reel's effect in your saved strip (5 slots) | card-specific |

- Every edge of a card says what that swipe does. `= +3.4` is the real total, including your saved effects and repeat decay.
- **Saved effects** run left → right, so order matters (+2 then ×2 ≠ ×2 then +2). Tap a chip to move, delete, or sell it.
- **Repeat decay:** the same swipe on the same card is worth ×1, then ×0.9, then ×0.8 …
- **Clock:** 1 fake hour = 60 real seconds at 1×. Dopa drains every minute and the drain grows every hour. Holding lots of dopa also leaks faster (tolerance).
- **Bosses:** the last 10 minutes of every hour, drain ×2 plus a rule (shadowban, mirror world, autoplay, brainrot…). The next boss is shown in the HUD.
- **Hour breaks:** coffee, energy drink, melatonin, doom gamble…
- **Ads** can't be rejected while playing, and skipping early costs dopa. **Premium ads** trap you on a scam website until you find the real ✕.
- **Notifications:** tap to open, swipe to dismiss, or ignore them.
- Dopa can go **negative** (the drowsy zone: eyes close, drain speeds up). You fall asleep at −10.
- Desktop: arrow keys / WASD. Space = pause. `?seed=abc` replays a run.

## Tuning on your phone

⏸ → **tweaks & debug**. Every number in `src/config.ts` has a slider there. Changes are live and saved on that device. Debug buttons: +dopa, jump to boss, end hour, spawn a notification, show any card, give any effect.

When something feels right, tap **copy config JSON** and paste the values into `DEFAULTS` in `src/config.ts`. That makes them the new baseline for everyone.

## Dev

```bash
npm install
npm run dev          # http://localhost:5173, and on your LAN (the --host flag is on)
npm run build        # typecheck + production build → dist/
```

To test on a phone during dev, open `http://<your-computer-lan-ip>:5173` on the same wifi.

**Deploy:** push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to Pages in about a minute.

## Where things live

```
src/
  config.ts              ALL tunable numbers + tweak-panel metadata
  types.ts               data model (cards, effects, bosses, state, GameApi)
  engine/
    scoring.ts           THE gain pipeline: base → card → saved effects L→R → mods → boss → decay
    game.ts              rules + state + events. no DOM
  content/               ← where most future work happens
    cards.ts             every reel (helpers: plus, times, save, blocked, ad)
    effects.ts           every saved effect
    bosses.ts            end-of-hour bosses
    notifications.ts     banners
    choices.ts           hour-break options
  ui/
    app.ts               HUD, animations, overlays, sheets
    cardView.ts          card rendering + live edge previews
    gestures.ts          swipe recogniser (thresholds from config)
    tweaks.ts            the tweaks/debug panel
    audio.ts             synth bleeps + vibration
  styles.css             look & feel (placeholder art: colour per card kind)
```

**Add a card:** append an object to `POOL` in `content/cards.ts`.
**Add an effect:** append to `list` in `content/effects.ts` and reference its id from a card's `right: save('id')`.
The engine doesn't change for either.

## What to test first

Play 3 runs, then note:
1. When did you fall asleep? Too early or too late → `DRAIN_BASE`, `DRAIN_HOUR_EXP`, `DRAIN_TOLERANCE`.
2. Did you ever *want* to swipe down? If not, back-swipes need better card values.
3. Did saving feel worth a slot? Did you reorder chips?
4. Did you try farming ↑/↓ on the same cards? Did decay stop it without feeling bad?
5. Is 1× too fast or too slow? Try `SPEED` 0.5 / 2.
6. Swipe feel: `SWIPE_THRESHOLD_PX`, `FLICK_VELOCITY`, `ANIM_MS`.
