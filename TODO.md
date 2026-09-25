# TODO

## Test first
- [ ] CLOCK pacing: is 10%/s tolerance fun, or does it feel like a leak you can't fight?
- [ ] Is it clear that SAVE doesn't move you on?
- [ ] Chip drag (hold) and delete (tap twice) on a real phone
- [ ] Should report/block multipliers ever be visible (e.g. after you've tried a name once)?
- [ ] Notifications: learnable by name?

## Open design questions
- [ ] `.xN` scales multiplicative saves literally (×2 on `.x8` → ×16). Maybe `1 + (m−1)·N` instead?
- [ ] `.SLOP` save "*-1" on a multiplier: currently inverts it (×2 → ×0.5), doesn't negate
- [ ] CRYPTO save rolls ×3 or ×−3 when you save it (not on every swipe)
- [ ] GLITCH numbers roll when it appears (so you see them)
- [ ] Captcha has no reward/penalty besides time + wrong-tap cost
- [ ] Ads: block/report are disabled while the timer runs. Allow them?

## Later
- [ ] Theme pass, art, sound
- [ ] Rounds/bosses (see pilot1) if the core loop wants more structure
- [ ] Meta progression / unlocks
