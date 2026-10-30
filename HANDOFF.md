# Next Agent Handoff

## Persistent instruction

**This instruction is not to be removed** — Always read this handoff first when resuming work. Never delete this file. When the current task is complete, update this handoff with the next task and retain this instruction verbatim.

**Controller behavior is locked:** Do not change controller input, mappings, movement, aiming, firing, or disconnect handling unless the user explicitly asks to change controller behavior. The authorized exceptions are facing (described under "Input and aim" below) and full-map navigation (D-pad/left stick, A, B/Back, active only while the full map is open; approved 2026-10-30).

## Current task

Waiting for the user's feedback on the desert visuals (sandstone corners, curved paving, ambient animation) and on the new balance numbers. Do not add more enemy difficulty before the numbers have been playtested.

Keep these as they are:
- the approved touch aiming: with enemies present, Attack targets the nearest live one; with none, Attack follows the drag or the player's facing;
- controller behavior, apart from the exceptions listed in the persistent instruction;
- the source-backed terrain and artwork work. Use the TMX motifs, not random atlas ids.

Open questions for playtesting:
- Touch close-range misses, gamepad flanking and overlap, keyboard shot prediction, and wide-pulse timing.
- Whether boss warning reservations leave too much idle time or too many damage windows.
- Whether each weapon style's mob response is distinct and fair, and whether the 6 s weapon-swap cooldown is too long.
- Whether charged shots feel rewarding without making bosses trivial, whether advanced-AI promotions are readable, and whether two-room trials are worth the time.
- The altar room's ambush (the right altar) is opt-in extra enemies, `min(6, floor + 1)` per use, and has not been played. Tune `RISK_SHRINE_CHANCE`, `RISK_SHRINE_MIN_HEARTS` and `RISK_SHRINE_MAX_AMBUSH` in `worldmanager.js` if it is too easy, too hard or too common. The altar drawing and prompts have not been seen on screen.
- Sound effects now decode through Web Audio after the first input; the first play of each cue uses a plain Audio element. Check in a real browser (including Safari) that nothing is silent or doubled.
- `assets/tmw` was trimmed to the referenced files. When the game gains a new asset, add the reference as a literal string, or extend `DYNAMIC_PREFIXES` in `tools/trim-assets.js` and re-run `tests/assets.test.js`.
- Touch and controller use of the full map has not been tried on real devices. The final map legend change (Start shares the Room entry, hostile rooms get a red border) passes tests but was never seen on screen.
- Room-entry cost of the desert floor on low-end mobile has not been measured. The background takes about 134 to 175 ms to build in the remote browser and is cached. Profile it before reducing detail.
- The secret-room masonry floor is still an early composition and could get the same source-based treatment.

Preview: run `.claude/serve.py` (see `.claude/launch.json`) and open `index.html`; the bare `/` URL returns 404. Do not rewrite the save or inventory to test something.

Art sources: the desert uses bundled TMW art and CC BY-SA 4.0 Source of Mana art. `assets/som/CREDITS.md` records authors, the source revision and how the walls were adapted. README covers footprints and the TMW sources and licenses. The UI is original canvas and CSS drawing. A new import needs its exact license, author and source verified; attribution alone is not permission.

## Latest work

### Enemy tuning and the Adaptive enemies setting
- [BALANCE.md](BALANCE.md) is the reference for every adaptive-AI number. Read it before changing `ADAPTIVE_AI_TUNING` (`mobmanager.js`) or the weapon-style profiles. Each rule has an ID (R1 to R10, T1, T2) and a test of the same name in `tests/tuning.test.js`. Change the doc, the code and the test together.
- The pause screen has an **Adaptive enemies** switch (E, Y or triangle, or click). It is saved as `gameSettings.adaptiveEnemies` under `mana-hollow-sanctum-settings` and turns off every input-based change (T1). Check `adaptiveEnemiesEnabled()` in any new input-based enemy behavior.
- The numbers are derived from the game's own constants. Nobody has playtested them.

