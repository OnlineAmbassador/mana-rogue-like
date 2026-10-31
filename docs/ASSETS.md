# Asset provenance

This file records where the game's visuals and recordings come from. It separates human-made Manasource assets from visuals that agents wrote as canvas or CSS code, and it lists everything agent-made that should eventually be replaced. Per-file authors and licenses of the human-made assets stay in [CREDITS.md](CREDITS.md) and `assets/som/CREDITS.md`.

## Rules

The same rules are kept in [HANDOFF.md](HANDOFF.md) under "Persistent instruction". Change both copies together.

1. **Goal.** The long-term goal is to use only human-made assets. Every agent-made visual or recording in the game is on the replacement list below until a human-made asset replaces it.
2. **UI chrome is permitted.** HUD panels, menu frames, bars, text, damage numbers, map and minimap shapes, HUD glyphs and the CSS touch controls may stay code-drawn. They are listed at the end for completeness and are not on the replacement list.
3. **Hybrids are permitted.** A credited human-made bitmap drawn with a runtime recolour, filter, mask, outline, glow, shadow or overlay counts as human-made. The treatment must happen at draw time only.
4. **Bitmaps on disk are never edited by an agent.** No agent may change an original image file's pixels, crop, resize, re-encode or re-save it, or create a derived image file from it. Files stay exactly as shipped upstream. A needed change is made at draw time (rule 3) or by the user.
5. **Keep this file current.** A change that adds an agent-drawn visual or generated media adds a line here in the same change. A change that replaces one ticks its line here and credits the new asset in [CREDITS.md](CREDITS.md). Prefer an existing licensed Manasource asset to drawing a new one; a new import needs its exact license, author and source verified.

**Terms.** *Human-made*: a bitmap or sound by a credited person. *Agent-made*: canvas or CSS drawing, or generated media, written by an agent. *Hybrid*: a human-made bitmap with an agent-made draw-time treatment (rule 3).

**Replacement priority.** In-world combat effects and enemy telegraphs first (they are on screen most), then world objects and rooms, then pickups and icons, then environment and lighting. Bitmap-load fallbacks come last and may stay.

## Human-made assets in use

| Source | What | Credits |
| --- | --- | --- |
| The Mana World client data (`assets/tmw/clientdata`, snapshot `3ab88eb5`) | Player, hair and clothing sprites, monster sprites, item icons, hats, floor tilesets, castle and desert walls, footprints, sandstorm, sound effects | [CREDITS.md](CREDITS.md), `assets/tmw/clientdata/LICENSE` |
| Source of Mana (`assets/som`) | Sandstone walls (`wall.png`), Soul Menhir, Artis market sheet (shop stalls, counters, banners), Tulimshar map fixture, sound effects | `assets/som/CREDITS.md` |

**Check of the files on disk (2026-10-31).** `assets/som/CREDITS.md` records its images as unedited. In git history the only commit that modified existing TMW images is `b107cbb` (2026-10-25). It changed 598 files across the whole client-data tree, including the upstream CI scripts, `.mailmap` and tooling, which matches an upstream refresh rather than an edit; no agent edit of a bitmap was found. The files have not been compared byte for byte with upstream revision `3ab88eb5`. That comparison is the open item at the end of the list.

## Agent-made visuals to replace

Each line names the visual, what it looks like and the function that draws it. All are canvas drawing. No agent-made image file exists: there is no image outside `assets/tmw` and `assets/som`, no favicon, no SVG and no `data:` image URI.

### Combat effects

- [ ] **Charge beam**: thick glowing line with a white core and a white impact disc (`drawWorld`, projectile loop, `gameui.js`).
- [ ] **Wild-magic halo**: pulsing ring around a projectile (`drawWorld`).
- [ ] **Launch flash**: ring expanding from the muzzle on firing (`drawWorld`).
- [ ] **Player arrow**: line shaft, triangle head and fletching, with fire tail, lightning zig-zag or aura for elemental arrows (`drawWorld`).
- [ ] **Morph-shape spell projectiles**: ring, diamond and ellipse with a highlight dot (`drawMorphShape`, `gameui.js`).
- [ ] **Elemental spell projectiles**: bubble, fire teardrop, lightning bolt, ice/earth shard, wind gust lines, spore mushroom, gas cloud (`drawWorld`).
- [ ] **Spore shard**: small glowing kite (`drawWorld`).
- [ ] **Particles**: fading circles and streaks; also the whole look of the shockwave, frost nova, bomb blasts and sword-hit streaks (`addParticles`, `useShockwave`, `playermanager.js`; drawn in `drawWorld`).
- [ ] **Melee hit wedge and swing ribbon**: translucent swing-area wedge, sweeping edge, deflect dot and glowing arc (`drawWorld`).
- [ ] **Lightning chain arcs**: jittered polylines with a white core (`drawWorld`).
- [ ] **Player laser beams**: pink line with a white core (`drawLaserBeams`, `playermanager.js`).
- [ ] **Spore pods**: pulsing purple circles (`drawSporePods`, `playermanager.js`).
- [ ] **Magic mark**: diamond outline above affected enemies (`drawPlayerMagicMark`, `gameui.js`).
- [ ] **Mana-slam lift lines and mana-bomb pulse with "!"** (`drawEnemy`, `gameui.js`).

### Enemy and boss telegraphs, hazards and projectiles

