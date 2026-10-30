# Balance tuning rules

Reference for anyone changing enemy tuning, in particular the input-adaptive tactics in `mobmanager.js` (`ADAPTIVE_AI_TUNING`) and the weapon-style profiles (`styleAIProfiles`). Read this first; the rules below explain why the numbers are what they are.

## How to change a number

1. Find the number in `ADAPTIVE_AI_TUNING` (`mobmanager.js`). Values marked `playtest` have no derivation and can be tuned freely within the limits of the rules; everything else is derived or bounded by a rule below.
2. Change it, then run `node --test tests/tuning.test.js`. Each rule is enforced by a test named after its ID (`R1:` ... `T2:`).
3. If a rule has to change, change it here, in the test and in the code together. A test fails when this file and `tests/tuning.test.js` list different rule IDs.
4. Record the change in `CHANGELOG.md`.

Every new adaptive effect must be gated behind `adaptiveEnemiesEnabled()` (see T1).

## Anchors

The rules derive from constants that already exist in the game. If one of these changes, re-check the rules that use it.

| Anchor | Value | Where |
|---|---|---|
| Dash invulnerability | 0.24 s | `DASH_INVULN_SECONDS`, `playermanager.js` |
| Invulnerability after a hit | 0.9 s | `PLAYER_HIT_INVULN_SECONDS`, `playermanager.js` |
| Dash movement | 0.16 s at 620 px/s (about 99 px) | `startDash`, `update` |
| Dash cooldown | 0.85 s (Scout 0.42 s) | `startDash` |
| Ground speed before slows | class speed 180 to 235 px/s, Pilgrim x1.12, speed curios | `baseGroundSpeed()` |
| Ordinary enemy shot speed | 155 (wisp 185) x (1 + 0.12 per floor after the first) px/s | `ordinaryShotSpeed()` |
| Attack-cooldown scaling per floor (ordinary enemies) | +8% | `updateEnemyBehavior` |
| Melee attack tokens | `min(3, 1 + floor(floor / 2))` | `meleeAttackerLimit()` |
| Enraged enemy speed | x1.25 | `applyMobTactics` |
| Sight range | 430 px | shared literal in `mobmanager.js` |
| Weapon-style counters | ranged rate x1.15, dodge x1.5, +1 token | `styleAIProfiles` |

## Rules

### R1 - The wide pulse cannot be walked out of
Radius = `clamp(round(baseGroundSpeed x warning x 1.15), 180, 320)`. Walking away at full ground speed during the warning always falls short, for every class speed and every input, so the answer to a pulse is to dash. The radius follows the player's speed, so slower classes face a smaller pulse instead of one sized for the fastest class. The message and tutorial must not say the circle can be left on foot. Enforced by `dashPulseRadius()`.

### R2 - The DASH NOW cue fits inside the dash invulnerability
`pulse.dashCueSeconds` must not exceed `DASH_INVULN_SECONDS`: a dash started earlier than that lets its invulnerability run out before the blast. The cue is a timing aid, not a reaction prompt; the ring filling up is the real signal. Every warning must also leave at least 0.5 s before the cue to anticipate it.

### R3 - A pulse leaves its caster quiet longer than a hit's invulnerability
After starting a pulse, the caster's attack cooldown is at least `warning + PLAYER_HIT_INVULN_SECONDS`, so no follow-up attack lands inside the invulnerability the pulse itself may grant.

### R4 - Tempo is measured in floors
Input tempo is `1 + tempoPerFloor x tempoFloors`, where `tempoPerFloor` is the existing +8% per floor of ordinary-enemy attack cooldowns. A profile of `tempoFloors: 1.5` therefore attacks as fast as the same enemy one and a half floors deeper. Bosses are not affected.

### R5 - Floor one applies half of an input profile
The strafe, flank, dodge, near-dodge, prediction, spacing and tempo parts of a profile are scaled by `floorOneRamp` (0.5) on floor one and apply fully from floor two. Extra attack slots wait for floor two, and the wide pulse needs floor two. This keeps the first floor close to the existing floor-two gate on enemy dodging.

### R6 - Attacks start at least 0.25 s apart
Ordinary attack spacing is never below `minAttackGap`, about human reaction time and the length of a dash. Faster spacing would stack attacks the player cannot tell apart.

