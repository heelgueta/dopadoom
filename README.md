# DOPADOOM

Stay awake until 08:00 by scrolling the feed.
**v2: mechanics only.** Theme and satire come later.

**Play:** https://heelgueta.github.io/dopadoom/
**Pilot 1** (the first, feature-heavy prototype): https://heelgueta.github.io/dopadoom/pilot1/. Its source is in `pilot1/` and it's also git tag `pilot1`.

## Rules

Every number is an **op on your dopa**: `+2` add, `−2` subtract, `×2` multiply, `÷2` divide, `×2/÷2` coin flip.
Colours: **blue + / cyan ×** are good, **red − / pink ÷** are bad.

| input | does |
|---|---|
| swipe ↑ | skip to the next post |
| swipe ↓ | go back (not to blocked posts) |
| swipe ← | dislike (once per post) |
| swipe → | like (once per post) |
| bookmark button | **save**: take the post's effect *instead of* swiping it |
| ⋮ button | block / report (removes the post; report pays off on FAKE NEWS) |

- **Saved effects** (5 slots) modify swipe gains, applied **left → right**, so order matters. Tap a chip to move or delete it.
- Repeating ↑/↓ on the same post decays: ×1, ×0.9, ×0.8 …
- **Tally:** after every move the result is added up in the middle of the screen, and you can't move until it's done.
- **Ads** can't be skipped. Each try costs more dopa and adds time. Trying to skip a **premium ad** traps you on a scam website.
- **Notifications** show all three outcomes up front: `TAP +2  SWIPE −1  WAIT −2`.
- You fall asleep at −10.

## Modes (pick on the start screen)

| mode | how the night hurts |
|---|---|
| **UPKEEP** | every 12 moves you **pay** dopa (10, 16, 26 … ×1.6 each time) |
| **QUOTA** | every 12 moves you must **have** dopa (15, 28, 51 … ×1.85). Not spent |
| **CLOCK** | real-time drain that grows each hour, plus a 1%/s leak on your bank |

UPKEEP and QUOTA are turn based: each move is 5 fake minutes, so 96 moves reach 08:00.

Bot simulations of the current numbers (12 runs each):

| mode | only swipes up | greedy (takes best visible number) |
|---|---|---|
| upkeep | asleep 05:00–07:00 | wins ~67% |
| quota | asleep 05:00–06:00 | wins ~40% |
| clock (1 move per 2.5s) | asleep 02:30–04:30 | wins ~40% |

## Tuning

Pause → **TWEAKS**: every number in `src/config.ts` is a slider. Changes are live and saved on the device. There are also debug buttons (+dopa, ad next, premium next, notification, gift).
**COPY CONFIG** gives you JSON to paste into `DEFAULTS` in `src/config.ts`.

## Content

Post types are placeholders written in the same notation you see in game (`src/content/posts.ts`):

```
'u+1 d+1 lx2 r+1 | +2u'     →  ↑+1  ↓+1  ←×2  →+1   save: +2 per ↑
B = block value, R = report value, ?x2,/2 = coin flip, a = all swipes
```

Notifications: `src/content/notifs.ts`, e.g. `n('mom', 'MOM', '+2', '-1', '-2')` = tap / swipe / wait.

## Dev

```bash
npm install
npm run dev      # http://localhost:5173 (+ LAN)
npm run build    # typecheck + build v2 + build pilot1 into dist/pilot1
```

Pushing to `main` deploys to GitHub Pages.

```
src/
  config.ts          all tunables + tweak panel metadata
  types.ts           data model
  engine/ops.ts      ops, mods, template parser
  engine/game.ts     rules, modes, scoring pipeline, ads, website, notifications (no DOM)
  content/           post types, notifications
  ui/app.ts          HUD, tally, overlays, sheets
  ui/postView.ts     post rendering
  ui/pixel.ts        pixel icons / frames / placeholder art (generated SVG, no emoji)
  ui/gestures.ts     swipe recogniser (from pilot1)
pilot1/              frozen first prototype
```
