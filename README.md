# MANA: Hollow Sanctum

A browser-based, room-by-room action roguelike set in the world of [The Mana World](https://www.themanaworld.org/). Pick one of twenty delvers, fight through nine shuffled regions, and defeat each regional guardian. It runs on a single HTML5 canvas with plain JavaScript: no build step, no framework, no install. Its story is fan-made and noncanonical; the source assets remain credited under their original licenses.

## Quick start

1. Serve the folder with any static server (for example `python -m http.server 8000`) and open http://localhost:8000/, or open `index.html` directly (a server is recommended so audio and artwork load reliably).
2. Set the music and effects volume sliders on the title screen, pick a delver, and press Enter.
3. Click **HOW TO PLAY** (or press H) on the select screen for the interactive tutorial. It shows your current keyboard or controller bindings.

Works in current Chrome, Edge, Firefox and Safari with a keyboard and mouse, an Xbox or PlayStation controller, or phone touch controls.

On phones, drag the left movement area with one thumb and hold the right attack area with the other. Holding attacks automatically targets a nearby enemy; dragging aims manually. Tap the Attack button while in reach of an interactable to interact instead of attacking. Visible buttons also provide dash, bombs, explicit interaction, skills, items, mana guard (or unlocked Shockwave), weapon switching, bank withdrawal, map, journal, and pause. Touch controls hide when a controller connects or you use a mouse or keyboard; they return when the controller disconnects or you return to touch. Landscape uses the available screen height; portrait keeps the controls below the game. Both preserve the 960-by-540 game coordinates. Tap the roster's side arrows to select other delvers, and tap the upper or lower pause area to resume or save and exit.

Control prompts and touch layout follow the most recently used input: controller button/stick, keyboard or mouse button, or touchscreen. A touchscreen activates its controls when first pressed rather than merely because the device supports touch. While dragging to aim on touch, attacks receive a stronger directional pull toward the nearest nearby enemy within the aim direction; manual aim outside the assist cone stays unchanged.

Landscape touch layouts hide the external title/stats header and message panel, fit the game inside the browser's visible height and safe areas, and overlay the controls without pushing the canvas down. Touching the screen activates controls even when the browser reports a fine pointer or no touch capability. A smaller Dash bubble sits just above Attack within right-thumb reach. Large Bomb and Use Item buttons show inventory counts and are disabled when empty; Switch changes weapons. Use Item retains the normal smart selection of a usable consumable, including healing potions when injured.

Compatible presentation fixes adapted from [WildX-480's fork](https://github.com/WildX-480/mana-rogue-like): preserved control-hint line breaks and live game-message announcements. Its unrelated balance and audio changes are not merged.

## Source layout

- `game.js` owns shared state, startup, keyboard/mouse/touch input, and the update/render main loop.
- `controllermanager.js` owns gamepad polling, controller button actions, stick movement/aiming, and controller disconnect behavior.
- `gameui.js` contains canvas rendering, HUD, menus, controls, and presentation.
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
- Charge mode applies to every selectable weapon when granted. Magic charge requires a deliberate hold and respects the normal weapon recovery cooldown; short taps do not fire. Firing direction is controlled only by the active aim input: controller right stick, nearest live enemy on touch, or mouse cursor for keyboard/mouse.
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

- The game redraws a 960×540 canvas every frame.
- **Auto quality:** if the frame rate stays low for about two seconds, glow effects are switched off and particles are reduced and capped. Full quality returns after ten seconds of smooth frames.
- Particles are capped (400 normally, 120 in low quality), and sound effects use small reusable audio pools.

## Combat regression checks

With Node.js installed, run the dependency-free regression suite from the repository root:

```powershell
node --test tests/*.test.js
```

The suite covers combat, healing/proc probability boundaries, class tradeoffs, floor/boss balance, bomb physics, loot, spore clusters, and wild magic. Element checks cover all eight Mage starting elements, upgrade-driven changes, save restoration without a purchased sigil, and matching colors on immediate and delayed effects. Boss telegraph checks cover real golem and Jacko windups, slam completion timing, and bounded arc radii for oversized or expired timers.

Check all six runtime scripts before publishing:

```powershell
node --check game.js
node --check gameui.js
node --check playermanager.js
node --check mobmanager.js
node --check dbmanager.js
node --check worldmanager.js
```

## Third-party artwork

The TMW client-data repository is cloned at `assets/tmw/clientdata` (snapshot `3ab88eb52cb995be3d85c96810fe1826bc429ede`). Unlisted image files were removed from its `graphics` directory; image files whose paths appear in `LICENSE` were retained. XML descriptors and repository metadata remain. The game uses these client-data graphics:

- `graphics/items/equipment/charms/heart-of-isis.png` — V0id; GPLv2 and CC BY-SA 3.0.
- `graphics/items/equipment/ammo/stoneprojectile-icon.png` — wushin, tux9th; GPLv2 and CC BY-SA 3.0.
- `graphics/tilesets/snow.png` — GPL 2.0; TMW-BR, LoF.
- `graphics/tilesets/savannah.png` — Modanung; GPLv3 and CC BY-SA 4.0.
- `graphics/tilesets/cave2.png` — Bjorn; GPLv2.
- `graphics/tilesets/icecave.png` — Crush, Octalot; GPLv2.
- `graphics/tilesets/woodland_graveyard_ground.png` — Crush; GPLv2.
- `graphics/tilesets/desert_city.png` — Modanung; CC BY-SA 3.0.
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
- `graphics/tilesets/desert_castle.png` — Alige, EJlol, Irukard, IvanMorve Len, MerlinX420, Wushin; GPLv2.
- `graphics/tilesets/desert2.png` — :grey_question:, Wushin; GPLv2.
- `graphics/tilesets/desert1.png` — :grey_question:, Wushin; GPLv2.
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

- Read the three-page prologue before choosing a delver. Voice narration is disabled for now (`NARRATION_ENABLED` in `game.js`) while the recordings are redone to match the current text. Every descent starts in Tulimshar, then shuffles all eight remaining regions, including the World Edge. The story follows a Mana Seed found in the old mines outside Tulimshar: the seed is drawn along Mana's natural flow, which stirs creatures tainted by Kaore; each guardian's fall thins the taint, and Elanore's account of the last Mana Tree hints at what the seed is seeking. Press J during a run to review journal fragments.
- Choose from seventeen delvers across four roster pages. Unlock them by reaching regions, finding a secret, defeating a sentinel, or defeating the corresponding regional guardian. Each has a distinct loadout; some trade health, movement speed, or attack speed for damage or extra resources.
- Explore a winding, branching room layout toward each floor guardian. The starting room has at least two ordinary, unlocked exits; shops, locked reward rooms, secrets, and mini-bosses sit farther along optional branches. The route to the main boss never requires clearing an optional branch or spending a key.
- Every floor has a bombable hidden-room entrance. Rooms preserve their contents, enemy positions, and obstacle states when you leave and return.
- The nine-region route always opens in Tulimshar and randomizes the order of Hurnscald, Graveyard, Artis Ruins, Halinarzo, Nivalis, Frostia, Candor Island, and the World Edge. Each region uses a TMW ground tileset and a persistent region label.
- Track explored rooms, connections, and known special rooms on the persistent minimap; press M for the full map.
- Keep the HUD on the map's brick border so the play area stays clear: hearts and armor top-left, with zenny, keys, bombs and familiars stacked beneath them; weapon slots top-centre-left and action buttons top-centre-right (the door gap stays clear); the minimap top-right; charge meters bottom-left; and the boss health bar just under the top slots. Labels use a dark text outline for contrast.
- Clear rooms to open doors. Some doors require a key.
- Each floor now has three randomized dead-end chambers: one always holds a bomb cache, one is a key-locked elemental menhir 75% of the time (otherwise it is a key-locked ability room), and the last contains a guaranteed key cache. Interact with the menhir to change elements; ordinary items no longer reroll your element, and explicit sigils unlock their named element without changing it. Boss rewards guarantee an upgrade; secret, bomb, and other side rooms can be sparse or empty. Bomb cracked walls to reveal a hidden chamber and that region's Mana echo; occasional hidden-room bonuses are not guaranteed.
- Navigate around biome-matched obstacles with distinct markings: desert cactus and orange-fragment mushrooms only break to bombs, steel-gray crossed logs are permanent blockers, and green-marked grass and forest plants regenerate in three visible stages. Regrowing plants can be destroyed permanently after their limited cycles. Normal rooms can have no obstacles, and bomb-destroyed objects have a 50% chance to drop another bomb. Obstacles block movement, sight, and projectiles; bombs only damage objects within line of sight.
- Bomb a cracked wall to reveal its door into a peaceful sacred room and uncover that region's Mana echo. Additional relics, coins, bombs, hearts, or a key are uncertain bonuses; secret rooms may be nearly empty. Their stone floor uses 32×32 blocks from the licensed TMW desert-castle interior tileset, following tile choices used in existing client-data maps. A hidden creature may spring from a breakable relic.
- Shoot magical tears with particle trails; the default ranged cadence is one projectile every two-thirds of a second (three shots in two seconds). Prism Shard is a separate three-way fan upgrade; Mana Pearl increases tear size and damage, Swift Feather increases firing speed, and Far-Reach Lens extends travel distance. The Frost Rune is automatic: once found it freezes nearby ordinary enemies and slows bosses (blue glow, 12-second recharge) until you attune at an elemental menhir.
- Unlock marked key doors by approaching and pressing E; locked and mini-boss rooms can be sparse, and only one guaranteed upgrade appears on each floor. Mini-boss encounters are chosen randomly from regional pools. Snakes are limited to desert and cave regions and spit venom that leaves damaging acid; spiders leave slowing webs, Snails trail slowing slime, Fluffies can summon more Fluffies, frogs leap aggressively, and Bandits aim visible bows and shoot arrows. Spore Sowers telegraph and launch a seed orb that bursts into eight radial shards; Spore Bloom is an obtainable player ability with its own cooldown.
- Each merchant usually offers a bomb, a one-point health restore, and one upgrade; sometimes a second ability joins the selection. Shops never offer more than two abilities at once, and merchant dialogue stays clear of item cards. Offers have distinct icons, including wearable clothes. Silk Shorts increase movement speed; Leather Legguards slow you down but absorb two hits, and a Leather Vest absorbs one. Clothing appears over your character and stays equipped for the run, changing the delver’s look as the run progresses.
- Each delver starts with a different mix of movement, health, damage, attack speed, and combat style. Merchants may teach new styles and sell swords or daggers. All learned styles and acquired melee weapons attack together; Tab, the mouse wheel or 1/2/3 changes which style leads the attack.
- Collect zenny, keys, bombs, and heart-shaped health pickups; zenny pickups use a marked gold coin so they stay visible on sand. Shop prices rise by 2 zenny per deeper floor and are capped at 15. Any of the 36 monster types may appear as a familiar offer in about 30% of shops; at most one is offered per shop, and no more than two familiars can join a run. Familiars orbit, attack nearby foes, fire alongside your shots, and intercept enemy projectiles. Knocked-out familiars return after a short recovery or are restored on entering another room.
- Learn up to two standard active abilities in a run. The Mana Familiar Sigil is a separate unlock and does not use either slot. Ability offers do not repeat, and the two-slot limit also applies to room rewards and boss drops.
- Keep a three-kill chain alive within 3.2 seconds to earn one bonus zenny; the chain resets after a lull.
- Visit the bank room on each floor to deposit all carried zenny by walking onto the vault pad or withdraw your stored balance with Shift+E. Banked zenny is saved separately from the active run and persists across refreshes, closing the game, and new runs.
- Pause with P or Esc. The game also pauses when its browser tab loses focus. Press X from the pause screen to save and return to the title; choose Resume Saved Descent or press R to continue. The current run autosaves and resumes after a page refresh, including room contents and run progress.
- Ordinary breakables have a small chance to drop a heart or coin, and bomb-destroyed objects retain their 50% bomb-drop chance. Reward rooms may contain marked relics with guaranteed collectible drops, but destructible bonus loot is not guaranteed in every optional room; each obstacle still gets only one drop chance.
- Brawl with fists, swords, or daggers after learning melee; additional melee weapons stack and swing together. Learned magic and bow attacks also fire alongside them. Bow poses and the enlarged bow appear only during bow attacks. The mouse cursor controls facing and left-click attacks toward it; controller left stick moves while the right stick controls facing and aim.
- Buy Mana Tonics, Bomb Bundles, and Mana Bursts as consumables; press Q to use the first item that can help.
- Face the regional guardians: Great Red Slime in Tulimshar, Jacko in Hurnscald, Reaper in the Graveyard, Ancient Golem in the Artis Ruins, Bandit Lord in Halinarzo, Snowman Boss in Nivalis, Yeti King in Frostia, Forest Dragon on Candor Island, and Night Dragon at the World Edge. All regions after Tulimshar are shuffled between runs. Guardians use regional TMW sprites, unlock the delver tied to their region, and reveal a new journal clue. Attacks are telegraphed with recovery windows; clear surviving summons before a boss-room seal opens.
- Defeat all nine guardians to finish the run; the World Edge can appear anywhere after Tulimshar.
- Player attack cues follow the selected lead style: quiet nonverbal magic impacts, bow releases, or hand strikes. Jacko speaks when he begins his occasional minion summon. Monster attacks and deaths, bombs, and boss events have separate sound cues. Ambient music is generated by Web Audio because no music track is included in the assets; use the title-screen sliders to set music and effects volume.
- Delvers start every descent with three to six hearts, shown on their selection card. Heart Vessels in shops add one heart each; total extra hearts are capped at nine, and offers become rare after five. Enemies spawn with more health than your strongest single hit, and a full-health enemy always survives its first hit. Your attacks never fire more than eight projectiles at once (familiars and sword swipes excluded). Newly found abilities morph your attacks: shapes, pulses, drops, explosions, or a four-way ring, and some morphs trade power or speed for flair.

## Controls

- Move: WASD or Arrow keys
- Aim with the mouse; the delver faces the pointer continuously. Hold the primary mouse button to attack toward it; firing stops reliably when released or when the game loses focus. WASD movement does not override mouse facing.
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

- Move: Left stick only. Aim with the right stick; the delver faces that direction, and RT/R2 also fires toward it.
- Interact: A/✕; Bomb: B/○; Shockwave / Mana familiars: Y/△
- Consumable: LT/L2; Dash: RB/R1; Cycle weapon: LB/L1
- D-pad quick actions do not move you during gameplay; use the Controls screen for the current bindings.
- Menu audio: use the D-pad to focus music, effects, and narration controls; Left/Right adjusts volume and A/✕ toggles narration. Volume sliders also support mouse clicks and dragging.
- Map: Back/Share (Back also opens Controls from the title or pause screen); Pause: Start/Options
- On-screen prompts switch to controller after a button press or deliberate stick movement, and back to keyboard after a key press or mouse click; a touchscreen press selects touch controls.
- Doors, the bank pad, the Soul Menhir and the descent pad are used with E; Shift+E withdraws from the bank
- Map: M
- Character select: Left/Right choose, Enter descends, K opens the Field Codex, H (or Y/△ on a controller, or the HOW TO PLAY button) opens the in-game tutorial, C opens Controls
- Pause/resume: P or Esc
- Field journal: J
- Save and exit to title: X while paused
- Resume saved descent from title: R
- Prologue: use Left/Right or A/D to read; Enter/Space advances; click the page buttons to navigate
- Character selection: click or browse delvers with Left/Right or A/D; Enter/A starts an unlocked delver; locked delvers show their unlock condition
- Return to character selection after a run: Enter

## Run locally and publish

### GitHub Pages playtest

The repository includes a GitHub Actions workflow that publishes the game whenever changes are pushed to `main`. To enable it, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The first deployment starts after the next push to `main`; later deployments can also be started from the **Actions** tab with **Deploy to GitHub Pages → Run workflow**.

Once deployment finishes, playtest at <https://onlineambassador.github.io/mana-rogue-like/>.

The game is static files only, so it can be hosted anywhere (GitHub Pages, itch.io HTML5, Netlify, any web server). Upload `index.html`, `style.css`, **all six runtime scripts** (`game.js`, `gameui.js`, `playermanager.js`, `mobmanager.js`, `dbmanager.js`, `worldmanager.js`), and the `assets` folder. Keep the script order in `index.html`; deploying only `game.js` no longer includes the full game. Note that `assets/tmw` is a full TMW client-data snapshot of about 250 MB; the game itself reads only around 10 MB of it, so trimming unused files makes hosting much lighter. Keep the licence files (`assets/tmw/clientdata/LICENSE`, `ART_LICENSE`, `GPL`, `CC BY-SA 3.0`) with whatever you publish.

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

The story is an unofficial fan-made addition, not canon. It takes inspiration from The Mana World's setting and uses references to [Hurnscald](https://wiki.themanaworld.org/wiki/Hurnscald), [Artis](https://wiki.themanaworld.org/wiki/Artis), [Candor](https://wiki.themanaworld.org/wiki/Candor), and the [Great Quake](https://wiki.themanaworld.org/wiki/The_Great_Quake). Mana Seeds, Kaore, Soul Menhirs, and the last Mana Tree are drawn from Source of Mana's lore. The wiki identifies some history material as legacy or unfinished; the game does not claim to represent official canon.