### R7 - Melee attack tokens have a hard cap
The floor-based base (at most 3) plus the weapon-style bonus plus the input slot never exceeds `maxMeleeAttackers` (4: the base cap plus at most one adaptation slot). Bow style with a controller reaches the cap, not past it.

### R8 - Flanking never beats an enraged enemy's speed
Sideways movement is added on top of the archetype's own movement, so it is capped at `sqrt(maxTacticalSpeed^2 - 1)` (0.75) of the enemy's speed. The total stays within `maxTacticalSpeed` (1.25), the enrage multiplier, so no calm enemy outruns an enraged one.

### R9 - Prediction is a share of flight time, and never perfect
Shot lead is the floor-based lead (up to 0.45 s, unchanged) plus `shotShare` of the flight time that remains beyond it. Because the share is below 1, prediction stays strictly short of perfect aim at every distance, and it stays distinct between inputs on every floor (keyboard > controller > touch > none), unlike a flat cap that erases the difference on deeper floors. Digital keyboard movement is the most linear, so it gets the largest share.

### R10 - Controller >= keyboard/mouse >= touch on threat
On each threat axis (`attackSlots`, `tempoFloors`, `dodgeBonus`, `flankLead`, lower `beatScale`, lower `warning`) the order is controller, then keyboard/mouse, then touch, and every input is above `neutral`. Three axes are counters rather than threat tiers and are exempt: `strafe` (analog movers draw more lateral pressure), `nearDodgeBonus` (touch auto-aims, so touch draws more close-range evasion instead of more threat) and `shotShare` (R9).

### T1 - Adaptive enemies off restores the earlier behavior
With the pause-menu setting off: the input profile is `neutral`, tempo is 1, there are no extra attack slots, spacing and shot lead use the original floor-based values, no wide pulses start, and major bosses skip path-marker pressure again (minibosses always used it). Obstacle steering is a movement fix and stays on. Any new adaptive effect must check `adaptiveEnemiesEnabled()` or `adaptiveActive()`.

### T2 - The setting defaults on and survives a bad store
`gameSettings.adaptiveEnemies` is `true` unless the stored value is exactly `false`. A missing, malformed or wrongly typed entry falls back to on.

## Current profile values

Raw values from `ADAPTIVE_AI_TUNING.profiles`. At floor one the ramp (R5) halves everything except `warning`.

| Axis | neutral | touch | keyboard/mouse | controller |
|---|---|---|---|---|
| `tempoFloors` (tempo) | 0 (x1.00) | 1 (x1.08) | 1.5 (x1.12) | 2 (x1.16) |
| `attackSlots` | 0 | 0 | 0 | 1 |
| `beatScale` | 1 | 0.85 | 0.8 | 0.7 |
| `warning` (s) | 1.1 | 1.1 | 1.05 | 0.95 |
| `dodgeBonus` | 0 | 0.08 | 0.12 | 0.22 |
| `flankLead` (s) | 0 | 0.1 | 0.18 | 0.28 |
| `strafe` (x enemy speed) | 0 | 0.48 (up to 0.72 at close range) | 0.4 | 0.75 |
| `nearDodgeBonus` | 0 | 0.32 | 0.08 | 0.12 |
| `shotShare` | 0 | 0.07 | 0.18 | 0.13 |

Pulse radius from R1 (px), by ground speed: 235 gives 297 (touch), 284 (keyboard), 257 (controller); 180 gives 228, 217, 197.

## Playtest-tunable values

These have no stronger anchor than the pacing of the surrounding fights. They may be changed freely as long as every rule above still holds.

- `adaptSeconds` (2.5): stable play needed before enemies switch to a new input profile.
- `roomGraceSeconds` (6): no wide pulse this soon after entering a room.
- `pulse.mobCooldown` (10 s) and `pulse.bossCooldown` (7 s): time between wide pulses.
- `bossPressureCadence` (boss 1.5, mini 1.4): multiplier on the path-marker interval.
- `flankLead`, `dodgeBonus` and `strafe` magnitudes, within the order required by R10 and the cap in R8.
- `pulse.mobDamage` (1) and `pulse.bossDamage` (2), matching the existing strike damage for ordinary and boss attacks.
- `mobReactionSeconds` (0.14): shots arriving sooner than this are not dodged.
