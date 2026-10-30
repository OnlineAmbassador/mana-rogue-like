# Changelog

Notable changes to MANA: Hollow Sanctum, newest first. Entries list the commits they cover so the details can be found with `git show`.

These entries were later ported onto upstream's module split (`gameui.js`, `mobmanager.js`, `playermanager.js`, `dbmanager.js`, `worldmanager.js`) in the `Text:`, `Fix:`, `Gameplay:`, `Feedback:`, `Audio:` and `Display:` commits. The original commit IDs listed below are kept on the `backup/main-pre-improvements` and `backup/hidpi-pre-improvements` tags. The slider fix from `3e1759f` was already made upstream.

## 2026-10-30

### Full map overhaul and map travel
- **Map travel.** From a cleared room, the full map can send the player straight to any visited, cleared room reachable through open doors.
  - The route search is `mapTravelRoutes()` in `worldmanager.js`, a breadth-first search over `roomNeighbors()`. It walks open links and revealed secret walls, and never crosses locked doors or hostile rooms.
  - The player arrives at the door of the route's last step. Arrival goes through `moveToRoom()`, the same path `enterDoor` now uses, so room state, autosave and companions behave as they do on a normal walk back.
  - Travel is unavailable while the current room is hostile or during the death slow-motion.
- **Bigger, clearer map.**
  - `drawMap` (`gameui.js`) now fits the revealed rooms into the panel (`mapLayout()`, up to 130 px per cell), so small floors draw large.
  - It adds:
    - a framed panel with the region and floor;
    - corridor bars, with padlocks on locked doors and dashed secret links;
    - shaded rounded rooms with type badges;
    - dashed unexplored rooms and a red tint on hostile ones;
    - leftover-item icons;
    - the delver in the current room;
    - a sidebar with the selected room's contents, travel status and a legend of the room types present.
  - When a room is out of reach, the sidebar says why: foes, a locked door, or both (`mapRouteBlocker`).
  - Hostile rooms get a red border.
  - The minimap shares the new `roomMapColor` and `roomMapLetter` helpers; it looks the same.
- **Input while the map is open.**
  - Keyboard: arrows/WASD move the selection, Enter/Space/Interact travels, M/Esc closes and P pauses.
  - Mouse: hovering selects a room and a click travels there.
  - Touch: the first tap selects and a second tap travels. The stick, attack and item buttons hide while the map is open.
  - Controller: the D-pad or left stick moves the selection, A travels, and B or Back closes. The user approved this as a map-only exception to the controller lock.
  - Other actions are ignored while the map is open, and pausing closes it.

## 2026-10-29

### Consistent ambient animation in automatic low quality
- Fixed intermittent-looking animation when automatic quality changed: cloth, flames and the menhir aura no longer freeze or reset their phase in low quality.
- Low quality draws four lightweight moving sand wisps instead of hiding wind entirely. Expensive perimeter texture, glow and particle reductions remain; reduced-motion preferences still freeze ambient motion.
- Added regressions for animation in both quality levels, phase continuity across quality changes and reduced-motion behavior.

### Sandstone corners and natural pathways
- Added explicit handed sandstone corner joins using the existing SoM atlas's curved/diagonal pieces, with wall-top ground beneath transparent artwork. Exact door clipping and collision geometry are unchanged.
- Replaced the desert square paving hub/straight rectangular arms with deterministic bends, uneven widths, rounded junctions and worn 4px edges. Texture coordinates preserve the authored cobblestone motif; footprint exclusion follows the same mask.
- Inspected Len's Whispers of Avalon path studies on The Mana World forum (post 110932, 17 August 2011) as layout references. No new artwork was imported; README and SoM credits document references and adaptations.
- Added checks for source-backed corner pieces/layers, deterministic non-boxy geometry, connected door approaches at multiple room sizes, texture alignment and footprints along eroded edges.

### Vertical castle wall correction
- Replaced the remaining non-desert stacked horizontal facade blocks with the atlas's actual left/right vertical edge tiles, joined to separate top cap/corners and bottom cap/face/base courses verified in bundled TMX maps.
- Removed repeated window stamps. Shared exact wall-band clipping preserves collision boundaries and only opens cleared, unlocked, revealed doorways, including non-grid room sizes.
- Added source-backed rendering checks for vertical edges, cap courses and both renderers' doorway clipping. Existing TMW artwork/license attribution is retained; no input, AI or collision changes.

