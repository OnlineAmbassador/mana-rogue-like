# Changelog

Notable changes to MANA: Hollow Sanctum, newest first. Entries list the commits they cover so the details can be found with `git show`.

These entries were later ported onto upstream's module split (`gameui.js`, `mobmanager.js`, `playermanager.js`, `dbmanager.js`, `worldmanager.js`) in the `Text:`, `Fix:`, `Gameplay:`, `Feedback:`, `Audio:` and `Display:` commits. The original commit IDs listed below are kept on the `backup/main-pre-improvements` and `backup/hidpi-pre-improvements` tags. The slider fix from `3e1759f` was already made upstream.

## 2026-10-29

### Weapon-aware mob AI
- Regular mobs adapt to the weapon style the player has been using. The player's recent attack time per style is tracked in `styleHeat` (`playermanager.js`, half-life 4 s); the leading style must hold a 25% lead to take over, so swapping weapons shifts the AI after a few seconds rather than instantly.
- `styleAIProfiles` (`mobmanager.js`) holds the responses and is read in `applyMobTactics`: melee widens the ring casters keep and has waiting foes strike during the player's swing recovery; bow narrows the ring, raises dodge odds and the melee attacker cap by one; magic widens ally spacing and speeds ranged mobs' attack cooldown. The effect scales lightly with the character's profile for that style.
- Bosses, minibosses and promoted boss-AI enemies ignore it. The first stance shift per run shows a short neutral message.

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
