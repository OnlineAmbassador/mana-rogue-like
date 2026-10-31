# Asset provenance

This file records where the game's visuals and recordings come from. It separates human-made Manasource assets from visuals that agents wrote as canvas or CSS code, and it lists everything agent-made that should eventually be replaced. Per-file authors and licenses of the human-made assets stay in [CREDITS.md](CREDITS.md) and `assets/som/CREDITS.md`.

## Rules

The same rules are kept in [HANDOFF.md](HANDOFF.md) under "Persistent instruction". Change both copies together.

1. **Goal.** The long-term goal is to use only human-made assets. Every agent-made visual or recording in the game is on the replacement list below until a human-made asset replaces it.
2. **UI chrome is permitted.** HUD panels, menu frames, bars, text, damage numbers, map and minimap shapes, HUD glyphs and the CSS touch controls may stay code-drawn. They are listed at the end for completeness and are not on the replacement list.
3. **Hybrids are permitted.** A credited human-made bitmap drawn with a runtime recolour, filter, mask, outline, glow, shadow or overlay counts as human-made. The treatment must happen at draw time only.
4. **Bitmaps on disk are never edited by an agent.** No agent may change an original image file's pixels, crop, resize, re-encode or re-save it, or create a derived image file from it. Files stay exactly as shipped upstream. A needed change is made at draw time (rule 3) or by the user.
5. **Keep this file current.** A change that adds an agent-drawn visual or generated media adds a line here in the same change. A change that replaces one ticks its line here and credits the new asset in [CREDITS.md](CREDITS.md). Prefer an existing licensed Manasource asset to drawing a new one; a new import needs its exact license, author and source verified.
6. **Files with no recorded license.** A file that The Mana World or Source of Mana ships without a recorded license may be used, because this project is part of the Manasource family. Credit it in [CREDITS.md](CREDITS.md) with its source path and "license not recorded upstream", naming any author the upstream records give, the same way TMW's `license-missing` file lists it.

**Terms.** *Human-made*: a bitmap or sound by a credited person. *Agent-made*: canvas or CSS drawing, or generated media, written by an agent. *Hybrid*: a human-made bitmap with an agent-made draw-time treatment (rule 3).

**Replacement priority.** In-world combat effects and enemy telegraphs first (they are on screen most), then world objects and rooms, then pickups and icons, then environment and lighting. Bitmap-load fallbacks come last and may stay.

## Human-made assets in use

| Source | What | Credits |
| --- | --- | --- |
| The Mana World client data (`assets/tmw/clientdata`, snapshot `3ab88eb5`) | Player, hair and clothing sprites, monster sprites, item icons, hats, floor tilesets, castle and desert walls, footprints, sandstorm, sound effects | [CREDITS.md](CREDITS.md), `assets/tmw/clientdata/LICENSE` |
| Source of Mana (`assets/som`) | Sandstone walls (`wall.png`), Soul Menhir, Artis market sheet (shop stalls, counters, banners), Tulimshar map fixture, sound effects | `assets/som/CREDITS.md` |

**Check of the files on disk (2026-10-31).** `assets/som/CREDITS.md` records its images as unedited. In git history the only commit that modified existing TMW images is `b107cbb` (2026-10-25). It changed 598 files across the whole client-data tree, including the upstream CI scripts, `.mailmap` and tooling, which matches an upstream refresh rather than an edit; no agent edit of a bitmap was found. The files have not been compared byte for byte with upstream revision `3ab88eb5`. That comparison is the open item at the end of the list.

## Agent-made visuals to replace

Each open line names a visual that is still drawn in code, what it looks like and the function that draws it, with any partial Manasource candidate found so far. All are canvas drawing. No agent-made image file exists: there is no image outside `assets/tmw` and `assets/som`, no favicon, no SVG and no `data:` image URI. The search behind the candidate notes covered the full TMW client data at `3ab88eb5` (before the asset trim; `git show e4b8cbe^:<path>`) and Source of Mana at `ebb0335f`.

### Combat effects

- [ ] **Mana-slam lift lines**: two vertical lines while a foe is lifted (`drawEnemy`, `gameui.js`). No match found.

### Enemy and boss telegraphs, hazards and projectiles

- [ ] **Lines between points**: twin link tethers and the hook rope (`drawEnemyBody`, `gameui.js`), the spider-queen pounce line, golem charge lane, signature room-wide and directed lanes and the aimed-shot dashed line (`drawEnemyBody`). No match found.
- [ ] **Enemy lasers**: purple signature laser and red charge/fire laser (`drawEnemyBody`). The TMW glow stretched along a line, as the player's beams now do, would fit.

### Player and companion effects

