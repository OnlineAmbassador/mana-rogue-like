# Next Agent Handoff

## Persistent instruction

**This instruction is not to be removed** — Always read this handoff first when resuming work. Never delete this file. When the current task is complete, update this handoff with the next task and retain this instruction verbatim.

**Controller behavior is locked:** Do not change controller input, mappings, movement, aiming, firing, or disconnect handling unless the user explicitly asks to change controller behavior. The one authorized exception is facing only, described under "Input and aim" below.

## Current task

No pending implementation task. Await the next user request.

The latest work is weapon-aware mob AI, a weapon-swap cooldown, and a cooldown cue on the HUD. It is tested but has not been playtested, and its numbers are untuned first guesses. If asked to evaluate balance, playtest:

- whether each style's mob response (below) feels distinct and fair, and whether the 6 s swap cooldown is too long;
- whether charged shots feel rewarding without trivializing bosses, whether advanced-AI promotions are readable, and whether two-room trials justify their time.

## Latest work

- **Weapon-aware mob AI.** Regular mobs react to the style the player has been attacking with, not the one held this instant. `styleHeat`, `dominantAIStyle`, `recordStyleUse`, `updateStyleHeat` and `resetStyleHeat` are in `playermanager.js` (heat is seconds spent attacking per style, half-life 4 s; a rival style needs a 25% lead to take over; heat resets at run start and on resume). `styleAIProfiles`, `aiStyleProfile` and `styleCooldownRate` are in `mobmanager.js` and are read in `applyMobTactics` and the attack-cooldown tick.
  - Melee: casters keep a wider ring, and waiting foes strike during the player's swing recovery.
  - Bow: foes close in, dodge more, and one extra melee mob may engage.
  - Magic: foes spread out and ranged mobs act slightly faster.
  - Bosses, minibosses and promoted boss-AI foes ignore it. The first stance shift per run shows the neutral message "Foes adjust."
- **Weapon-swap cooldown.** `WEAPON_SWAP_COOLDOWN` (6 s) and `weaponSwapCooldown` live in `playermanager.js`; `selectCombatStyle` ignores swaps while it runs and ignores picking the active style. `drawStyleSlots` (`gameui.js`) greys the unselected slots with a shrinking wedge and a seconds count, and the touch Switch button (`updateTouchControls` in `game.js`) shows the seconds left and is disabled.
- Tests for all of this are at the end of `tests/balance.test.js`, plus one each in `tests/input.test.js` and `tests/health.test.js`.

## Behavior to preserve

### Input and aim
- Controller: the left stick only moves; the right stick alone sets aim, facing and firing direction (the stored right-stick aim is used even while the stick is neutral). Gamepad code lives in `controllermanager.js`, loaded before `game.js`. Disconnect returns to the last non-controller mode.
- Authorized facing exception: while the right stick and fire buttons are idle, the left stick (and the touch move stick, when not attacking) sets facing to the walking direction (`shouldMovementSetFacing` in `game.js`). Keyboard/mouse facing hands back to walking after `MOUSE_AIM_HOLD` (1 s) of mouse idle (`updateMouseAimHold`). Exact diagonals show the side sprite (`drawPlayer` in `gameui.js`).
- Keyboard/mouse: the cursor controls firing direction. Touch: attacks always target the nearest live enemy (fixed rightward with none), regardless of touch-drag.
- Input mode changes on a keyboard key, controller activity, or a touchscreen press. Touch controls are not enabled just because the device supports touch; the first press activates them, and touch can take over from a connected controller. Mouse movement alone does not switch mode until a click.

### Combat and progression
- Charge projectiles keep a substantial damage bonus; charged magic respects weapon cooldown. Charged bow releases make a sustained beam with a captured aim direction, clipped by room edges and obstacles, with one impact explosion.
- Charge mode has a 5% chance on an eligible upgrade and can be found once per run. Ability offers are tracked per run so shops, room rewards and boss drops don't repeat abilities; offer history persists through save/resume.
- Each cleared room adds one Familiar charge (max eight). With the Mana Familiar Sigil, the defense action spends five charge to summon up to three orbiting guards (orbit cap 13; at 13 the charge is kept). Each guard blocks one hostile hit or strikes one enemy. Without the sigil the defense action is Shockwave. Charge and guards persist through save/resume. The sigil is excluded from the standard ability slots.
- Boss phase changes and the boss-room Guardian Heart restore at most two hearts, including at expanded maximum health.
- Saved playtime and character unlocks can promote capable enemies to advanced boss-style AI from floor one. Minibosses use one clear pressure marker; major bosses rely on their own phase attacks.

### World
- Optional enemy-free trial rooms randomize among a mirror puzzle, a rune-memory sequence and a spark chase; layout, progress and reward persist through save/resume. Some trials span two chambers, and the reward is released only after the last one.
- Elemental menhirs spawn in a key-locked branch on 75% of maps (otherwise an ability reward), with a separate guaranteed key cache. Shops stock a bomb, a one-point heal and one upgrade, with a second ability sometimes and never a third.

## Validation

- `node --test`: 149 tests pass. `node --check` passes on every root JavaScript file. Run both after any code edit.
- Tests load the game's source files into `vm` contexts, so a new global used by game code needs a stub in each affected harness (this caused 22 test failures earlier). Top-level `let`/`const` in those files are not context properties; read and write them with `vm.runInContext`.
- If `node` is not found in a shell, refresh `PATH` (it was installed after the shell started).
