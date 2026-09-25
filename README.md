# DOPADOOM

Stay awake until 08:00 by scrolling the feed. **v3.**

**Play:** https://heelgueta.github.io/dopadoom/
Old versions (also linked from the main menu): [pilot 1](https://heelgueta.github.io/dopadoom/pilot1/) · [v2](https://heelgueta.github.io/dopadoom/v2/). Their code is in `pilot1/` and `v2/`, and they're git tags `pilot1` and `v2`.

## Rules

**DOPA** = your points. Posts show only numbers: what each swipe adds, and what saving gives.

| input | does | then |
|---|---|---|
| swipe ↑ skip / ↓ back | ± the post's number (↓ goes to the previous non-blocked post) | move |
| swipe ← dislike / → like | ± the post's number | move |
| same reaction again | +0 | move |
| opposite reaction | dopa × 0.9 | move |
| bookmark: SAVE | adds the post's effect to your chips. **no points** | **stay** |
| ⋮ BLOCK / REPORT | one-time multiplier on your current dopa (good or bad, not shown) | post disappears, move |

- Saved chips modify swipe points **left → right**. **Tap** a chip to arm it and tap again to delete; **hold** to drag it into a new position. Neither pauses the game.
- **Modifiers** get appended to names: `.x2` … `.x8` (one more unlocks every hour; multiply the numbers and the save), `.SLOP` (good posts, reversed), `.REAC` (bad posts, amplified).
- **Ads** can't be skipped while the timer runs. Trying: REALAD costs more each time and adds seconds, SCAMAD opens the scam website, GAMEAD opens a playable ad. Tap the real target to get out. DOPA stays visible and keeps draining.
- **CAPTCH**: tap 1 → 6 in order.
- **Notifications**: TAP / SWIPE / WAIT each multiply your dopa. What each does isn't shown; you learn the names.
- **Tolerance:** the bigger your bank, the faster it leaks. Multipliers feel huge but can't be hoarded.
- You fall asleep at −10.

## Modes

| mode | pressure |
|---|---|
| **CLOCK** | real-time drain (0.25/s, growing hourly) + 10%/s tolerance |
| **UPKEEP** | every 12 moves you pay dopa (×1.6 each time) + 15%/move tolerance |
| **QUOTA** | every 12 moves you must have dopa (×2.1 each time) + 15%/move tolerance |

Bot simulations (10 runs each; a "smart" bot plays like someone who has learned which names are good and bad):

| mode | only swipes up | smart |
|---|---|---|
| clock (1 move / 3.5s) | asleep 01:30–04:00 | wins 6/10 |
| upkeep (1 move / 2.5s) | asleep 02:00–03:00 | wins 6/10 |
| quota (1 move / 2.5s) | asleep 01:00–02:00 | wins 7/10 |

## Editing content

All game content is JSON in **`src/data/`**. See [`src/data/README.md`](src/data/README.md) for the notation.

```json
"CUTE": { "kind": "good", "weight": 12, "up": 1, "down": 0, "left": -1, "right": 1, "save": "→+2", "report": 0.8, "block": 0.8 }
".SLOP": { "group": "variant", "appliesTo": "good", "up": "=2", "left": "*-4", "save": "*-1", "report": 0.8, "block": 1.5 }
"FREN": { "tap": 1.1, "swipe": 0.9, "wait": 0.9 }
```

## Tuning

Pause → **TWEAKS**. Everything in `src/config.ts` is live and saved on the device. Useful switches:
- `COLOR_OPS` colours the numbers by op.
- `SHOW_HIDDEN` shows the report/block/notification multipliers (for testing).

The debug buttons can make any post come next. **COPY CONFIG** gives JSON to paste into `DEFAULTS`.

## Dev

```bash
npm install
npm run dev      # http://localhost:5173 (+ LAN)
npm run build    # v3 + pilot1 + v2 → dist/
```

Pushing to `main` deploys to GitHub Pages.