### Input-aware enemies
Enemies read the existing `lastInputMode`. Player controls, aim, accuracy and dash values are not changed.
- **Learning.** `mobmanager.js`: `inputAI`, `stepInputAI`, `updateInputAI`, `resetInputAI`, `aiInputProfile`. The first input seen is learned at once. A switch needs `adaptSeconds` (2.5 s) of stable play, and paused time does not count. Entering a room restarts the wide-pulse grace period but keeps the learned input. The state is not saved. `game.js` updates it during play and resets it on a new run, and `dbmanager.js` resets it on restore.
- **Maneuvers.** Calm enemies flank using the player's velocity. Touch draws more close-range sidestepping and dodging, gamepad draws stronger flanking and one extra attack slot, and keyboard draws more shot prediction. Tempo, spacing, token and speed limits come from the rules in BALANCE.md. Enemies dodge only real incoming projectiles that are at least `mobReactionSeconds` away. A ranged enemy fixes its shot target when the windup starts and keeps it after an input switch. There is no random aim error and no reading of button presses.
- **Obstacle steering.** `steerEnemyVelocity` sweeps ahead against unbroken circular obstacles and the wall clearance. It goes straight, or turns 45, 90 or 135 degrees and remembers the side. `moveEnemy` uses it only in calm states, so dives, rolls and lunges keep their direction. A final wall clamp follows obstacle separation. It is local steering, not pathfinding, and U-shaped traps are untested.
- **Wide pulse.** `tryDashPressure` reuses the fixed `bossStrikes`. `dashPressureBlocker` returns the reason a pulse cannot start: Adaptive enemies off, floor below two, cooldown or cleared room, the player cannot dash, a strike already active, no line of sight or out of range, boss below phase two, another attack in progress, or hostile shots, bombs or hazards nearby. The radius depends on walking speed (R1), so walking out of it in time is not possible, and a timely dash is the answer. Damage is one heart, or two from a major boss. `drawGroundHazards` shows WIDE PULSE - PREPARE TO DASH and then DASH NOW. Dash itself is unchanged: speed 620 for 0.16 s with 0.24 s of invulnerability.
- **Boss pressure.** Major bosses now use the fixed path markers that only minibosses used before (radius 60 and two hearts, against 50 and one heart for minis). Calm bosses do not start a signature or extra windup in the same frame as a marker, and pending bursts, link dashes and extra windups block pulses. Phase heals, death cleanup and existing damage values are unchanged. This can lengthen recovery windows, so check real fights.
- **Limits.** Nobody has played this enough to say it is balanced or fun. The only outside source consulted was the Guild Wars 2 combat page, which describes active dodging; it is inspiration and not evidence that any game adapts to input.
- **Undo.** To remove the adaptive layer, isolate the input-AI functions and hooks, the steering, tactics and pressure additions, the dash labels, and their tests and docs. Keep the older weapon-style AI and the touch aiming fix.

