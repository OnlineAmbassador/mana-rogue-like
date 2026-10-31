# MANA: Hollow Sanctum

A browser-based, room-by-room action roguelike set in the world of [The Mana World](https://www.themanaworld.org/). Pick one of twenty delvers, fight through nine shuffled regions, and defeat each regional guardian. It runs on a single HTML5 canvas with plain JavaScript: no build step, no framework, no install. Its story is fan-made and noncanonical; the source assets remain credited under their original licenses.

## Quick start

1. Serve the folder with any static server (for example `python -m http.server 8000`) and open http://localhost:8000/, or open `index.html` directly (a server is recommended so audio and artwork load reliably).
2. Set the music and effects volume sliders on the title screen, pick a delver, and press Enter.
3. Click **HOW TO PLAY** (or press H) on the select screen for the interactive tutorial. It shows your current keyboard or controller bindings.

Works in current Chrome, Edge, Firefox and Safari with a keyboard and mouse, an Xbox or PlayStation controller, or phone touch controls.

On phones, drag the left movement area with one thumb and hold the right attack area with the other. While any live enemy remains in the current room, attacks automatically target the nearest one, regardless of dragging. Once no live enemies remain, drag the attack area to aim freely at breakables; holding without dragging fires in your facing direction, so walking before attacking also lets you choose a direction. Tap the Attack button while in reach of an interactable to interact instead of attacking. Visible buttons also provide dash, bombs, explicit interaction, skills, items, mana guard (or unlocked Shockwave), weapon switching, bank withdrawal, map, journal, and pause. Touch controls hide when a controller connects or you use a mouse or keyboard; they return when the controller disconnects or you return to touch. Landscape uses the available screen height; portrait keeps the controls below the game. Both preserve the 960-by-540 game coordinates. Tap the roster's side arrows to select other delvers, and tap the upper or lower pause area to resume or save and exit.

Control prompts and touch layout follow the most recently used input: controller button/stick, keyboard or mouse button, or touchscreen. A touchscreen activates its controls when first pressed rather than merely because the device supports touch. Touch auto-targeting resumes as soon as a live enemy is present in the current room.

Landscape touch layouts hide the external title/stats header and message panel, fit the game inside the browser's visible height and safe areas, and overlay the controls without pushing the canvas down. Touching the screen activates controls even when the browser reports a fine pointer or no touch capability. A smaller Dash bubble sits just above Attack within right-thumb reach. Large Bomb and Use Item buttons show inventory counts and are disabled when empty; Switch changes weapons. Use Item retains the normal smart selection of a usable consumable, including healing potions when injured.

Compatible presentation fixes adapted from [WildX-480's fork](https://github.com/WildX-480/mana-rogue-like): preserved control-hint line breaks and live game-message announcements. Its unrelated balance and audio changes are not merged.

## Visual presentation

The UI uses original charcoal panels, fine gold bevels and corner ornaments inspired by [Source of Mana by Manasource and Reid](https://manasource.itch.io/source-of-mana), with matching HUD, minimap, menus and touch buttons. This is an independent fan project, not an official Source of Mana release; no Source of Mana UI artwork or screenshot pixels are copied.

Items use a thin dark-blue outline (`#0e0868`) sampled from a color reference, without using its artwork. Keys, bombs, hearts, coins and other drops are larger; transparent icon padding is cropped before scaling, with cached outlines shared by drops, shops, inventory and item action slots. World text uses the door labels' bold 10px Arial and dark outline consistently, including merchant labels, descriptions and drop names; blue outlines apply to icons, not text. HUD and menu typography are unchanged. Player body, clothing, head, weapons and attack pulse retain their original 1.45x presentation. Mobs, bosses and offspring use the midpoint between their old scale and the larger integer-scale experiment; companions follow the same midpoint adjustment. Nearest-neighbor rendering remains enabled, and collision, collection and combat distances are unchanged.

Tulimshar and Candor use continuous dune patches, translucent worn cobblestone approaches to connected doorways, and a quieter desert palette. Paving meanders with room-seeded bends, changing widths, a rounded junction and irregular sand-eroded edges sampled on a 4px grid, rather than a square plaza with rectangular arms. The existing authored cobblestone motif remains aligned and unstretched beneath the mask; footprints use the same coverage boundary. Len's [Whispers of Avalon cobblestone path studies (17 August 2011)](https://forums.themanaworld.org/viewtopic.php?p=110932#p110932), especially `pathtest.png` and `path and side walk.png`, are layout references for broken edges and uneven widths, not copied artwork. The current sand/paving transitions are an original procedural adaptation of existing licensed textures, not Len's hand-authored grass/stone transition tiles.

Tulimshar uses the upper-left 96x128 wall frame from Evol/TMW's `graphics/tilesets/castle1.png`, restored unmodified from local asset history. Its top corners and coping use local IDs `[0,1,2]`, vertical sides `34` and `36`, and lower corners/coping `[51,52,53]` in the 17-column atlas. The central window (`35`) is not repeated. Walls retain their native 32px scale; partial end tiles are cropped, never stretched. The experimental island, ocean, surf masks and expanded sandstone walls have been removed.

Room dimensions stay unchanged. Tulimshar's collision border matches the thinner 32px walls, restoring more playable floor than either expanded border. Sand continues underneath the east and west walls so their transparent edges overlap ground rather than leaving empty strips; paving and collision remain inside the border. Door openings remain 96px wide, with their original panels, lock/seal indicators and boss warning. Other regions and secret chambers retain their 64px border and existing presentation. Artwork attribution: Irvkard, contributor TMW-BR, GPL 2.0; see the bundled client-data `LICENSE`.

Decorative flags and candles/torches are removed. Lightweight ambient sand gusts drift and fade over the ground beneath characters and combat warnings, with perimeter sand haze providing atmosphere. Reduced motion freezes gusts and the soul-menhir aura; low quality keeps four single-stroke gusts animated, omits the perimeter sand texture and reduces glow/particles. Dune ground and worn interior paving remain stationary.

Visible Tulimshar doorways use the approved south-facing 32px corner pair at atlas `(32,640)` and `(64,640)`. The entire pair rotates counterclockwise around each doorway: south 0 degrees, north 180, east 90 and west 270. This preserves the bevel orientation rather than substituting differently lit corner tiles. Corners stay flush within the wall band and leave the 96px passage clear. Sand extends beneath their native transparency, and replaced straight wall pixels are cleared from the cache. Corners remain visible for locked/sealed routes and appear at secret routes only after discovery; the static wall cache includes them.

Walking over desert sand leaves directional footprints which fade after eight seconds; paving does not receive tracks. Trails are distance-based, limited to 96 marks, and reset on room changes or teleports. The starting room's soul menhir now uses the native Source of Mana sprite, rather than a different TMW stone variant.

All regions share directional light from the upper left at 45 degrees, with shadows projected equally down and right. Animated sprite silhouettes follow actors and their elevation; walls cast floor shadows with gaps at open doorways. Candor, Frostia, World Edge and secret chambers receive subtle god rays through ceiling crevices instead of outdoor sunlight. Shafts stay fixed in each room, with gently moving dust and brightness. Lighting does not change combat, collision or HUD colors.

Shadow anchors use the last opaque sprite row, not the transparent bottom of its tile, so grounded feet stay connected through animation. Alpha bounds are read once per cached frame. Fire, lightning, luminous enemy orbs, charged magic and beams illuminate nearby ground; nearby actor sprites brighten and their sunlight shadows soften without disappearing. Airborne player/enemy shots (including fire) cast separated ground shadows; player shot shadows converge as their existing ballistic animation lands. Pure light beams illuminate without a solid-object shadow. Acid/slime pools and gas receive a faint 2px lower-right depth edge, while web shadows follow the strands rather than filling a dark disc.

Ground-contact shadows begin beneath objects and are smallest at zero elevation; both silhouette and projectile/bomb shadows enlarge as elevation increases, while remaining projected lower-right. Bat and vampire-bat bodies use only the upper 22px of each native 37x58 frame, removing baked-in shadow rows from both mobs and companions. Cropping preserves atlas spacing and body alignment rather than stretching the cropped frame; their flying bodies cast only the new directional shadow.

The current room's static lighting and source-frame silhouette masks are cached; masks are limited to 128 frames per image. Local light textures are capped at 16 colors, with up to 24 visible emitters, and projectile shadows are culled offscreen. Low quality retains directional shadows and rays but reduces shaft dust from six to two motes. Reduced motion freezes shaft ambience, while moving actors still cast moving shadows. These optimizations do not establish frame rates on the actual phone; device playtesting remains necessary. Serve the game over HTTP for exact alpha-based foot anchoring; browsers that block local-file pixel reads log a warning and retain nominal-frame anchoring.

The pause screen groups collected equipment and usable supplies into a framed icon grid, including stack counts. Icons fit inside the panel even on a well-equipped run; hovering an icon with the mouse shows its name in the inventory header. This is a read-only overview, not a new equip, drag-and-drop or item-use system.

Other regions use the dedicated **vertical edge tiles** from TMW's `desert_castle.png`, not horizontal facade blocks stacked down the sides. The top cap/corners and repeatable side edges follow `001-3.tmx`, `Over 2`, (102,100)..(105,104): top `[0,1,1,2]`, next course `[16,17,17,18]`, vertical edges `32` and `34`. The bottom cap/face/base follows `011-4.tmx`, `Ground 2`, (271,60)..(273,62): `[[48,49,50],[64,65,66],[80,81,82]]`. Edge width and lower-face depth fit the existing 64px collision band. Walls clip exact 96px openings only for cleared, unlocked, visible doors, including non-tile-aligned room sizes.

Reused images are unmodified in `assets/tmw/clientdata` and `assets/som/graphics`; canvas compositing, opacity and color filters provide the presentation. Source of Mana's Modanung/Reid wall artwork, Crush/Reid menhir, and Reid's TMX reference are CC BY-SA 4.0; exact source revision and adaptation details are in [the SoM credits](assets/som/CREDITS.md). Other attribution and original license terms remain below and in the bundled client-data `LICENSE`.

### Performance and artwork loading

Rendering quality adapts to measured frame times, not phone brands or model years. Fast devices retain full quality; slow devices use the existing lower-resolution, reduced-glow mode. Recovery attempts back off to avoid repeatedly switching resolution on a device that cannot sustain full quality. Background tabs do not advance gameplay.

Static walls are drawn once into a single reusable room layer, refreshed when door openings or room dimensions change. Tulimshar uses the same one-layer cache with its native castle atlas; there are no ocean or animation-frame caches. Room backgrounds retain their twelve-entry limit. Breakable color treatments are cached in small sprite frames instead of applying filters on every draw; offscreen breakables skip rendering only, not simulation or collision.

Artwork requests share image objects and wait for loading/decoding before gameplay advances. Failed requests retry once automatically, then show the failed path and a **Retry artwork** button (also Enter). This prevents fighting invisible or placeholder enemies while downloads are incomplete. If retries continue failing, verify the host serves the complete asset folders and check the connection; optimization cannot repair missing files on the server. Validation on a desktop or with CPU throttling does not establish a phone's actual frame rate.

### Authored terrain patterns

The bundled TMW map crawl covered 491 orthogonal CSV maps and 2,555 visual layers. Patterns were compared using local atlas IDs, not map-specific global IDs; external TSX references and tile transforms were accounted for. A frequent tile is not necessarily walkable ground: cave voids, building faces and terrain edges must not be used as floor textures. The selected floor motifs below were also checked against the actual artwork and surrounding layers.

| Region / use | TMX source, layer and zero-based top-left coordinate | Local IDs, rows separated by `/` |
|---|---|---|
| Graveyard ground | [029-6.tmx](assets/tmw/clientdata/maps/029-6.tmx), `Ground`, (140,32) | `36,20 / 6,37` |
| Artis and desert paving | [005-1-1.tmx](assets/tmw/clientdata/maps/005-1-1.tmx), `Ground`, (9,7) | `113,114 / 113,114` |
| Halinarzo ground | [011-4.tmx](assets/tmw/clientdata/maps/011-4.tmx), `Ground`, (57,49) | `241,241 / 241,241` |
| Nivalis snow | [019-1.tmx](assets/tmw/clientdata/maps/019-1.tmx), `Ground`, (0,0) | `83,83 / 83,83` |
| Frostia ice floor | [001-13-1.tmx](assets/tmw/clientdata/maps/001-13-1.tmx), `Ground`, (23,28) | `4,4 / 4,4` |
| Fortress cave floor | [004-2-1.tmx](assets/tmw/clientdata/maps/004-2-1.tmx), `Ground1`, (56,23) | `4,4 / 4,4` |
| World's Edge stone | [006-8.tmx](assets/tmw/clientdata/maps/006-8.tmx), `Ground`, (32,22) | `32,33 / 47,48` |

Two-dimensional motifs retain their row/column order instead of shuffling individual pieces. Graveyard grass is darkened/desaturated, avoiding the magenta cast produced by the previous hue filter. These are bounded floor-texture adaptations, not imports of entire levels, decorations or collision maps. The desert dune composition and non-desert wall architecture are not redesigned by this floor correction.

Map credits from the bundled [LICENSE](assets/tmw/clientdata/LICENSE): `029-6.tmx` is TMW.Org with jesusalva; `011-4.tmx`, `019-1.tmx`, `001-13-1.tmx` and `006-8.tmx` are jesusalva (`019-1` also credits TMW Org. and TMW/LOF), listed as GPLv3. `004-2-1.tmx` is Saulc with jesusalva/Pookie, and `005-1-1.tmx` has an unidentified primary author with Saulc/jesusalva, listed as CC BY-SA 4.0. These credits and terms also accompany the adapted motifs. Original TMX metadata remains untouched: it sometimes lists additional/different terms, notably CC BY-SA 3.0 in `029-6` and `005-1-1`, and GPL v2+ / CC BY-SA 4.0+ in `001-13-1`. This does not relicense the separate tileset images; their credits and licenses remain below.

## Source layout

- `game.js` owns shared state, startup, keyboard/mouse/touch input, and the update/render main loop.
- `controllermanager.js` owns gamepad polling, controller button actions, stick movement/aiming, and controller disconnect behavior.
- `gameui.js` contains canvas rendering, HUD, menus, controls, and presentation.
- `desertart.js` contains the Tulimshar desert room art (paved lanes, wind, banners and torches, haze, footprints, sandstone walls) and its `DESERT_ART` constants.
- `mobmanager.js` contains enemy and boss setup, attacks, damage, and AI.
- `playermanager.js` contains player combat, movement abilities, damage, and hit feedback.
- `dbmanager.js` contains local storage, profiles, progression, and save/load persistence.
- `worldmanager.js` contains room/map generation, pickups, shops, and world objects.

These are classic browser scripts, not modules, so their shared top-level declarations keep the existing gameplay code interoperable. `index.html` loads the manager files first and `game.js` last: manager functions can refer to shared state when called, while the core script initializes that state before starting the game.

## Highlights

- Seventeen delvers with distinct loadouts, plus an unlock path through regions, secrets and guardians.
- Start with Mage, a balanced beginner caster. Clearing floor 1 can unlock Rogue (rapid, weaker, smaller arrows); clearing floor 2 can unlock Warrior (a powerful starting sword with slower recovery). Only one new character unlock is granted per descent; other eligible milestones wait for a later run. Bow rate bonuses do not carry over to spells or melee. Slower, harder-hitting arrows are larger. Other delvers retain their regional, secret, guardian, and completion conditions; Sporeling now requires collecting Spore Bloom. Previously earned class unlocks remain available.
- One hidden Mana echo per region is tucked behind a cracked wall; bomb the wall, then press **E**, use the Interact action, or tap Attack nearby to record its fragment. The Field Codex tracks all nine across runs. Finding every echo unlocks the Echo-Bound Delver as a collection reward, independent of the one-ordinary-unlock-per-descent limit.
- Spore Bloom makes magic shots split into eight slowing, element-matched projectiles on hitting an enemy, destructible object, or wall. Each parent bursts once; shards cannot recursively split and do not immediately re-hit the original target or get swallowed by the object they burst against. Its existing bomb-spore effect remains.
- Wild magic keeps the selected element and adds gentle, speed-preserving drift. Mage shots have a 40% enemy-impact surprise chance, 20% object-impact chance, and 6% chance to launch as a special shot. Other classes casting magic use 10%, 5%, and 1% with much gentler drift. A special shot carries a guaranteed effect on impact; ordinary shots roll once on their first contact, including piercing shots.
- Mage starts each new run with a random element: water, fire, lightning, gas, mushroom spore, ice, wind, or earth. Other classes start with water. Items do not reroll the active element; interact with the elemental menhir found in a random side room to attune to a different element. Element sigils unlock their named element without changing your active element. Saves preserve your attunement.
- Key-locked trial rooms are optional, enemy-free mini-games. Each map randomizes between a light-routing mirror puzzle, a repeating rune-memory sequence, and a moving-spark chase; some trials continue into a second connected chamber, with the reward reserved for the final puzzle. Challenges and progress persist through save/resume, stay clear of doors, and award a collectible reward on completion; an uncollected regional Codex appears in the trial most of the time.
- Start with a Shockwave that clears hostile shots and pushes nearby foes away. Find the Mana Familiar Sigil to replace it with orbiting weapon familiars. Each room clear adds one charge, up to eight; five charges summon up to three arrow, sword, or mana icons based on your selected weapon. Each blocks one hostile hit or strikes one enemy, then disappears. The orbit caps at 13; if already full, charge is preserved. Charge and familiars persist through save/resume.
- Player magic carries its element's color through special-shot glows, clouds, walls, clusters, lightning, decay, rifts, and delayed explosions. A brief colored cast trail connects wild impacts to the player. White-cored diamond marks identify friendly ground effects and player-applied curses, without adding targeting rings; bomb curses still flash red to communicate their fuse.
- Wild effects include particle novas, lightning jumping between nearby visible enemies, pulsing decay damage over time, and rifts that visibly sink a mob through the floor before it rises at a safe location in the current room. Bosses cannot be teleported. Secondary shards, lightning, and damage ticks never recursively roll surprises or add magic hitstop.
- Dramatic wild effects also include rising gas puffs, five-part flame walls, elemental spore clusters, red-flashing enemy bombs with a 1.2-second fuse, and lift-and-slam attacks. Gas, flames, and bursts inherit the casting element's color. Lifted mobs rise above a visible ground shadow, hang briefly, then slam down with splash damage. Bosses cannot be lifted; special lift shots instead mark them as bombs. These magic explosions hurt enemies, not the player. Wild lightning remains visible for 0.4 seconds; player ground effects are capped to prevent runaway clutter. Proc chances are unchanged.
- New passive magic items: **Storm Spool** extends wild lightning to four targets, **Ember Seed** extends decay to four seconds, and **Nova Pearl** expands wild explosions. They use the normal shop/reward pools and do not increase proc probabilities.
- Three weapon styles (sword, bow, magic) that you switch between. Weapon-specific upgrades can randomly shift that weapon's firing style as a side effect; there is no mode control or separate mode purchase.
- Charge mode applies to every selectable weapon when granted. Magic charge requires a deliberate hold and respects the normal weapon recovery cooldown; short taps do not fire. Firing direction is controlled only by the active aim input: controller right stick, nearest live enemy on touch (or manual aim/facing in an enemy-free room), or mouse cursor for keyboard/mouse.
- Ten rooms at most per floor, at most one larger room, never the boss room. The minimap shows doors you have seen, turns red while the room is hostile, and shows larger rooms larger.
- Doors draw as locked or open (enemies remaining, key required, sealed boss room).
- Bank and shop share one room. Merchants need an Interact press, and you are never offered an item you already own.
- Projectiles keep a constant size, drop with a ground shadow as they reach the end of their range, and swords can parry enemy shots back.
- Health starts at four hearts, each split into two half-heart hit points. Direct enemy contact costs one full heart; ordinary projectiles, beams, explosions, and area hazards cost half a heart. Clearly telegraphed boss heavy slams and marked ground strikes cost **two hearts**. Clothing and Aegis still absorb hits.
- Arrows shoot hostile projectiles back using a forgiving box around their tips, including fast crossings. Clashes accelerate both shots and scatter them widely: returns vary up to 32 degrees around a visible foe, or 35-80 degrees off the arrow's heading without one. The arrow kicks off 35-70 degrees in the opposite direction. Returned shots carry arrow damage plus incoming damage and get one **40% chance** to restore half a heart when they first damage an enemy; interception alone does not heal.
- Melee swings can bat projectiles out of the air anywhere along the visible blade sweep, even when shots are not aimed at you. Parries also have a forgiving follow-through window and catch fast shots or player-body contact. The first clean intercept per swing gets one **40% chance** to restore half a heart, up to maximum health; follow-up deflections do not reroll a failed reward. Body-contact deflections still deal half-heart damage. Charged releases deflect nearby shots outward with some scatter. Returned shots carry the swing's damage plus the enemy projectile's damage.
- Reflections retain the original projectile's kind, color, size, and renderer: arrows remain arrows, spores remain spores, and colored orbs remain colored orbs instead of becoming stone/coin-like shots. Magic keeps its elemental splash and cluster interactions.
- Enemy health grows with floor progression; all fresh enemies survive their opening hit and its simultaneous volley, even bombs and piercing attacks. Evasive ranged/stalker/diver enemies learn dodges from floor 2; later ranged foes keep more distance, strafe faster, lead shots, and add bursts while melee packs coordinate attacks. Boss-style enemy promotions become more common as characters are unlocked. Slow chargers stay committed instead of dodging like archers.
- Squads choreograph commitments: the longest-ready visible foe attacks first while others circle into position. Early floors allow one committed attacker; floor 4 onward permits two with a minimum gap between starts. Ranged windups lock and display their aim instead of tracking through release. Boss ground patterns resolve in spaced beats without stacking another pattern or major boss move over them. Ground-slam and landing camera shakes are shorter and gentler; sword impact feedback is unchanged.
- Bosses and minibosses have three escalating phases, each with a distinct attack pattern. Reaching a new phase restores up to two hearts. Jacko, the Spider Queen and Golem use bespoke phase patterns; every other regional guardian has phase-specific signature rotations. Boss HP now targets roughly 56 seconds of uninterrupted baseline attacks, with modest floor scaling; capped phase healing and the boss-room-only Guardian Heart provide recovery without requiring random heart drops.
- Three additional TMW client-data creatures join the later-playtime pools: Piou, Maggot and Tortuga. Enemy species unlock from accumulated playtime, while their health, movement, tactics and boss-style promotions also scale with floor and character progression.
- Grounded bombs slide when struck by player or enemy shots, bounce off walls and unbroken objects, and slow with friction while their fuse continues. Bomb damage against bosses is reduced to 8% of maximum health (never the finishing blow). Normal scenery takes one normal sword hit point or two charged hit points, not the sword's full mob damage.
- Ordinary breakables have a 12% consumable drop chance, increased by luck up to 20%. Pickups are stored for later use, persist with room state, and cannot be farmed by repeatedly destroying regrowing scenery. Guaranteed treasure and boss-spawned objects do not use this drop roll.
- Enemy AI draws on Hades, Enter the Gungeon and Vampire Survivors: telegraphed attacks, bullet patterns, swarms, and mini-boss behaviours that join ordinary enemies on later floors.
- Fully rebindable keyboard and controller layout with a live tutorial.
- Overhead icons flash briefly when something changes (item, stat up or down, key, bomb, heart); the pause screen lists everything you carry.

## Performance

- The game lays out a fixed 960×540 view and redraws it every frame. The view scales to the largest 16:9 area that fits the window and draws at the screen's pixel density (up to 3× the logical size), so sprites and text stay sharp on high-DPI and scaled displays.
- **Auto quality:** if the frame rate stays low for about two seconds, glow effects are switched off, particles are reduced and capped, and the view draws at its on-screen size instead of the screen's pixel density. Full quality returns after ten seconds of smooth frames.
- Particles are capped (400 normally, 120 in low quality), and sound effects use small reusable audio pools.

## Combat regression checks

With Node.js installed, run the dependency-free regression suite from the repository root:

```powershell
node --test tests/*.test.js
```

The suite covers combat, healing/proc probability boundaries, class tradeoffs, floor/boss balance, bomb physics, loot, spore clusters, and wild magic. Element checks cover all eight Mage starting elements, upgrade-driven changes, save restoration without a purchased sigil, and matching colors on immediate and delayed effects. Boss telegraph checks cover real golem and Jacko windups, slam completion timing, and bounded arc radii for oversized or expired timers. Input-aware AI tests cover delayed switching, committed aim, physical dodging, obstacle routes, staggered attack limits and pulse safety; real dash tests verify walking and early dashes take the hit while a late dash survives all three warning lengths.

Check all eight runtime scripts before publishing:

```powershell
node --check game.js
node --check gameui.js
node --check desertart.js
node --check controllermanager.js
node --check playermanager.js
node --check mobmanager.js
node --check dbmanager.js
node --check worldmanager.js
```

## Third-party artwork

The TMW client-data repository is cloned at `assets/tmw/clientdata` (snapshot `3ab88eb52cb995be3d85c96810fe1826bc429ede`). `node tools/trim-assets.js --apply` then removed every file the game scripts do not reference, so only the referenced `graphics` and `sfx` files, the license records, and the TMX maps cited below (with the tilesets they load) remain; the original files are in the upstream repository and git history. Run the script without `--apply` to see what a new import would remove. The game uses these client-data graphics:

- `graphics/items/equipment/charms/heart-of-isis.png` — V0id; GPLv2 and CC BY-SA 3.0.
- `graphics/items/equipment/ammo/stoneprojectile-icon.png` — wushin, tux9th; GPLv2 and CC BY-SA 3.0.
- `graphics/tilesets/snow.png` — GPL 2.0; TMW-BR, LoF.
- `graphics/tilesets/savannah.png` — Modanung; GPLv3 and CC BY-SA 4.0.
- `graphics/tilesets/cave2.png` — Bjorn; GPLv2.
- `graphics/tilesets/stoneground.png` — Jetrel; CC0; source OpenGameArt.org.
- `graphics/tilesets/icecave.png` — Crush, Octalot; GPLv2.
- `graphics/tilesets/woodland_graveyard_ground.png` — Crush; GPLv2.
- `graphics/tilesets/desert_city.png` — Modanung; CC BY-SA 3.0.
- `graphics/tilesets/evol/artis-pavement.png` — IvanMorve, Reid; CC BY-SA 3.0. Used for the worn desert paving as well as Artis.
- `graphics/images/ambient/sandstorm.png` — Crush; GPL 3.0 or CC BY-SA 3.0 (the CC BY-SA 3.0 option is used here). Used for the desert edge ambience, with canvas opacity and drift; the original image is unchanged.
- `graphics/sprites/monsters/accessories/banditbow.png` — GPLv2; jesusalva.
- `graphics/sprites/monsters/fluffy.png` — Crush; CC BY-SA 3.0.
- `graphics/sprites/monsters/snail.png` — FotherJ; CC BY-SA 3.0.
- `graphics/sprites/monsters/slime-mother.png` — CandyCurt, Wushin; GPLv2.
- `graphics/sprites/monsters/reaper.png` — Skipy, Alige; GPLv2.
- `graphics/sprites/monsters/snowman-boss.png` — Hocus; MIT.
- `graphics/sprites/model/male.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin; GPLv2.
- `graphics/sprites/model/female.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin, Tezer; GPLv2.
- `graphics/sprites/model/neutral.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin; GPLv2.
- `graphics/sprites/hairstyles/hairstyle01.png`, `hairstyle02.png`, `hairstyle03.png` — Kineticstorm, Nami, Wushin; GPLv2.
- `graphics/sprites/hairstyles/hairstyle20.png` — Modanung, Wushin; GPLv2.
- `graphics/sprites/equipment/legs/shorts-female.png` — Modanung; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/equipment/legs/assassin-female.png` — Black Don; GPLv2.
- `graphics/sprites/equipment/chest/leather-female.png` — Modanung; GPLv2 and CC BY-SA 3.0.
- `graphics/tilesets/desert_castle_interior.png` — Alige, EJlol, Irukard, IvanMorve Len, MerlinX420, Wushin; GPLv2.
- `graphics/tilesets/desert_castle.png` — Alige, EJlol, Irukard, IvanMorve; source credits Len, MerlinX420, Wushin; GPLv2.
- `graphics/tilesets/desert2.png` — unidentified original contributor(s), Wushin; source credit Saulc; GPLv2.
- `graphics/tilesets/desert1.png` — unidentified original contributor(s), Wushin; source credit Saulc; GPLv2.
- `graphics/tilesets/footprints.png` — author unidentified in the bundled license; source TMW-BR; GPL 2.0. Used unmodified for fading desert tracks.
- `graphics/tilesets/woodland_ground.png` — :grey_question:, Crush, Wombat, enchilado; GPLv2.
- `graphics/sprites/monsters/ratto.png` — Coolkid782; CC BY-SA 3.0.
- `graphics/sprites/monsters/croc.png` — Reid, Coolkid782, Enchilado; CC BY-SA 3.0.
- `graphics/sprites/monsters/wisp.png` — Crush; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/ghost-pumpkin.png` — :grey_question:, Modanung; GPLv2.
- `graphics/sprites/monsters/bat.png` — neoriceisgood; GPLv2.
- `graphics/sprites/monsters/bluepar.png` — Crush, Meway; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/frog-small.png` — Hocus; MIT, GPLv2, and CC BY-SA 3.0.
- `graphics/sprites/monsters/mouboo.png` — Yuuki; GPLv2.
- `graphics/sprites/monsters/skeleton.png` — FotherJ; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/slime.png` — :grey_question:, Neoriceisgood; GPLv2.
- `graphics/sprites/monsters/snake.png` — :grey_question:, Neoriceisgood; GPLv2.
- `graphics/sprites/monsters/spider.png` — FotherJ; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/spider-queen.png` — Hocus; MIT, GPLv2, and CC BY-SA 3.0.
- `graphics/sprites/monsters/golem.png` — Hocus; MIT, GPLv2, and CC BY-SA 3.0.
- `graphics/sprites/monsters/loghead.png` — FotherJ; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/mushroom-red.png` — Yuuki; GPLv2.
- `graphics/sprites/monsters/grass.png` — HoraK-FDF; GPLv2 and CC BY-SA 4.0.
- `graphics/sprites/monsters/plant.png` — Crush, Seradest; GPLv2.

The projectile, heart, Ratto, Croc, Wisp, loghead, shorts, leather chest, Bluepar, frog, skeleton, spider, Spider Queen, and Golem sprites use their CC BY-SA 3.0 license option, unmodified. The Nivalis floor uses the base snow tile used by TMW's Snow Field map; other regions use their corresponding desert, forest, graveyard, ruin, savannah, ice, and cave ground sheets. Player body and face colors are corrected at runtime to add warm skin tones while retaining sprite shading; hairstyles and acquired clothing are layered over the body. Browsers that restrict pixel readback for images opened directly from disk display the original TMW sprite colors instead, so character selection remains visible. Missing optional object artwork receives a procedural fallback without modifying the licensed images. Secret rooms use cool-tinted stone-floor tiles from the desert-castle interior sheet. License texts are in `assets/tmw/clientdata/GPL` and the other license files at that directory's root. Preserve each asset's applicable license and attribution when redistributing.

The repository includes the license records in `assets/tmw/clientdata/LICENSE` and the unlisted-license inventory in `assets/tmw/clientdata/license-missing`. The license list notes that its credits may be incomplete or incorrect. Verify asset credits and licenses before redistributing a release, and retain this attribution and the [CC BY-SA 3.0 license terms](https://creativecommons.org/licenses/by-sa/3.0/) with the artwork.

## Gameplay

- Read the three-page prologue before choosing a delver; once it has been read, the game opens on the delver ledger, and the Prologue button, P, or LB on a controller replays it. Voice narration is disabled for now (`NARRATION_ENABLED` in `game.js`) while the recordings are redone to match the current text. Every descent starts in Tulimshar, then shuffles all eight remaining regions, including the World Edge. The story follows a Mana Seed found in the old mines outside Tulimshar: the seed is drawn along Mana's natural flow, which stirs creatures tainted by Kaore; each guardian's fall thins the taint, and Elanore's account of the last Mana Tree hints at what the seed is seeking. Press J during a run to review journal fragments.
- Choose from seventeen delvers across four roster pages. Unlock them by reaching regions, finding a secret, defeating a sentinel, or defeating the corresponding regional guardian. Each has a distinct loadout; some trade health, movement speed, or attack speed for damage or extra resources.
- Explore a winding, branching room layout toward each floor guardian. The starting room has at least two ordinary, unlocked exits; shops, locked reward rooms, secrets, and mini-bosses sit farther along optional branches. The route to the main boss never requires clearing an optional branch or spending a key.
- Every floor has a bombable hidden-room entrance. Rooms preserve their contents, enemy positions, and obstacle states when you leave and return.
- The nine-region route always opens in Tulimshar and randomizes the order of Hurnscald, Graveyard, Artis Ruins, Halinarzo, Nivalis, Frostia, Candor Island, and the World Edge. Each region uses a TMW ground tileset and a persistent region label.
- Track explored rooms, connections, and known special rooms on the persistent minimap; press M for the full map.
  - The full map scales to fill the screen and draws:
    - corridors, with padlocks on locked doors and dashed links to a revealed secret room;
    - rooms you have seen but not entered;
    - icons for what is left in each room;
    - your delver in the current room;
    - a legend of the room types on the floor.
  - From a cleared room you can travel straight to any other cleared room reachable through open doors. Pick it with the mouse, arrows/WASD + Enter, the D-pad + A, or two taps. Travel never spends a key or passes through a room with foes in it.
- Keep the HUD on the map's brick border so the play area stays clear: hearts and armor top-left, with zeny, keys, bombs and familiars stacked beneath them; weapon slots top-centre-left and action buttons top-centre-right (the door gap stays clear); the minimap top-right; charge meters bottom-left; and the boss health bar just under the top slots. Labels use a dark text outline for contrast.
- Clear rooms to open doors. Some doors require a key.
- About half of all floors also have an unlocked altar room (map letter R). Stand at an altar and interact: the left one trades one heart container for an upgrade, the right one seals the doors and starts an ambush that pays a heart vessel. Each room allows one choice.
- Each floor now has three randomized dead-end chambers: one always holds a bomb cache, one is a key-locked elemental menhir 75% of the time (otherwise it is a key-locked ability room), and the last contains a guaranteed key cache. Interact with the menhir to change elements; ordinary items no longer reroll your element, and explicit sigils unlock their named element without changing it. Boss rewards guarantee an upgrade; secret, bomb, and other side rooms can be sparse or empty. Bomb cracked walls to reveal a hidden chamber and that region's Mana echo; occasional hidden-room bonuses are not guaranteed.
- Navigate around biome-matched obstacles with distinct markings: desert cactus and orange-fragment mushrooms only break to bombs, steel-gray crossed logs are permanent blockers, and green-marked grass and forest plants regenerate in three visible stages. Regrowing plants can be destroyed permanently after their limited cycles. Normal rooms can have no obstacles, and bomb-destroyed objects have a 50% chance to drop another bomb. Obstacles block movement, sight, and projectiles; bombs only damage objects within line of sight.
- Bomb a cracked wall to reveal its door into a peaceful sacred room and uncover that region's Mana echo. Additional relics, coins, bombs, hearts, or a key are uncertain bonuses; secret rooms may be nearly empty. Their stone floor uses 32×32 blocks from the licensed TMW desert-castle interior tileset, following tile choices used in existing client-data maps. A hidden creature may spring from a breakable relic.
- Shoot magical tears with particle trails; the default ranged cadence is one projectile every two-thirds of a second (three shots in two seconds). Prism Shard is a separate three-way fan upgrade; Mana Pearl increases tear size and damage, Swift Feather increases firing speed, and Far-Reach Lens extends travel distance. The Frost Rune is automatic: once found it freezes nearby ordinary enemies and slows bosses (blue glow, 12-second recharge) until you attune at an elemental menhir.
- Unlock marked key doors by approaching and pressing E; locked and mini-boss rooms can be sparse, and only one guaranteed upgrade appears on each floor. Mini-boss encounters are chosen randomly from regional pools. Snakes are limited to desert and cave regions and spit venom that leaves damaging acid; spiders leave slowing webs, Snails trail slowing slime, Fluffies can summon more Fluffies, frogs leap aggressively, and Bandits aim visible bows and shoot arrows. Spore Sowers telegraph and launch a seed orb that bursts into eight radial shards; Spore Bloom is an obtainable player ability with its own cooldown.
- Each merchant usually offers a bomb, a one-point health restore, and one upgrade; sometimes a second ability joins the selection. Shops never offer more than two abilities at once, and merchant dialogue stays clear of item cards. Offers have distinct icons, including wearable clothes. Silk Shorts increase movement speed; Leather Legguards slow you down but absorb two hits, and a Leather Vest absorbs one. Clothing appears over your character and stays equipped for the run, changing the delver’s look as the run progresses.
- Each delver starts with a different mix of movement, health, damage, attack speed, and combat style. Merchants may teach new styles and sell swords or daggers. All learned styles and acquired melee weapons attack together; Tab, the mouse wheel or 1/2/3 changes which style leads the attack.
- Collect zeny, keys, bombs, and heart-shaped health pickups; zeny pickups use a marked gold coin so they stay visible on sand. Shop prices rise by 2 zeny per deeper floor and are capped at 15. Any of the 36 monster types may appear as a familiar offer in about 30% of shops; at most one is offered per shop, and no more than two familiars can join a run. Familiars orbit, attack nearby foes, fire alongside your shots, and intercept enemy projectiles. Knocked-out familiars return after a short recovery or are restored on entering another room.
- Learn up to two standard active abilities in a run. The Mana Familiar Sigil is a separate unlock and does not use either slot. Ability offers do not repeat, and the two-slot limit also applies to room rewards and boss drops.
- Keep a three-kill chain alive within 3.2 seconds to earn one bonus zeny; the chain resets after a lull.
- Visit the bank room on each floor to deposit all carried zeny by walking onto the vault pad or withdraw your stored balance with Shift+E. Banked zeny is saved separately from the active run and persists across refreshes, closing the game, and new runs.
- Pause with P or Esc. The game also pauses when its browser tab loses focus. Press X from the pause screen to save and return to the title; choose Resume Saved Descent or press R to continue. Starting a new descent while one is saved asks you to select Descend a second time. The current run autosaves and resumes after a page refresh, including room contents and run progress.
- Ordinary breakables have a small chance to drop a heart or coin, and bomb-destroyed objects retain their 50% bomb-drop chance. Reward rooms may contain marked relics with guaranteed collectible drops, but destructible bonus loot is not guaranteed in every optional room; each obstacle still gets only one drop chance.
- Ordinary mobs adapt to the weapon style you have been attacking with over the last few seconds (smoothed, so a quick swap does not dodge it): against melee, casters keep a wider distance and waiting foes strike as your swing recovers; against the bow, foes close in, dodge more often and one extra melee mob may engage; against magic, foes spread out and ranged mobs act slightly faster. Bosses are unaffected by these weapon counters. Tuning lives in `styleAIProfiles` in `mobmanager.js`.
- Enemies also adapt to the active **input method**, independently of weapon counters. The first active input is learned immediately; subsequent switches take 2.5 seconds of stable playing time. Touch draws more close-range lateral movement and projectile dodging, so auto-aim is not a guaranteed hit. Gamepads draw stronger flanking, faster direction changes and one additional staggered attack slot. Mouse/keyboard draws stronger movement prediction on locked ranged windups. The player's aim, controls, dash timing and projectile accuracy are not changed, and switching input remains allowed. Floor one applies half of each profile; it is at full strength from floor two. Pause and choose **Adaptive enemies** (E, the Y/triangle button, or click) to turn input adaptation, the faster attack tempo, wide pulses and major-boss path markers off; the setting is saved, and the pause screen shows which input enemies are reading. The numbers follow the rules in [BALANCE.md](BALANCE.md), which is the reference for any future balance tuning.
- Calm enemies use local obstacle steering around unbroken cover, including wall clearance; committed lunges/charges keep their direction. While an input profile is active, ordinary attack cooldowns tick 8% to 16% faster (touch 8%, mouse/keyboard 12%, gamepad 16%: one to two floors' worth of the usual per-floor scaling), without increasing damage or health. Flanking is capped so no calm enemy moves faster than an enraged one. Dodges respond to actual projectiles (not button presses), never to point-blank shots less than 140ms away, and retain a cooldown. Slow chargers still commit instead of projectile-dodging.
- From the second floor, a fixed **wide pulse** occasionally marks the player's position. Its radius follows your walking speed (about 300px for an ordinary-speed delver, smaller for slower ones) so that walking out during the warning is never enough: use a defensive ability or time Dash for the final **DASH NOW** cue (last 0.2s). The warning is 1.1s for touch, 1.05s for mouse/keyboard, and 0.95s for gamepads; existing dash invulnerability remains 0.24s. A pulse only starts with Dash ready, no active attack/burst/extra windup, no hostile projectiles/bombs and no nearby hostile ground hazards. Each room grants a six-second grace period, with at least ten seconds between ordinary pulses. These are minimum intervals, not a promise of an attack every ten seconds.
- Major bosses now use the shared fixed path-marker pressure that previously only minibosses reached. Phase-two/three bosses can also use wide pulses, at least seven seconds apart. These keep ordinary/mini damage at one heart and major-boss damage at two, do not retarget after the warning starts, and reserve the attack beat instead of starting another boss signature simultaneously. Existing phase heals and death cleanup are unchanged. Profile values live in `ADAPTIVE_AI_TUNING.profiles` (`mobmanager.js`); input observation is transient and restarts on a new/resumed run.
- Brawl with fists, swords, or daggers after learning melee; additional melee weapons stack and swing together. Learned magic and bow attacks also fire alongside them. Bow poses and the enlarged bow appear only during bow attacks. The mouse cursor controls facing and left-click attacks toward it; controller left stick moves (and faces that way while not aiming) while the right stick controls facing and aim.
- Buy Mana Tonics, Bomb Bundles, and Mana Bursts as consumables; press Q to use the first item that can help.
- Face the regional guardians: Great Red Slime in Tulimshar, Jacko in Hurnscald, Reaper in the Graveyard, Ancient Golem in the Artis Ruins, Bandit Lord in Halinarzo, Snowman Boss in Nivalis, Yeti King in Frostia, Forest Dragon on Candor Island, and Night Dragon at the World Edge. All regions after Tulimshar are shuffled between runs. Guardians use regional TMW sprites, unlock the delver tied to their region, and reveal a new journal clue. Attacks are telegraphed with recovery windows; clear surviving summons before a boss-room seal opens.
- Defeat all nine guardians to finish the run; the World Edge can appear anywhere after Tulimshar.
- Player attack cues follow the selected lead style: quiet nonverbal magic impacts, bow releases, or hand strikes. Jacko speaks when he begins his occasional minion summon. Monster attacks, hits, dodges and deaths, bombs, and boss events have separate sound cues; enemies with a Source of Mana counterpart (Ratto, Bat, Slime (not the Great Red Slime), Snake, Scorpion, Croc, Fluffy, Skeleton, mushroom, Pinkie, Jungle Fowl, Snail) use that mob's sounds, other monsters use their own TMW sounds, breakable obstacles have hit and break sounds, and level-ups, upgrades, pickups, cleared rooms and unlocked doors use Source of Mana's effect sounds. Bombs, floor descents and shop purchases use TMW system sounds. Ambient music is generated by Web Audio because no music track is included in the assets; use the title-screen sliders to set music and effects volume.
- Delvers start every descent with three to six hearts, shown on their selection card. Heart Vessels in shops add one heart each; total extra hearts are capped at nine, and offers become rare after five. Enemies spawn with more health than your strongest single hit, and a full-health enemy always survives its first hit. Your attacks never fire more than eight projectiles at once (familiars and sword swipes excluded). Newly found abilities morph your attacks: shapes, pulses, drops, explosions, or a four-way ring, and some morphs trade power or speed for flair.

## Controls

- Move: WASD or Arrow keys
- Aim with the mouse; the delver faces the pointer continuously. Hold the primary mouse button to attack toward it; firing stops reliably when released or when the game loses focus. WASD movement does not override mouse facing while the mouse is moving, a button is held, or an attack is in progress; after about a second without mouse activity the delver faces the way he walks again, and moving the mouse snaps facing back to the pointer.
- Dash: Space (left hand stays on WASD)
- Weapon: 1/2/3 select, Tab or mouse wheel cycles
- Weapon modes change through weapon-specific upgrades; there is no separate mode-cycle control or mode purchase. Charge mode is a rare, once-per-run discovery (5% per eligible upgrade), and when found it applies to all selectable weapon styles. Charged bows fire a sustained, obstacle-blocked beam that damages enemies along its path and detonates on impact; a fully charged magic shot is larger, explosive, and substantially stronger. Saved playtime and character unlocks can promote a few early-floor enemies into advanced AI without increasing room population. Major bosses use their own phase attacks rather than a shared multi-circle ground-strike pattern.
- Player shots stop at the room's outer walls, including upgraded wall-piercing projectiles.
- Class ability: 4 or right-click
- Use a consumable: Q
- Shockwave (start with one; gain another each floor) / Mana familiars (discover the sigil; five room clears charge a summon of up to three one-hit guards): R
- Bomb: F
- Frost is automatic: it chills nearby foes by itself. Mage starts with a random element; other classes start with water. Use an elemental menhir to change your element; sigils grant their named element.
- Interact / buy / talk: E (walking onto items never buys them)
- The bottom HUD action bar shows each button, its count and cooldown.
- Every action above can be rebound on the Controls screen (C on the title or pause screen). Bindings save and the tutorial and prompts update to match.

### Controller (Xbox / PlayStation, auto-detected)

- Move: Left stick only; the delver faces the walking direction while not aiming or firing. Aim with the right stick; the delver faces that direction, and RT/R2 also fires toward it.
- Interact: A/✕; Bomb: B/○; Shockwave / Mana familiars: Y/△
- Consumable: LT/L2; Dash: RB/R1; Cycle weapon: LB/L1
- D-pad quick actions do not move you during gameplay; use the Controls screen for the current bindings.
- Menu audio: use the D-pad to focus music, effects, and narration controls; Left/Right adjusts volume and A/✕ toggles narration. Volume sliders also support mouse clicks and dragging.
- Map: Back/Share (Back also opens Controls from the title or pause screen); Pause: Start/Options
- On-screen prompts switch to controller after a button press or deliberate stick movement, and back to keyboard after a key press or mouse click; a touchscreen press selects touch controls.
- Doors, the bank pad, the Soul Menhir and the descent pad are used with E; Shift+E withdraws from the bank
- Map: M. On the full map, arrows/WASD or the mouse select a room, and Enter, E or a click travels there. M or Esc closes it. On a controller, use the D-pad or left stick, A to travel, and B or Back to close.
- Character select: Left/Right choose, Enter descends, K opens the Field Codex, H (or Y/△ on a controller, or the HOW TO PLAY button) opens the in-game tutorial, C opens Controls
- Pause/resume: P or Esc
- Fullscreen: Alt+Enter or the Fullscreen button under the title bar; Esc or Alt+Enter leaves it
- Field journal: J
- Save and exit to title: X while paused
- Resume saved descent from title: R
- Prologue: use Left/Right or A/D to read; Enter/Space advances; click the page buttons to navigate
- Character selection: click or browse delvers with Left/Right or A/D, or click the arrows beside the cards; Enter/A starts an unlocked delver; locked delvers show their unlock condition; P (LB on a controller) replays the prologue
- Return to character selection after a run: Enter, A, or click; the run summary lists level, time, foes and guardians defeated, zeny found, the route, collected items, and new delvers

## Run locally and publish

### GitHub Pages playtest

The repository includes a GitHub Actions workflow that publishes the game whenever changes are pushed to `main`. To enable it, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The first deployment starts after the next push to `main`; later deployments can also be started from the **Actions** tab with **Deploy to GitHub Pages → Run workflow**.

Once deployment finishes, playtest at <https://onlineambassador.github.io/mana-rogue-like/>.

The game is static files only, so it can be hosted anywhere (GitHub Pages, itch.io HTML5, Netlify, any web server). Upload `index.html`, `style.css`, **all eight runtime scripts** (`game.js`, `controllermanager.js`, `gameui.js`, `desertart.js`, `playermanager.js`, `mobmanager.js`, `dbmanager.js`, `worldmanager.js`), and the `assets` folder. Keep the script order in `index.html`; deploying only `game.js` no longer includes the full game. Note that `assets/tmw` is a full TMW client-data snapshot of about 250 MB; the game itself reads only around 10 MB of it, so trimming unused files makes hosting much lighter. Keep the licence files (`assets/tmw/clientdata/LICENSE`, `ART_LICENSE`, `GPL`, `CC BY-SA 3.0`) with whatever you publish.

Before pushing, run the regression and syntax checks above, review `git diff --check` and `git status --short`, and include the manager scripts and regression tests in the commit along with the updated entry point and documentation. A push to `main` triggers the Pages deployment; smoke-test the published game afterward, including a new Mage run, elemental menhir attunement, menu audio controls, and saved-run resume.

Clone the project and its TMW client-data submodule:

```bash
git clone --recurse-submodules https://github.com/OnlineAmbassador/mana-rogue-like.git
cd mana-rogue-like
```

If you already cloned without submodules, run `git submodule update --init --recursive`. Then open `index.html` directly in a browser or serve the directory with a simple static server.
When using the local URL in Edge, keep the server terminal open while playing; if the server stops, the browser reports that the page cannot connect.

Example:

```bash
cd "d:\GitHub\MANA\ManaRoguePrototype"
python -m http.server 8000
```

Then open http://localhost:8000/

## Credits and lore references

Sound effects under `assets/som/sounds` are copied unmodified from [Source of Mana](https://github.com/sourceofmana) and licensed CC BY-SA 4.0 (`assets/som/CC BY-SA 4.0`). Per-file credits are in `assets/som/CREDITS.md`.

The story is an unofficial fan-made addition, not canon. It takes inspiration from The Mana World's setting and uses references to [Hurnscald](https://wiki.themanaworld.org/wiki/Hurnscald), [Artis](https://wiki.themanaworld.org/wiki/Artis), [Candor](https://wiki.themanaworld.org/wiki/Candor), and the [Great Quake](https://wiki.themanaworld.org/wiki/The_Great_Quake). Mana Seeds, Kaore, Soul Menhirs, and the last Mana Tree are drawn from Source of Mana's lore. The wiki identifies some history material as legacy or unfinished; the game does not claim to represent official canon.
