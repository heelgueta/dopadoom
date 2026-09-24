# TODO / ideas parking lot

## Balance (after playtests)
- [ ] Curve: a naive bot sim currently falls asleep between 05:00 and 07:00. Is a thoughtful human winning ~30% of runs?
- [ ] ×DOPA rejects can explode late (Balatro naneinf energy). Cap them, or keep them as the "broken build" fantasy?
- [ ] Should saving also give base +1? (`SAVE_GIVES_BASE`)
- [ ] Should the intro ×2 (Double Tap) be weaker?

## Mechanics not built yet
- [ ] Meta progression: unlock cards/effects across runs (Balatro collection). Stub: `loadRecords()` in engine/game.ts
- [ ] Rarity tiers + card "editions" (foil/holo-style modifiers on reels)
- [ ] More copy/position effects (Blueprint-like puzzles are the most Balatro part)
- [ ] Post yourself: let the player write the caption, and have the post come back later as a boss/ad
- [ ] Crypto market as a global price that multiple cards read
- [ ] Brocult questline (joining unlocks cult-only cards)
- [ ] Political megabosses (hour 6–7), multi-phase
- [ ] Notification storms (boss that spams banners)
- [ ] Buying extra slots with a second currency?
- [ ] Endless mode leaderboard (seeded daily run)
- [ ] Drag-to-reorder chips (tapping works for now)

## Presentation
- [ ] Real art per card (pixel/CRT); parody backgrounds per kind (split-screen runner, blocky parkour…)
- [ ] Proper sfx + music bed that gets distorted as dopa drops
- [ ] Juice: screen shake scaled by gain, particle bursts, chip jiggle trails
- [ ] Service worker for offline play
- [ ] Port path: engine/ and content/ are DOM-free TypeScript and can move to Godot/native later
