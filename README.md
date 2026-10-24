# MANA: Hollow Sanctum

This is a standalone room-based action roguelike prototype. Its story is fan-made and noncanonical, set in The Mana World's setting; the source assets remain credited under their original licenses.

## Third-party artwork

The TMW client-data repository is cloned at `assets/tmw/clientdata` (snapshot `3ab88eb52cb995be3d85c96810fe1826bc429ede`). Unlisted image files were removed from its `graphics` directory; image files whose paths appear in `license.md` were retained. XML descriptors and repository metadata remain. The game uses these client-data graphics:

- `graphics/items/equipment/charms/heart-of-isis.png` — V0id; GPLv2 and CC BY-SA 3.0.
- `graphics/items/equipment/ammo/stoneprojectile-icon.png` — wushin, tux9th; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/model/male.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin; GPLv2.
- `graphics/sprites/model/female.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin, Tezer; GPLv2.
- `graphics/sprites/model/neutral.png` — Modanung, Skipy, Talaroc, Wombat, Nami, Wushin; GPLv2.
- `graphics/sprites/hairstyles/hairstyle01.png`, `hairstyle02.png`, `hairstyle03.png` — Kineticstorm, Nami, Wushin; GPLv2.
- `graphics/sprites/hairstyles/hairstyle20.png` — Modanung, Wushin; GPLv2.
- `graphics/sprites/equipment/legs/shorts-female.png` — Modanung; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/equipment/legs/assassin-female.png` — Black Don; GPLv2.
- `graphics/sprites/equipment/chest/leather-female.png` — Modanung; GPLv2 and CC BY-SA 3.0.
- `graphics/tiles/desert_castle_interior.png` — Alige, EJlol, Irukard, IvanMorve Len, MerlinX420, Wushin; GPLv2.
- `graphics/tiles/desert_castle.png` — Alige, EJlol, Irukard, IvanMorve Len, MerlinX420, Wushin; GPLv2.
- `graphics/tiles/desert2.png` — :grey_question:, Wushin; GPLv2.
- `graphics/tiles/desert1.png` — :grey_question:, Wushin; GPLv2.
- `graphics/tiles/woodland_ground.png` — :grey_question:, Crush, Wombat, enchilado; GPLv2.
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
- `graphics/sprites/monsters/logmonster.png` — FotherJ; GPLv2 and CC BY-SA 3.0.
- `graphics/sprites/monsters/mushroom-red.png` — Yuuki; GPLv2.
- `graphics/sprites/monsters/grass.png` — HoraK-FDF; GPLv2 and CC BY-SA 4.0.
- `graphics/sprites/monsters/plant.png` — Crush, Seradest; GPLv2.

The projectile, heart, Ratto, Croc, Wisp, log monster, shorts, leather chest, Bluepar, frog, skeleton, spider, Spider Queen, and Golem sprites use their CC BY-SA 3.0 license option, unmodified. Mushroom, grass, plant, ghost-pumpkin, bat, Mouboo, slime, snake, hairstyle art, assassin legguards, and the desert, woodland, and desert castle tiles are used under GPLv2; the player and shopkeeper body sheets are also GPLv2. Player body and face colors are corrected at runtime to add warm skin tones while retaining sprite shading; hairstyle and clothing sprites are layered over the body. Browsers that restrict pixel readback for images opened directly from disk display the original TMW sprite colors instead, so character selection remains visible. Desert rooms retain the TMW sand ground tile (tile 100 from `desert2.png`) inside the real desert-castle masonry border and use a cactus tile from `desert1.png` for bomb-breakable obstacles; woodland rooms use TMW plants, and vault rooms use mushrooms and stone logs. Woodland and vault rooms use their respective TMW terrain tiles. Secret rooms use cool-tinted stone-floor tiles from the desert-castle interior sheet. The corresponding GPL license text is in `assets/tmw/clientdata/COPYING`. Preserve each asset's applicable license and attribution when redistributing.