### Desert art
- **File layout.** Desert drawing is in `desertart.js` (constants in `DESERT_ART`), loaded after `gameui.js`. `clipRoomWallBand`, `drawCastleWalls`, `terrainTileAt` and `prefersReducedMotion()` stay in `gameui.js`. The Tulimshar TMX is kept unmodified as the fixture that `tests/presentation.test.js` checks wall tile ids against.
- **Walls.** `drawSandstoneWalls` uses SoM `wall.png` (Modanung with Reid, CC BY-SA 4.0, pinned source `ebb0335f1ac438a883f1d70e27cdfe92f811ed28`). Face ids `[2,18,34,50]` come from `Over` x39,y25..28 and the side walkway `[0,6,6,4]` from `Ground` x35..38,y0. Faces stay upright. Depth is compressed into the unchanged 64 px collision band. `clipRoomWallBand` cuts exact 96 px openings only for cleared, unlocked, visible doors, including revealed secret doors.
- **Corners.** Horizontal runs stop before the 64x64 corner areas, which use 4x4 handed patterns from `Over` (35,54..56) ids 1/8/24 plus `Ground` (35,57) id 40, `Over` (47,54),(48,55..56) ids 3/11/27 plus `Ground` (48,57) id 43, and the inner joins from `Over` (36,27..28) ids 25/41 and (47,56..57) ids 26/42. The pieces are transparent, so the wall-top walkway course `[0,6,6,4]` must be drawn under them or square holes show at the upper corners.
- **Paving.** `desertPavingCoverage(x, y)` gives organic approaches only toward existing `currentRoom.links`: room-seeded bends, changing widths, a rounded junction and sine erosion. Each 4 px cell uses the same coverage for drawing and for footprint exclusion (threshold 0.25). Only source subrectangles of the Artis cobblestone motif are masked, never stretched. The layout is static and cached (twelve entries, keyed by room, doors and paving readiness). Len's forum post 110932 (17 August 2011) was a layout reference only; none of its art is in the project. This is procedural worn paving, not Len's hand-drawn transition tiles.
- **Animation.** `drawDesertWind` and `drawDesertScenery` run right after the floor. Wind keeps four single-stroke wisps in low quality (10 to 24 double strokes otherwise). Scenery and the menhir aura use elapsed time at every quality level, so a quality switch cannot reset their phase. Reduced motion freezes all of it. The perimeter sand texture is skipped in low quality. Sandstorm opacity is 0.15. Floors, paths and walls are static on purpose.
- **Footprints.** State is in `game.js` (`sandFootprints`). `updateSandFootprints(dt)` runs after `resolveDoorCrossing` and `drawSandFootprints` right after the floor. They use TMW `footprints.png` (author unidentified, GPL 2.0), eight directions, one print per 20 px walked, an 8 s life with a 3 s fade, at most 96 prints, and a reset on a room change or a jump over 96 px. Paving and non-desert or secret rooms get none.
- **Soul menhir.** The native 64x64 `assets/som/graphics/soulmenhir.png` (Crush with Reid, CC BY-SA 4.0) replaces the TMW variant, with a cooler aura. Menhir interactions are unchanged. `loadAsset` takes an optional art root and reports the real path on a load error.
- **Atmosphere.** `drawRegionAtmosphere` draws in screen space after the world, using camera-adjusted room edges. Four 100 px edge gradients and an 86 px sandstorm rim leave the center clear. `sandstorm.png` is Crush (GPL 3.0 or CC BY-SA 3.0; this use takes CC BY-SA 3.0) and `artis-pavement.png` is IvanMorve with Reid (CC BY-SA 3.0).
- **Composition.** `drawDesertGround` keeps the 128x128 dune patch at atlas (256,256) whole. Tulimshar uses the shared `desertGroundTiles` in `game.js`. One soft top-wall shadow adds depth; do not put it inside the wall-tile loop.