- [ ] **Strike markers and wide pulse**: red disc that fills while charging (`drawGroundHazards`, `gameui.js`).
- [ ] **Ground hazards**: shadowed coloured pool with per-kind detail: **fire pool** flame tongues, web spokes, miasma puffs, lightning bolt from above, acid bubbles (`drawGroundHazards`).
- [ ] **Twin link tethers and hook rope**: dashed lines between enemies (`drawEnemyBody`, `gameui.js`).
- [ ] **Gust arrows**: three chevrons (`drawEnemyBody`).
- [ ] **Burn flame**: flickering polygon above a burning enemy (`drawEnemyBody`).
- [ ] **Boss attack telegraphs**: spider-queen pounce circle and line, jacko ground-pound circle, golem slam circle and charge lane (`drawEnemyBody`).
- [ ] **Signature wind-ups**: wind-up and target rings and room-wide horizontal, vertical or directed lanes (`drawEnemyBody`).
- [ ] **Enemy lasers**: purple signature laser and red charge/fire laser (`drawEnemyBody`).
- [ ] **Bomb-throw target ring, generic wind-up ring, aimed-shot dashed line, link-enraged ring** (`drawEnemyBody`).
- [ ] **Enemy projectiles**: arrow, spore orb with orbiting seeds, spore shard, default glowing orb (`drawEnemyProjectile`, `gameui.js`).

### Player and companion effects

- [ ] **Charge ring**: progress arc around the player (`drawPlayer`, `gameui.js`).
- [ ] **Casting hands**: glowing orb on the chest, or a sliver in side view (`drawCastingHands`, `gameui.js`).
- [ ] **Overhead pops**: dark badge with a drawn arrow, padlock, heart, key, bomb or dot; an image when one is set (`drawOverheadPops`, `gameui.js`).
- [ ] **Hurt vignette**: dark radial gradient around the player (`drawHurtVignette`, `playermanager.js`).

### World objects and rooms

- [ ] **Doors**: sealed and locked panels with bars and padlock, open-door frame, boss door with pulsing red frame and skull (`drawRoomFloor`, `gameui.js`).
- [ ] **Secret-wall crack**: X strokes on a hidden wall (`drawRoomFloor`).
- [ ] **Bombs**: dark circle with a fuse, red near detonation; enemy bombs add a target ring (`drawWorld`).
- [ ] **Elemental Menhir**: wholly drawn stone, glow, shadow, element disc and glyph, rising motes (`drawElementalMenhir`, `gameui.js`).
- [ ] **Reward trials**: glowing numbered rune nodes; mirror puzzle beams, source, mirrors and receiver (`drawRewardTrial`, `gameui.js`).
- [ ] **Risk shrine altars**: ellipse plinths with pulsing rings (`drawRiskShrine`, `gameui.js`).
- [ ] **Guardian shrine**: ellipse with a pulsing ring (`drawWorld`).
- [ ] **Boss descent plate and Zeny Vault pads**: rectangle and circles (`drawWorld`; labels are UI).
- [ ] **Shop sell and repair pads, pedestal rings**: pulsing circles (`drawShopPad`, `drawShopRoom`, `shopart.js`).
- [ ] **Lore relic**: glowing teal disc with a diamond (`drawWorld`).
- [ ] **Breakable crack lines and gold drop marker** drawn over the breakable bitmap (`drawWorld`).

### Pickups, items and icons

- [ ] **Pickup textures**: key, bomb, zeny coin with "Z", XP diamond, built as 16x16 drawings (`drawPickupItem`, `gameui.js`).
- [ ] **Vector item icons** for items with no bitmap: compass, flame, bolt, cloud, snowflake, prism, feather, orb, bow/dagger, star, sword, tunic, cat face, bomb, flask, crosshair (`drawShopItemIconArt`, `gameui.js`).
- [ ] **Guaranteed-treasure ring** (`drawWorld`).
- [ ] **Curio "?" mark** when a curio has no icon (`drawWorld`).

### Environment and lighting

- [ ] **Room sunlight**: diagonal tint, wall-cast shadow polygons, cave light shafts and dust motes (`drawRoomSunlight`, `lightingmanager.js`).
- [ ] **Blob shadows**: trunk and ground ellipses under objects, pickups and projectiles (`drawTrunkShadow`, `drawSunGroundShadow`, `drawProjectileGroundShadow`, `lightingmanager.js`).
- [ ] **Light pools**: radial glows from fire and lightning hazards, glowing projectiles and the magic charge (`drawWorldLightSources`, `collectWorldLights`, `lightingmanager.js`).
- [ ] **Desert wind wisps**: curved streaks (`drawDesertWind`, `desertart.js`).
- [ ] **Desert edge haze**: four edge gradients; the sandstorm image over them is human-made (`drawRegionAtmosphere`, `desertart.js`).

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

## UI chrome (permitted)

Code-drawn by design (rule 2). Listed for completeness.

- Panels: `drawManaPanel` and everything built on it (HUD, minimap, slots, messages, pause, codex, controls, tutorial, journal, shop cards).
- HUD glyphs: armour, zeny, key, bomb and familiar icons (`drawGameHud`), action-slot glyphs and cooldowns (`drawActionBar`), weapon-style glyphs (`drawStyleSlots`). The coin, key and bomb glyphs could reuse a human-made icon once the in-world versions have one.
- Map and minimap shapes, padlock and legend (`drawMap`, `drawMinimap`).
- Damage numbers, text and outlines (`drawDamageNumbers`, `withTextOutline`), menus and screens (`drawPrologue`, `drawCharacterSelect`, `drawCodex`, `drawControls`, `drawRunSummary` and the rest).
- `style.css` page, HUD frames and touch controls; Unicode button glyphs in `index.html`.
