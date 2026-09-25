# Game data

Edit these JSON files to change the game. No code changes needed. The game validates them at boot and logs errors to the console.

## posts.json

One entry per post type (the table's rows). The key is the NAME the player sees.

| field | meaning |
|---|---|
| `kind` | `good` / `bad` / `ad` / `special`. Hidden from the player. Decides which variant modifiers can apply (`.SLOP` → good, `.REAC` → bad) |
| `weight` | how often it spawns relative to the others |
| `minHour` | optional: earliest fake hour it can appear |
| `up` `down` `left` `right` | swipe base stats: dopa points added (`1`, `-2`, or `"rand(-3,3)"`) |
| `save` | what saving gives you (see below). Saving gives no points itself |
| `report` `block` | one-time multiplier on your CURRENT dopa (`0.8` = dopa × 0.8) |
| `ad` | `real` / `scam` / `game`: an unskippable ad. Trying to skip: real = escalating cost, scam = website trap, game = playable-ad trap |
| `special` | `captcha` (must be solved, no swipes) or `glitch` (jittery post) |

### save notation

```
→+2                 like gains +2
↑*2                 skip gains ×2
↔+1                 ← and → +1
↕+1                 ↑ and ↓ +1
↕↔+1                all four +1
←*3 & →*0.5         two parts joined with &
↕+rand(-2,2)        random, rolled when the post appears (you see the rolled number)
↕↔*pick(3,3,-3)     random, rolled when you SAVE it (here: 2/3 ×3, 1/3 ×−3)
```

Arrows: `↑ ↓ ← →`, plus `↕` (up+down) and `↔` (left+right). Ops: `+` add, `*` multiply.

## modifiers.json

Suffixes added to post names (`CUTE.SLOP.x3`). A post can have at most one `variant` and one `mult`.

| field | meaning |
|---|---|
| `group` | `mult` (the .xN multipliers) or `variant` (.SLOP / .REAC) |
| `minHour` | first fake hour it can appear |
| `appliesTo` | only posts of this `kind` |
| `swipes` | shorthand for all four of `up` `down` `left` `right` |
| `up` … `right` | `"=2"` sets the stat to 2, `"*-4"` multiplies the base by −4 |
| `save` | `"*3"` scales the save effect (+2 → +6, ×2 → ×6). `"*-1"` inverts it (+2 → −2, ×2 → ×0.5) |
| `report` `block` | replaces the post's report / block multiplier |

How often posts get modifiers: `MULT_CHANCE` and `VARIANT_CHANCE` in `src/config.ts`, also in the in-game tweaks.

## notifs.json

`tap` / `swipe` / `wait` each multiply your current dopa. WAIT = the notification timed out.