### Other regions and UI
- **Castle walls.** `drawCastleWalls` replaced the old checker-and-stamp perimeter. Source `001-3.tmx`, `Over 2`, (102,100)..(105,104): top `[0,1,1,2]`, next `[16,17,17,18]`, side columns `32`/`34` repeated along Y, lower cap `[48,49,49,50]`. The bottom cap, face and base `[[48,49,50],[64,65,66],[80,81,82]]` are confirmed in `011-4.tmx`, `Ground 2`, (271,60)..(273,62). Side width scales 32 to 64 and the lower three courses compress into 64 px. Facades are never rotated or stamped on the sides.
- **Floors.** `terrainTileAt` keeps the 2D order of optional `tilePattern` data, and plain `tileIds` still work. Graveyard `[[36,20],[6,37]]` (`029-6/Ground/(140,32)`), Artis `[[113,114],[113,114]]` (`005-1-1/Ground/(9,7)`), World's Edge `[[32,33],[47,48]]` (`006-8/Ground/(32,22)`, 15 atlas columns), Halinarzo 241 (`011-4/(57,49)`), Nivalis 83 (`019-1/(0,0)`), Frostia 4 (`001-13-1/(23,28)`), Candor 4 (`004-2-1/Ground1/(56,23)`). Each is a real 2x2 repeat from the map. The graveyard grass uses `saturate(0.28) brightness(0.52)`, because the old hue rotation turned it magenta. README lists the sources, authors and licenses, including the discrepancies in the maps' own metadata (029-6, 005-1-1, 001-13-1), and the Jetrel/CC0 stoneground.
- **TMX crawl.** All 491 maps and 2,555 visual layers under `assets/tmw/clientdata/maps` were scanned (3,482 layers in total, all CSV, orthogonal, none infinite) for 2x2, 3x3, 4x1 and 1x4 arrangements of the 12 atlas files the game uses. 14,963 placements outside the referenced atlas or animation range were excluded. Do not copy them as art or fix the upstream maps. Counts alone do not show meaning: cave id 20 is opaque black void, and ids 110 and 58 in the cave and ice maps are transparent. The crawl script and its output were kept outside the repository and are gone; the motifs above are the useful result. Castle face 65 above base 81 occurs in 311 places across six maps; look at the whole corner and door structure before reusing it.
- **Graphical pass.** `drawManaPanel` (`gameui.js`) draws the beveled charcoal and gold panels used by the HUD, minimap, weapon and action slots, messages, pause panel, character-select header, codex, controls, tutorial and journal. `style.css` matches the page and touch buttons without changing hit areas, positions or handlers.
- **Pause inventory.** `drawPauseEquipment` is in `gameui.js`. It draws a framed grid of owned items and non-empty consumable stacks, with counts, an empty-state message and hover names, and no new interactions. It is tested with 161 icons.
- **Touch aiming.** `nearestTouchTargetAngle` (`playermanager.js`) returns `null` when no enemy is alive, and `currentAimAngle` then uses an active drag, otherwise the player's facing. Combat targeting and controller code are unchanged. README, `gameui.js` and `index.html` carry the touch instructions. To revert, change only the no-target return and the touch branch of `currentAimAngle`, with their instructions and tests.

### Map and weapon systems
- **Full map and map travel.** From a cleared room, the full map (M) travels to any visited, cleared room reachable through open doors.
  - `worldmanager.js`: `roomNeighbors` lists open links and revealed secret walls. `mapTravelRoutes` is a breadth-first search that returns each room's last-step direction. `travelToRoom` does the move, and `moveToRoom` and `placePlayerAtEntry` are shared with `enterDoor`. `mapRouteBlocker` names why a room is out of reach: foes, a locked door, or both.
  - `gameui.js`: `mapLayout` fits the revealed rooms into `MAP_AREA` at up to 130 px per cell. `drawMap` and `drawMapSidebar` draw the map and sidebar, `mapRoomAt` is the hit test, and `roomMapColor`, `roomMapLetter` and `roomMapLabel` are shared with the minimap.
  - `game.js` holds `mapCursor`, `mapOpenedAt`, `openMap`, `closeMap`, `stepMapCursor` and `travelToMapCursor`, with map branches in the keydown and pointer handlers. While the map is open, `runAction` ignores everything but `map` and `interact` (interact travels), and `pauseGame` closes the map. Controller navigation is in `controllermanager.js`, and the touch zones hide through the `.map-open` class.
  - Tests are in `tests/maptravel.test.js`; `tests/input.test.js` has `showMap` stubs.
- **Weapon-aware mob AI.** Regular mobs react to the style the player has been attacking with, not the one held at the moment. `styleHeat`, `dominantAIStyle`, `recordStyleUse`, `updateStyleHeat` and `resetStyleHeat` are in `playermanager.js`. Heat is seconds spent attacking per style with a 4 s half-life, a rival style needs a 25% lead to take over, and heat resets at run start and on resume. `styleAIProfiles`, `aiStyleProfile` and `styleCooldownRate` are in `mobmanager.js` and are read in `applyMobTactics` and the attack-cooldown tick.
  - Melee: casters keep a wider ring, and waiting foes strike during the player's swing recovery.
  - Bow: foes close in, dodge more, and one extra melee mob may engage.
  - Magic: foes spread out and ranged mobs act slightly faster.
  - Bosses, minibosses and promoted boss-AI foes ignore it. The first stance change in a run shows the message "Foes adjust."