- [ ] **Overhead pops**: up/down arrows, padlock and bomb glyphs, and the dark badge behind every pop (`drawOverheadPops`, `gameui.js`). The heart, key and dot are replaced.

### World objects and rooms

- [ ] **Doors**: sealed and locked panels with bars and padlock, open-door frame, boss door with pulsing red frame and skull (`drawRoomFloor`, `gameui.js`). Candidates: TMW `sprites/npcs/sprite/artisdoor.png` (IvanMorve, Reid; 6-frame opening door) and `sprites/monsters/gate.png` (Irvkard; barred gate); they need fitting to the 96 px wall openings.
- [ ] **Secret-wall crack**: X strokes on a hidden wall (`drawRoomFloor`). No match found.
- [ ] **Bombs**: dark circle with a fuse, red near detonation (`drawWorld`). No bomb art exists in either source.
- [ ] **Mirror puzzle**: beams, light source, mirror discs and receiver (`drawRewardTrial`, `gameui.js`). Partial candidates: TMW `items/generic/silvermirror.png`, `sprites/npcs/sprite/switch.png` (CC0).
- [ ] **Risk shrine altars**: ellipse plinths with pulsing rings (`drawRiskShrine`, `gameui.js`). Candidate: TMW `tilesets/sot/shrine.png` (Casper Nilsson), a tileset a person needs to compose.
- [ ] **Guardian shrine**: ellipse with a pulsing ring (`drawWorld`). Same candidate as the altars.
- [ ] **Breakable crack lines** drawn over the breakable bitmap (`drawWorld`). No match found.

### Pickups, items and icons

- [ ] **Bomb pickup** texture (`drawPickupItem`, `gameui.js`). No bomb art exists in either source.
- [ ] **Vector item icons** still drawn for the prism, clothing, bombs and the generic crosshair (`drawShopItemIconArt`, `gameui.js`). Partial candidate for the prism: TMW `items/usable/box/prismgift.png`.

### Environment and lighting

- [ ] **Room sunlight tint and wall-cast shadows**: a diagonal gradient and shadow polygons along the upper walls (`drawRoomSunlight`, `lightingmanager.js`). Partial candidates: TMW `tilesets/evol/shadow.png` (Reid), SoM `tilesets/aemil/aurora/artis/shadows.png` (Mikko).
- [ ] **Desert wind wisps**: curved streaks (`drawDesertWind`, `desertart.js`). Partial candidate: TMW `images/ambient/desertclouds.png` (Saulc).
- [ ] **Desert edge haze**: four edge gradients under the human-made sandstorm (`drawRegionAtmosphere`, `desertart.js`). Candidates: TMW `images/ambient/light_fog.png` (jesusalva, CC0), `images/ambient/fog.png` (Crush).

### Replaced with Manasource art (2026-10-31)

Drawn by `effectart.js` from unmodified TMW and Source of Mana files (credits in [CREDITS.md](CREDITS.md) and `assets/som/CREDITS.md`); scaling, rotation and tinting happen at draw time, so these now count as hybrids (rule 3).

- [x] Charge beam and player laser: TMW glow stretched along the beam, TMW beam-crit impact.
- [x] Wild-magic halo, strike markers, wide pulse and every ground or wind-up circle (spider pounce, jacko, golem slam, signature, bomb target, generic wind-up, link-enraged, charge ring, descent, vault and shop pads, shop pedestals): SoM magic circles, with a TMW glow as the fill.
- [x] Launch flash: TMW sparkles. Magic mark and motes: TMW star.
- [x] Player and enemy arrows: SoM arrow; fire and lightning trails: SoM fire and TMW sparks.
- [x] Spell projectiles: SoM orbs and mana ball (morph shapes), SoM bubble, SoM fire, TMW sparks, TMW snowflake, the existing roundstone in a glow (earth), SoM sonic wave, TMW spore bubble, SoM smoke.
- [x] Spore shards and pods, enemy spore orb and default orb: TMW spore particles, SoM glow and mana ball.
- [x] Particles: SoM glow orb and arc streak. Bomb blast, shockwave and frost nova bursts: TMW aniblaze, SoM magic circle, TMW blue puff.
- [x] Melee swing and hit marker: TMW swipe frames and star.
- [x] Lightning chains and strikes: TMW lightning bolt (license not recorded upstream).
- [x] Ground hazards: a TMW glow flattened and tinted per hazard, SoM spiderweb, SoM fire, SoM smoke, SoM bubbles, all on the TMW round shadow.
- [x] Gust arrows: SoM sonic wave. Burn flame: SoM fire. Mana-bomb pulse and "!": TMW glow and surprise emote.
- [x] Casting hands: SoM glow orb. Hurt vignette: TMW spotlight overlay.
- [x] Overhead heart, key and dot: TMW heart, copper key and star.
- [x] Elemental Menhir: TMW menhir stones, one per element, with the element's own effect sprite as the glyph.
- [x] Trial rune nodes: TMW runestones on SoM magic circles.
- [x] Lore relic: TMW spell book. Guaranteed-drop and treasure markers: SoM twinkle. Curio "?": TMW question mark.
- [x] Key, zeny and experience pickups: TMW copper key, gold pieces and diamond.
- [x] Item icons for lore, fire, lightning, gas, frost, feather, passives, bow, sword, magic, companions and the mana tonic: TMW and SoM icons.
- [x] Blob and trunk shadows: TMW round shadow. Light pools: TMW glow. Cave light shafts and dust: TMW sunlight shaft, SoM orb.