### Harder, input-aware enemy tactics
- Enemy input profiles now follow active touch, gamepad or mouse/keyboard control, adapting after 2.5 seconds on a new input. Touch draws close-range physical jukes instead of artificial aim penalties; gamepads draw stronger flanking and staggered overlap; mouse/keyboard draws stronger committed prediction. Controller/input handlers and player aim are unchanged.
- Calm mobs and bosses steer around cover while committed charges keep their direction. Ordinary attack cooldowns tick 12% faster; health, damage and existing weapon counters remain unchanged.
- Fixed wide-pulse warnings occasionally require a well-timed dash or leaving the area early. They use the existing invulnerability/damage rules, a room-entry grace period, shared pacing, and readiness/overlap checks. The final DASH NOW cue fits inside the existing dash protection window.
- Major bosses now reach shared path-marker pressure instead of returning early; later phases can use wide pulses. New pressure cannot start a signature or extra windup on the same frame. Phase heals, warning commitments and death cleanup are preserved.
- Regression tests cover delayed input switches, physical misses, actual navigation, attack admission, locked aim, hazard safety and real walking/early-dash/late-dash outcomes. Tutorial and README describe the changed default difficulty; values remain open to playtest tuning.

### Mana-inspired presentation
- Crawled the bundled TMX corpus (491 maps, 2,555 visual layers) for repeat motifs, resolving local atlas IDs and external tilesets. Corrected seven regional floor selections: paving, graveyard and stone ground retain authored two-dimensional patterns; cave, ice, snow and savannah floors no longer stamp hole/wall/pond fragments. Desert paving now uses the verified cobblestone motif rather than decorative border tiles. Graveyard grass is darkened/desaturated instead of hue-shifted magenta. Source coordinates, map credits and license metadata are documented in the README, with direct TMX regression tests.
- Corrected desert architecture using Source of Mana's actual wall atlas and authored Tulimshar TMX face/walkway courses, replacing the incorrect facade tiles and repeated windows. Door openings and collision remain unchanged; wall depth fits the existing 64px border. Added the unmodified TMX reference and regression checks against its actual tile positions.
- Sand now receives distance-based directional footprints that fade, avoid paving and reset on room changes/teleports. The starting soul menhir uses SoM's native sprite and a reduced-motion-aware aura. Imported wall/menhir/map assets are CC BY-SA 4.0, with Modanung, Crush and Reid credited and the exact source revision recorded.
- Windblown sand wisps now move across desert ground beneath entities and combat warnings, and decorative wall banners and torch flames animate. Reduced motion freezes the new effects; low quality skips wind and keeps scenery static. Terrain and collisions stay fixed.
- Pause inventory now uses a fitted, framed icon grid for collected equipment and consumable stacks, with mouse-hover names. Item/equipment behavior is unchanged.
- Original charcoal-and-gold canvas panels unify the HUD, minimap, weapon/action slots, messages, pause panel, codex, controls, tutorial and journal; matching page chrome and touch buttons retain their existing layouts and input behavior.
- Tulimshar and Candor now use intact dune patches, lightly blended cobblestone approaches to connected doors, and a softer desert palette.
- Subtle sand haze follows the desert room perimeter without obscuring the center or HUD. Reduced motion freezes drift; low quality skips the texture. Room-specific terrain caching is bounded to twelve entries.
- Reuses bundled, credited TMW artwork; no Source of Mana UI art is copied. The README identifies Source of Mana / Manasource / Reid as the presentation inspiration and adds per-asset paving and sandstorm credits and licenses.

### Touch aiming in cleared rooms
- Combat keeps nearest-live-enemy auto-targeting. When no live enemies remain in the current room, dragging Attack aims freely at breakables; holding without dragging fires in the player's facing direction instead of always east.
- Keyboard/mouse and controller aiming are unchanged. Touch instructions and regression tests cover manual aiming, facing, and transitions back to combat targeting.

### Weapon-aware mob AI
- Regular mobs adapt to the weapon style the player has been using. The player's recent attack time per style is tracked in `styleHeat` (`playermanager.js`, half-life 4 s); the leading style must hold a 25% lead to take over, so swapping weapons shifts the AI after a few seconds rather than instantly.
- `styleAIProfiles` (`mobmanager.js`) holds the responses and is read in `applyMobTactics`: melee widens the ring casters keep and has waiting foes strike during the player's swing recovery; bow narrows the ring, raises dodge odds and the melee attacker cap by one; magic widens ally spacing and speeds ranged mobs' attack cooldown. The effect scales lightly with the character's profile for that style.
- Bosses, minibosses and promoted boss-AI enemies ignore it. The first stance shift per run shows a short neutral message.
- Weapon swaps now have a 6 s cooldown (`WEAPON_SWAP_COOLDOWN` in `playermanager.js`); picking the already-active style does nothing and does not start it.
- While it runs, the two unselected weapon slots are greyed with a shrinking wedge and a seconds countdown (`drawStyleSlots` in `gameui.js`), and the touch Switch button shows the seconds left and is disabled.

