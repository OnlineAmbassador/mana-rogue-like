# MANA: Hollow Sanctum

A browser-based, room-by-room action roguelike set in the world of [The Mana World](https://www.themanaworld.org/). Pick one of seventeen delvers, fight through nine shuffled regions, and defeat each regional guardian. It runs on a single HTML5 canvas with plain JavaScript: no build step, no framework, no install. Its story is fan-made and noncanonical; the source assets remain credited under their original licenses.

## Quick start

1. Serve the folder with any static server (for example `python -m http.server 8000`) and open http://localhost:8000/, or open `index.html` directly (a server is recommended so audio and artwork load reliably).
2. Set the music and effects volume sliders on the title screen, pick a delver, and press Enter.
3. Click **HOW TO PLAY** (or press H) on the select screen for the interactive tutorial. It shows your current keyboard or controller bindings.

Works in current Chrome, Edge, Firefox and Safari with a keyboard and mouse, or an Xbox or PlayStation controller.

## Highlights

- Seventeen delvers with distinct loadouts, plus an unlock path through regions, secrets and guardians.
- Three weapon styles (sword, bow, magic) that you switch between. Each remembers its own mode: Rapid, Charge (all weapons; the sword charge is a full spin attack), and Triple (bows).
- Ten rooms at most per floor, at most one larger room, never the boss room. The minimap shows doors you have seen, turns red while the room is hostile, and shows larger rooms larger.
- Doors draw as locked or open (enemies remaining, key required, sealed boss room).
- Bank and shop share one room. Shopkeepers need an Interact press, and you are never offered an item you already own.
- Projectiles keep a constant size, drop with a ground shadow as they reach the end of their range, and swords can parry enemy shots back.
- Enemy AI draws on Hades, Enter the Gungeon and Vampire Survivors: telegraphed attacks, bullet patterns, swarms, and mini-boss behaviours that join ordinary enemies on later floors.
- Fully rebindable keyboard and controller layout with a live tutorial.
- Overhead icons flash briefly when something changes (item, stat up or down, key, bomb, heart, mode); the pause screen lists everything you carry.

## Performance

- The game redraws a 960×540 canvas every frame.
- **Auto quality:** if the frame rate stays low for about two seconds, glow effects are switched off and particles are reduced and capped. Full quality returns after ten seconds of smooth frames.
- Particles are capped (400 normally, 120 in low quality), and sound effects use small reusable audio pools.

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

- Hear the three-part narrated prologue before choosing a delver. Narration follows the visible page, stops when the prologue is skipped, and retries after the first interaction if browser autoplay is blocked. Every descent starts in Tulimshar, then shuffles all eight remaining regions, including the World Edge. Discoveries reference Hurnscald and Rakinorf, Amelia’s account of the Mana Tree, and the delver’s uncertain theory about the seed; this is a side-story, not a rewrite of TMW quest history. Press J during a run to review journal fragments.
- Choose from seventeen delvers across four roster pages. Unlock them by reaching regions, finding a secret, defeating a sentinel, or defeating the corresponding regional guardian. Each has a distinct loadout; some trade health, movement speed, or attack speed for damage or extra resources.
- Explore a winding, branching room layout toward each floor guardian. The starting room has at least two ordinary, unlocked exits; shops, locked reward rooms, secrets, and mini-bosses sit farther along optional branches. The route to the main boss never requires clearing an optional branch or spending a key.
- Every floor has a bombable hidden-room entrance. Rooms preserve their contents, enemy positions, and obstacle states when you leave and return.
- The nine-region route always opens in Tulimshar and randomizes the order of Hurnscald, Graveyard, Artis Ruins, Halinarzo, Nivalis, Frostia, Fortress Island, and the World Edge. Each region uses a TMW ground tileset and a persistent region label.
- Track explored rooms, connections, and known special rooms on the persistent minimap; press M for the full map.
- Keep the HUD on the map's brick border so the play area stays clear: hearts and armor top-left, with zenny, keys, bombs and familiars stacked beneath them; weapon slots top-centre-left and action buttons top-centre-right (the door gap stays clear); the minimap top-right; charge meters bottom-left; and the boss health bar just under the top slots. Labels use a dark text outline for contrast.
- Clear rooms to open doors. Some doors require a key.
- Navigate around biome-matched obstacles with distinct markings: desert cactus and orange-fragment mushrooms only break to bombs, steel-gray crossed logs are permanent blockers, and green-marked grass and forest plants regenerate in three visible stages. Regrowing plants can be destroyed permanently after their limited cycles. Normal rooms can have no obstacles, and bomb-destroyed objects have a 50% chance to drop another bomb. Obstacles block movement, sight, and projectiles; bombs only damage objects within line of sight. Bomb cracked walls to open secret rooms.
- Bomb a cracked wall to reveal its door into a peaceful sacred room. The room always has destructible relics, including one marked relic guaranteed to drop a collectible item; an ability upgrade is an additional chance, not the only reward. Their stone floor uses 32×32 blocks from the licensed TMW desert-castle interior tileset, following tile choices used in existing client-data maps. A hidden creature may spring from a breakable relic.
- Shoot magical tears with particle trails; the default ranged cadence is one projectile every two-thirds of a second (three shots in two seconds). Prism Shard is a separate three-way fan upgrade; Mana Pearl increases tear size and damage, Swift Feather increases firing speed, and Far-Reach Lens extends travel distance. The Frost Rune is automatic: once found it freezes nearby ordinary enemies and slows bosses (blue glow, 12-second recharge) until you pick up an element sigil.
- Unlock marked key doors by approaching and pressing E; each locked reward room contains destructible relics, a marked relic guaranteed to yield a collectible item, and a guaranteed ability upgrade. Defeating a mini-boss also reveals an ability upgrade in its room. Mini-boss encounters are chosen randomly from regional pools. Snakes are limited to desert and cave regions and spit venom that leaves damaging acid; spiders leave slowing webs, Snails trail slowing slime, Fluffies can summon more Fluffies, frogs leap aggressively, and Bandits aim visible bows and shoot arrows. Spore Sowers telegraph and launch a seed orb that bursts into eight radial shards; Spore Bloom is an obtainable player ability with its own cooldown.
- Each keeper offers three unique items with distinct offer icons, including wearable clothes. Silk Shorts increase movement speed; Leather Legguards slow you down but absorb two hits, and a Leather Vest absorbs one. Clothing appears over your character and stays equipped for the run, changing the delver’s look as the run progresses.
- Each delver starts with a different mix of movement, health, damage, attack speed, and combat style. Keepers may teach new styles and sell swords or daggers. All learned styles and acquired melee weapons attack together; Tab, the mouse wheel or 1/2/3 changes which style leads the attack.
- Collect zenny, keys, bombs, and heart-shaped health pickups; zenny pickups use a marked gold coin so they stay visible on sand. Shop prices rise by 2 zenny per deeper floor and are capped at 15. Any of the 36 monster types may appear as a familiar offer in about 30% of shops; at most one is offered per shop, and no more than two familiars can join a run. Familiars orbit, attack nearby foes, fire alongside your shots, and intercept enemy projectiles. Knocked-out familiars return after a short recovery or are restored on entering another room.
- Learn up to two unique active abilities in a run. Ability offers do not repeat, and the two-slot limit also applies to room rewards and boss drops.
- Keep a three-kill chain alive within 3.2 seconds to earn one bonus zenny; the chain resets after a lull.
- Visit the bank room on each floor to deposit all carried zenny by walking onto the vault pad or withdraw your stored balance with Shift+E. Banked zenny is saved separately from the active run and persists across refreshes, closing the game, and new runs.
- Pause with P or Esc. The game also pauses when its browser tab loses focus. Press X from the pause screen to save and return to the title; choose Resume Saved Descent or press R to continue. The current run autosaves and resumes after a page refresh, including room contents and run progress.
- Ordinary breakables have a small chance to drop a heart or coin, and bomb-destroyed objects retain their 50% bomb-drop chance. Marked relics in key and bomb-secret reward rooms always drop a collectible item; each obstacle still gets only one drop chance.
- Brawl with fists, swords, or daggers after learning melee; additional melee weapons stack and swing together. Learned magic and bow attacks also fire alongside them. Bow poses and the enlarged bow appear only during bow attacks; keyboard and controller shots follow the current facing, while mouse aim follows a held left button.
- Buy Mana Tonics, Bomb Bundles, and Mana Bursts as consumables; press Q to use the first item that can help.
- Face the regional guardians: Great Red Slime in Tulimshar, Jacko in Hurnscald, Reaper in the Graveyard, Golem in the Artis Ruins, Bandit Lord in Halinarzo, Snowman Boss in Nivalis, Yeti King in Frostia, Forest Dragon on Fortress Island, and Night Dragon at the World Edge. All regions after Tulimshar are shuffled between runs. Guardians use regional TMW sprites, unlock the delver tied to their region, and reveal a new journal clue. Attacks are telegraphed with recovery windows; clear surviving summons before a boss-room seal opens.
- Defeat all nine guardians to finish the run; the World Edge can appear anywhere after Tulimshar.
- Player attack cues follow the selected lead style: quiet nonverbal magic impacts, bow releases, or hand strikes. Jacko speaks when he begins his occasional minion summon. Monster attacks and deaths, bombs, and boss events have separate sound cues. Ambient music is generated by Web Audio because no music track is included in the assets; use the title-screen sliders to set music and effects volume.
- Delvers start every descent with four hearts. Heart Vessels in shops add one heart each; total extra hearts are capped at nine, and offers become rare after five. Enemies spawn with more health than your strongest single hit, and a full-health enemy always survives its first hit. Your attacks never fire more than eight projectiles at once (familiars and sword swipes excluded). Newly found abilities morph your attacks: shapes, pulses, drops, explosions, or a four-way ring, and some morphs trade power or speed for flair.

## Controls

- Move: WASD or Arrow keys
- Aim and shoot: Hold the primary mouse button; firing stops reliably when released or when the game loses focus.
- Dash: Space (left hand stays on WASD)
- Weapon: 1/2/3 select, Tab or mouse wheel cycles
- Weapon mode: B cycles Rapid / Charge (all weapons) / Triple (bow only); each weapon remembers its mode, and an icon on the action bar shows it
- Class ability: 4 or right-click
- Use a consumable: Q
- Shockwave (clears enemy bullets and shoves foes; one earned per floor): R
- Bomb: F
- Frost and elements are automatic: Frost chills nearby foes by itself, and shots take the last element sigil you found
- Interact / buy / talk: E (walking onto items never buys them)
- The bottom HUD action bar shows each button, its count and cooldown.
- Every action above can be rebound on the Controls screen (C on the title or pause screen). Bindings save and the tutorial and prompts update to match.

### Controller (Xbox / PlayStation, auto-detected)

- Move: Left stick; aim: Right stick; fire: RT/R2 or right stick press-out
- Interact: A/✕; Bomb: B/○; Shockwave: Y/△
- Consumable: LT/L2; Dash: RB/R1; Cycle weapon: LB/L1
- D-pad (never moves you): Left weapon mode, Down journal, Right class ability
- Map: Back/Share (Back also opens Controls from the title or pause screen); Pause: Start/Options
- On-screen prompts switch to controller on any button press (sticks are ignored to avoid drift) and back to keyboard on any key or mouse input
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

The game is static files only, so it can be hosted anywhere (GitHub Pages, itch.io HTML5, Netlify, any web server). Upload `index.html`, `style.css`, `game.js` and the `assets` folder. Note that `assets/tmw` is a full TMW client-data snapshot of about 250 MB; the game itself reads only around 10 MB of it, so trimming unused files makes hosting much lighter. Keep the licence files (`assets/tmw/clientdata/LICENSE`, `ART_LICENSE`, `GPL`, `CC BY-SA 3.0`) with whatever you publish.

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

The story is an unofficial fan-made addition, not canon. It takes inspiration from The Mana World's setting and uses references to [Hurnscald](https://wiki.themanaworld.org/wiki/Hurnscald), [Artis](https://wiki.themanaworld.org/wiki/Artis), [Candor](https://wiki.themanaworld.org/wiki/Candor), and the [Great Quake](https://wiki.themanaworld.org/wiki/The_Great_Quake). The wiki identifies some history material as legacy or unfinished; the game does not claim to represent official canon.