### Bitmap-load fallbacks (lowest priority)

Drawn only when a bitmap fails to load. They may stay as safety nets.

- [ ] Breakable rectangle, ball and sprout (`drawFallbackBreakable`, `gameui.js`).
- [ ] Enemy circle (`drawEnemyBody`), humanoid circle (`drawHumanoid`), Soul Menhir polygon (`drawSoulMenhir`), thrown-stone circle and legacy pickup shapes: coin, XP gem, bomb, key, heart, consumable and material blocks (`drawWorld`), heart shape (`drawPickupItem`, `drawHealthHeart`).

### Open checks

- [ ] Compare the TMW images on disk byte for byte with upstream revision `3ab88eb5` to confirm none differs from the published files (rule 4).

## Audio of unknown provenance

- [ ] **Narration recordings**: 28 files in `assets/audio` (`prologue-01` to `03`, nine `intro-region-*`, sixteen `intro-character-*`). Their author, method and license are not recorded. They are switched off (`NARRATION_ENABLED = false` in `game.js`) until they are redone to match the current text. Confirm their origin, or replace them with human recordings before turning narration back on.

All other sounds are human-made TMW and Source of Mana effects, credited in [CREDITS.md](CREDITS.md) and `assets/som/CREDITS.md`.

## Hybrid assets (permitted)

Human-made bitmaps with draw-time treatment only. Not on the replacement list.

- Enemy status looks: frost tint and glow, slime-mother recolour, jacko glow, hit and light flashes (`drawEnemyBody`).
- Player tint, invulnerability blink, charge-ready flash, parry, weapon and bow glows (`drawPlayer`).
- Skin-tone and hue correction of player, merchant, map and character-select sprites (`correctSkinTone`, `drawHumanoid`).
- Companion glow (`drawCompanion`), elite aura ring with the wizard hat (`drawEnemyBody`), link shield badge (`drawEnemyBody`).
- Terrain recolours for graveyard, Artis and Candor (`drawRoomFloor`), desert ground filters and paving masks (`drawDesertGround`, `desertPavingCoverage`), footprint fade (`drawSandFootprints`), sandstorm drift (`drawRegionAtmosphere`).
- Breakable tints (`getBreakableFrame`).
- Lifestone and Dark Crystal dyes (`loadDyedAsset`, `dyeGreyPixels`), item pixel outlines (`outlinedItemTexture`).
- Sprite sun shadows derived from sprite alpha (`sunlightMask`, `drawSunSpriteShadow`).
- Soul Menhir glow and motes (`drawSoulMenhir`), upgrade bubble, curio and material-ore glows (`drawWorld`), heart fill (`drawHealthHeart`).
- Every effect, circle, shadow, light and icon drawn through `effectart.js` (`drawEffect`, `drawEffectCircle`, `drawEffectBetween`, `tintedEffectImage`); see "Replaced with Manasource art" above.

## UI chrome (permitted)

Code-drawn by design (rule 2). Listed for completeness.

- Panels: `drawManaPanel` and everything built on it (HUD, minimap, slots, messages, pause, codex, controls, tutorial, journal, shop cards).
- HUD glyphs: armour, zeny, key, bomb and familiar icons (`drawGameHud`), action-slot glyphs and cooldowns (`drawActionBar`), weapon-style glyphs (`drawStyleSlots`). The coin and key glyphs could now reuse the TMW gold pieces and copper key that the pickups use.
- Map and minimap shapes, padlock and legend (`drawMap`, `drawMinimap`).
- Damage numbers, text and outlines (`drawDamageNumbers`, `withTextOutline`), menus and screens (`drawPrologue`, `drawCharacterSelect`, `drawCodex`, `drawControls`, `drawRunSummary` and the rest).
- `style.css` page, HUD frames and touch controls; Unicode button glyphs in `index.html`.