- **Weapon-swap cooldown.** `WEAPON_SWAP_COOLDOWN` (6 s) and `weaponSwapCooldown` are in `playermanager.js`. `selectCombatStyle` ignores swaps while it runs and ignores picking the active style. `drawStyleSlots` greys the other slots with a shrinking wedge and a seconds count, and the touch Switch button (`updateTouchControls` in `game.js`) shows the seconds left and is disabled.
- Tests for the weapon systems are at the end of `tests/balance.test.js`, plus one each in `tests/input.test.js` and `tests/health.test.js`.

## Behavior to preserve

### Input and aim
- Controller: the left stick only moves; the right stick alone sets aim, facing and firing direction (the stored right-stick aim is used even while the stick is neutral). Gamepad code lives in `controllermanager.js`, loaded before `game.js`. Disconnect returns to the last non-controller mode.
- Authorized facing exception: while the right stick and fire buttons are idle, the left stick (and the touch move stick, when not attacking) sets facing to the walking direction (`shouldMovementSetFacing` in `game.js`). Keyboard/mouse facing hands back to walking after `MOUSE_AIM_HOLD` (1 s) of mouse idle (`updateMouseAimHold`). Exact diagonals show the side sprite (`drawPlayer` in `gameui.js`).
- Keyboard/mouse: the cursor controls firing direction. Touch: attacks target the nearest live enemy in the current room regardless of touch-drag. With no live enemies, Attack dragging sets direction; without a drag, attacks use player facing. Walking before holding Attack also chooses a direction. Dead enemies do not block manual aiming, and auto-targeting resumes immediately when a live enemy appears. Controller behavior is unchanged.
- Input mode changes on a keyboard key, controller activity, or a touchscreen press. Touch controls are not enabled just because the device supports touch; the first press activates them, and touch can take over from a connected controller. Mouse movement alone does not switch mode until a click.

### Combat and progression
- Charge projectiles keep a substantial damage bonus; charged magic respects weapon cooldown. Charged bow releases make a sustained beam with a captured aim direction, clipped by room edges and obstacles, with one impact explosion.
- Charge mode has a 5% chance on an eligible upgrade and can be found once per run. Ability offers are tracked per run so shops, room rewards and boss drops don't repeat abilities; offer history persists through save/resume.
- Each cleared room adds one Familiar charge (max eight). With the Mana Familiar Sigil, the defense action spends five charge to summon up to three orbiting guards (orbit cap 13; at 13 the charge is kept). Each guard blocks one hostile hit or strikes one enemy. Without the sigil the defense action is Shockwave. Charge and guards persist through save/resume. The sigil is excluded from the standard ability slots.
- Boss phase changes and the boss-room Guardian Heart restore at most two hearts, including at expanded maximum health.
- Saved playtime and character unlocks can promote capable enemies to advanced boss-style AI from floor one. Minibosses and major bosses use the fixed path markers described above, and major bosses also have their own phase attacks.

### World
- Optional enemy-free trial rooms randomize among a mirror puzzle, a rune-memory sequence and a spark chase; layout, progress and reward persist through save/resume. Some trials span two chambers, and the reward is released only after the last one.
- Elemental menhirs spawn in a key-locked branch on 75% of maps (otherwise an ability reward), with a separate guaranteed key cache. Shops stock a bomb, a one-point heal and one upgrade, with a second ability sometimes and never a third.

## Validation

- `node --test tests/*.test.js` passes 223 tests, 28 of them in `presentation.test.js`. `node --check` passes on every root JavaScript file. Run both after any code edit.
- In tests, load game source with `tests/helpers/load.js` (`loadBetween`, `loadFunctions`, `sliceText`). It throws if a marker or function is missing, where a plain `indexOf` slice would silently load the wrong text. `tests/helpers/combat.js` builds the shared enemy-AI context.
- Tests load the game's source files into `vm` contexts, so a new global used by game code needs a stub in each affected harness (this caused 22 test failures earlier). Top-level `let`/`const` in those files are not context properties; read and write them with `vm.runInContext`.
- If `node` is not found in a shell, refresh `PATH` (it was installed after the shell started).