## 2026-10-27

Built on the 2026-10-26 overhaul (`8ae8751`, "added some polish"). Covers commits `0654956`…`3e1759f`.

### Window scaling and fullscreen (branch `fit-window-hidpi`)
- The game fills the window. The canvas is the largest 16:9 box that fits between the top bar and the message bar, so nothing falls below the fold on short screens.
- The canvas draws at the screen's pixel density, capped at 3×, so it's sharp on high-DPI and scaled displays.
  - Drawing still uses a fixed 960×540 logical view (`VIEW_W`, `VIEW_H`). New code must use these instead of `canvas.width` and `canvas.height`, which are now the backing size.
  - `resizeCanvas()` sets the CSS size and `renderScale`. It runs from a `ResizeObserver` on `#stage` and from a pixel-ratio media query.
  - `applyRenderScale()` resizes the backing store and sets the transform at the start of each `draw()`.
  - `shadowBlur` is scaled by `renderScale` so glows keep their size.
  - In low quality, the canvas draws at its CSS size instead.
- The top bar and the message bar have fixed heights: the message bar is one line, and the controls hint and stats are at most three lines. Text that appears or clears no longer resizes the canvas mid-run.
- Fullscreen: Alt+Enter, or the Fullscreen button in the top bar. In fullscreen the top bar is hidden and the message bar is only visually hidden, so `aria-live` still works.
- Pointer coordinates are measured from the canvas content box, which removes a small offset caused by the border.

### Story and narration (`0654956`)
- New narration text for the prologue, region cards, floor-start lines, guardian clues, ancestry notes and the ending.
- Voice narration is switched off with `NARRATION_ENABLED = false` in `game.js` until the recordings match the new text.
  - While it is off, the read-aloud prompt, the narration (TTS) button and the T toggle are hidden.
  - `narrationActive()` is the single check for whether anything should speak.
- Renames:
  - shopkeepers are now merchants;
  - Boss Pinkie is now Pinkie Matriarch;
  - Fortress Island is now Candor Island;
  - Bone Warden is now Bone Guard.
- **Ironbound's class is renamed from `Sentinel` to `Sapper`.**
  - The keys in `classProfiles` and `classSignatures` (Bomb Forge), the class-ability check and the class hat were renamed with it.
  - New code that looks up classes by name must use `Sapper`.
- `monsterDisplayName(kind)` gives proper monster names. The codex, familiars and messages use it.
- The field journal shows the newest entries that fit, instead of the last six.

### Fixes (`7caa913`, `3e1759f`)
- **Duplicate rewards.** Re-entering a room no longer duplicates its unclaimed upgrade. Room rewards are added through `addRoomRewardPickup(room)` after `restoreRoomRuntime`, and older saves with duplicates are cleaned up on load.
- **Refused pickups.** Upgrades and curios that `grantUpgrade` refuses stay on the floor; they used to be consumed or retried every frame. A `pickup.refused` flag resets once the player steps off.
- **Boss drops.** Guardians only drop abilities the player can actually take. Otherwise they drop a heart and zenny.
- **Prism Shard.** It fans out again with the default water element (`'bubble'`). Only a non-water element fuses the fan into one shot.
- **Attack speed.** Gaining an ability, element or skill no longer slows a fire rate that is already faster than 0.55 s.
- **Burn and wet.** A duplicated timer block in `updateEnemy` made them expire twice as fast. It has been removed.
- **Reserved upgrades.** They are now cleared when moving to the next floor.
- **Enemy projectiles.** They are now removed when they hit the player.
- **Pause screen.**
  - Clicks work again; the handler was nested inside the select-screen branch.
  - The pause message follows the input device.
- **Controls.**
  - The codex D-pad scrolls once per press.
  - The controls hint keeps its line breaks (`#controls` uses `white-space: pre-line`).
- **Audio sliders.** The music and effects sliders (and the narration button) respond to clicks again. `pointInBounds` was being called with its arguments in the wrong order.

### Balance (`dcf4e8b`)
- Delvers start with 3–6 hearts based on their roster `hp`, instead of a flat 4.
  - `startingHearts(entry)` does the mapping.
  - The heart caps and save restores count extra hearts from that base.
  - Selection cards show each delver's hearts.
- Obstacle sets follow the region (`obstacleSpritesByRegion`, `regionObstacleSprites()`) instead of only the first three floors. Breakable caches use the same sets.
- Boss and enemy health, fire rates and mini-boss tuning from the overhaul are unchanged.