The repository includes the license records in `assets/tmw/clientdata/license.md` and the unlisted-license inventory in `assets/tmw/clientdata/license-missing`. The license list notes that its credits may be incomplete or incorrect. Verify asset credits and licenses before redistributing a release, and retain this attribution and the [CC BY-SA 3.0 license terms](https://creativecommons.org/licenses/by-sa/3.0/) with the artwork.

## Gameplay

- Choose from three characters; defeat a floor boss or discover a secret room to unlock two of them for future runs.
- Explore a winding, branching room layout toward each floor guardian. The starting room has at least two ordinary, unlocked exits; shops, locked reward rooms, secrets, and mini-bosses sit farther along optional branches. The route to the main boss never requires clearing an optional branch or spending a key.
- Every floor has a bombable hidden-room entrance. Rooms preserve their contents, enemy positions, and obstacle states when you leave and return.
- Biomes change with the story: Candor's desert, Hurnscald's forest, then the Artis quake vault. Each area uses 32×32 ground tiles from its TMW client-data tileset inside a deep, 64-pixel castle-stone room border, and an on-screen location badge identifies the area.
- Track explored rooms, connections, and known special rooms on the persistent minimap; press M for the full map.
- Keep player status and boss health in the room's non-walkable 64-pixel border; heart indicators have no panel background or label, and status icons have a light translucent outline. The top doorway stays clear. The player can move normally through on-screen indicators and minimap; walls block movement except through aligned, open doorways.
- Clear rooms to open doors. Some doors require a key.
- Navigate around biome-matched obstacles with distinct markings: desert cactus and orange-fragment mushrooms only break to bombs, steel-gray crossed logs are permanent blockers, and green-marked grass and forest plants regenerate in three visible stages. Regrowing plants can be destroyed permanently after their limited cycles. Normal rooms can have no obstacles, and bomb-destroyed objects have a 50% chance to drop another bomb. Obstacles block movement, sight, and projectiles; bombs only damage objects within line of sight. Bomb cracked walls to open secret rooms.
- Bomb a cracked wall to reveal its door into a peaceful sacred room. The room always has destructible relics, including one marked relic guaranteed to drop a collectible item; an ability upgrade is an additional chance, not the only reward. Their stone floor uses 32×32 blocks from the licensed TMW desert-castle interior tileset, following tile choices used in existing client-data maps. A hidden creature may spring from a breakable relic.
- Shoot magical tears with particle trails; shop upgrades can increase tear size and damage, add a three-way shot, or increase firing speed. The Frost Rune is an active ability: press C to freeze nearby ordinary enemies and slow bosses, shown by a blue glow, with a 12-second recharge.
- Unlock marked key doors by approaching and pressing E; each locked reward room contains destructible relics, a marked relic guaranteed to yield a collectible item, and a guaranteed ability upgrade. Defeating a mini-boss also reveals an ability upgrade in its room. Monster rosters are chosen by area/floor map, not separately for each room: desert maps feature diving bats, snakes, and hopping slimes; Hurnscald maps add leaping frogs, stalking spiders, charging Mouboos, and volley-spitting Bluepars; Artis vault maps include skeletons, spiders, bats, snakes, slimes, and Bluepars. Normal rooms are less crowded early on, with a chance of no monsters that falls from 40% on floor one to 12% on floor three; enemy counts rise as the delver descends. Mobs grow tougher on each deeper floor, with more health, faster movement, quicker attacks, and faster projectiles; they never spawn in door entrances. Each species keeps the same learned attack pattern on every floor: Rattos make quick, short hops; frogs leap farther after a longer tell; slimes make slow, heavy hops; spiders stalk and then pounce; Crocs roll and summon biome-matched obstacles; Mouboos give a longer tell before charging. Bluepars fire aimed volleys, Wisps alternate a telegraphed laser with aimed magic, and snakes and skeletons telegraph and lob bombs that can hurt the player and blast destructible objects; snakes throw smaller bombs quickly, while skeletons take longer to wind up larger blasts.
- Each keeper offers three unique items, including wearable clothes. Silk Shorts increase movement speed; Leather Legguards slow you down but absorb two hits, and a Leather Vest absorbs one. Clothing appears over your character and stays equipped for the run.
- Choose a Mage (magic tears), Warrior (hand-to-hand), or Rogue (bow and arrows). Keepers may teach new styles and sell swords or daggers. All learned styles and acquired melee weapons attack together, stacking their damage and projectiles; F changes which style leads the attack. Any class can learn every style.
- Collect zenny, keys, bombs, and health; shop prices rise by 2 zenny per deeper floor and are capped at 15. Recruit TMW familiars from keepers to orbit you, attack nearby foes, fire alongside your shots, and intercept enemy projectiles. Familiars are recruited for the current run only; knocked-out familiars return after a short recovery or are restored on entering another room.
- Visit the bank room on each floor to deposit all carried zenny with E or withdraw your stored balance with Shift+E. Banked zenny is saved separately from the active run and persists across refreshes, closing the game, and new runs.
- Pause with P or Esc. The game also pauses when its browser tab loses focus. Press X from the pause screen to save and return to the title; choose Resume Saved Descent or press R to continue. The current run autosaves and resumes after a page refresh, including room contents and run progress.
- Ordinary breakables have a small chance to drop a heart or coin, and bomb-destroyed objects retain their 50% bomb-drop chance. Marked relics in key and bomb-secret reward rooms always drop a collectible item; each obstacle still gets only one drop chance.
- Brawl with fists, swords, or daggers after learning melee; additional melee weapons stack and swing together. Learned magic and bow attacks also fire alongside them.
- Buy Mana Tonics, Bomb Bundles, and Mana Bursts as consumables; press Q to use the first item that can help.
- Face TMW guardians selected by area: Jacko in Candor, the Spider Queen in Hurnscald, and a Golem in the Artis vault. Guardians gain substantially more health, movement speed, projectile speed, and attack tempo on deeper floors. Their sprite sheets use the directional movement and attack sequences documented in the client XML. Each guardian has two phases; at half health, attacks accelerate and intensify. Jacko has one-third of the previous health and rolls, jumps, and adds a ground pound that vanishes offscreen before charging in from a random edge and resetting to the room's center. The Spider Queen leaps toward a telegraphed target and follows with web volleys; in phase two she pounces more often, moves faster, summons larger groups, and adds a second aimed volley. The Golem gives a clear tell before a close-range stone slam and three-way shard spray; in phase two he moves faster, targets a wider slam zone, and sends a radial shockwave after each slam. Bosses and selected monsters fire aimed three-shot spreads; clear any surviving summons before the boss-room seal opens.
- Defeat three floor guardians and descend to finish the run.
- Story text references TMW places and lore as a fan-made, noncanonical adventure.

## Controls

- Move: WASD or Arrow keys
- Aim and shoot: Hold the primary mouse button or Space; firing stops reliably when released or when the game loses focus.
- Change lead combat style: F
- Bomb: B
- Use a consumable: Q
- Frost Rune (when acquired): C
- Interact, unlock marked doors, or descend: E
- Buy shop offers: 1, 2, or 3 (near the keeper)
- Map: M
- Pause/resume: P or Esc
- Save and exit to title: X while paused
- Resume saved descent from title: R
- Character selection: Click an unlocked delver, or use Left/Right or A/D; press Enter or click Descend to start
- Return to character selection after a run: Enter

## Run locally

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