### Combat feedback (`a6b38f6`)
- Getting hit plays a sound, briefly freezes the frame, shakes the camera on every hit, and knocks the player away from the source.
  - `damagePlayer(amount, source)` now takes an optional source: an enemy, a projectile or a bomb.
  - Without one, the hit is credited to the nearest enemy within 220 px.
- Dying plays a 1.1 s slow-motion beat (`deathTimer`) before the game-over screen. During it, these are blocked:
  - movement, attacks and dash
  - bound actions (`runAction`)
  - the class ability and weapon switching
  - pausing and saving
- Enemies flash bright when hit instead of turning see-through, and the flash also counts down while they are frozen.
- Enemy deaths burst into particles and play species-specific TMW death sounds (`enemyDeathSounds`). Boss and mini-boss deaths shake the camera.
- Enemy projectiles are drawn above the player sprite.
- Enemy health bars only appear once the enemy is damaged.
- Messages:
  - `showMessage` also queues `messageToasts`.
  - The in-game commentary line now shows a stack of the three most recent messages, so they no longer overwrite each other.
  - `#message` is now the `aria-live` region.
- The HUD only rewrites its DOM text when it changes.
- Sprites are drawn with nearest-neighbour scaling (`ctx.imageSmoothingEnabled = false`). The HUD heart icon keeps smoothing.

### Run summary and title screen (`ca1fc05`)
- Game-over and victory screens show a run summary (`drawRunSummary`):
  - delver, level, floor, time, score;
  - foes and guardians defeated, zenny found;
  - last hit taken (game over only);
  - the region route, collected item icons, and delvers unlocked this run.
- The summary waits 0.6 s before accepting input. It then accepts Enter, A or a click, and returns to the same delver.
- With a saved run, Descend/Enter needs a second press before starting a new run (`requestNewRun`). Controller focus starts on Resume.
- The prologue opens the game only until it has been read once. It can be replayed with the Prologue button, P, or LB on a controller.
- Mouse page arrows sit beside the delver cards.

### Source of Mana sounds (uncommitted)
- Enemies with a Source of Mana counterpart use that mob's attack, hit, death and dodge cues. `somMobByEnemy` maps enemy kinds to SoM mobs and `somMobEvents` lists the cues SoM ships for each; `somEnemySound(enemy, event)` resolves them.
  - Matches: ratto, bat and vampirebat, slime, snake, scorpion, croc, fluffy, skeleton, spore-sower (shroom), bosspinkie (pinkie), junglefowl (piou), snail (turtle).
  - A matched mob without a cue keeps the old one. Hit and dodge fall back to SoM's shared `alteration/hit` and `alteration/dodge` for every other enemy; attack and death keep the TMW cues.
  - The Great Red Slime (`slime-mother`) keeps its TMW roar and super-slime death cue.
  - Enemies now play a hit cue when damaged (140 ms per-enemy gap) and a dodge cue when they sidestep a shot.
  - `tmwEnemySounds` gives species with no SoM counterpart their own TMW attack, hurt and death cues: zombie, spider and Spider Queen, bee, yeti and Yeti King, snowmen, golem, reaper, jacko, dragons, frostiana, wisp and the Great Red Slime. `enemySound(enemy, event)` picks the SoM cue, then the TMW cue, then the shared fallback. It replaces `enemyDeathSounds` and `somEnemySound`.
- Breakable obstacles play TMW hit and break sounds (`sound` on each `obstacleSprites` entry, played from `damageObstacle`). The cactus and plant sounds are loose matches.
- Bombs use `system/boom.ogg`, descending a floor plays `system/warp.ogg`, and buying a non-upgrade shop item plays `system/item.ogg`.
- Non-enemy cues from SoM's `alteration` set: level up, upgrade gained (`skillup`), guardian defeated (`quest-done`), room cleared (`quest-update`), coin, heart and XP pickups (throttled by `playPickupSound`), and a key opening a door (`chest/open`). The level-up and guardian-defeated cues replace the TMW fanfare.
- `playSound` paths starting with `som:` load from `assets/som/sounds`. The files and their credits are in `assets/som` (CC BY-SA 4.0).

### Save data
- Run saves gain a `runStats` object. Older saves load with empty stats.
- Reading the prologue adds `'prologue'` to `save.introducedChapters`. Resetting all progress shows the prologue again.
- Run saves store the character id, not the class name, so the Sapper rename does not affect existing saves.

### Known gaps
- The Soul Menhir uses the overhaul's own lines; the rewritten Menhir text was not carried over.
- No crash guard yet: an exception in `update` or `draw` stops the game loop, and a corrupt run save fails on every Resume.
