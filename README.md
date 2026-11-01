# MANA: Hollow Sanctum

A roguelike you play in your web browser. Pick a delver, fight your way through a chain of rooms, and defeat the guardian at the end of each region. Every run is different: the rooms, the order of the regions and what you find along the way are shuffled each time, and when a run ends you start over with new unlocks to chase.

There is nothing to install. It works in current Chrome, Edge, Firefox and Safari, with a keyboard and mouse, an Xbox or PlayStation controller, or touch controls on a phone.

## Where it comes from

Hollow Sanctum is built from a mix of Manasource assets and is inspired by The Mana World, Source of Mana and Moubootaur Legends. Its story is fan-made and not canon. Full credits and licenses are in [docs/CREDITS.md](docs/CREDITS.md).

## How to play

1. Open the game and set the music and effects volume on the title screen.
2. Read the prologue, pick a delver and press Enter.
3. Press **H** (or click **HOW TO PLAY**) for the interactive tutorial. It shows the controls for whatever you are using.

### What a run looks like

- **Regions.** A run starts in Tulimshar and then visits the other eight regions in a shuffled order. Each region has its own look, enemies and guardian. Defeat all nine guardians to finish the run.
- **Rooms.** Clear a room's enemies to open its doors. Some doors need a key. Rooms remember what you left behind, and the map (**M**) shows where you have been and lets you travel back to any cleared room.
- **Side rooms.** Branches off the main route hold shops, a bank, locked reward rooms, secret rooms behind cracked walls (use a bomb), puzzle trials and an optional altar where you can trade a heart for a reward, or fight for one.
- **Weapons.** Every delver can choose Sword, Arrows or Magic at the start and switch among all three throughout the run without opening Build. Use 1/2/3 or tap the HUD weapon icons; Tab, the mouse wheel, controller LB/L1 and touch Swap cycle all three. Switching keeps its short cooldown. Upgrades change how attacks behave, and some let you hold the attack button to charge a stronger shot.
- **Abilities and items.** Shops and rewards offer upgrades, abilities, bombs, healing and clothing. Pick an optional starting ability from the ones you've found (or a suited random one), then choose your weapon. Every run starts with Bubble; only obelisks unlock other elements during that descent and let you change attunement. Profile discoveries and sigils never bypass this lock. Every ability takes on the active element's colour and effects. Build opens a map of each weapon's branches that you can pan, zoom and walk to pick your synergies, hold any weapon in your main or off hand (found and learned weapons hit harder), follow a suggested path that adapts to how you play, and at the top join Blade, Bow and Magic in the Confluence. Stats cost ore, crystals or zeny; abilities are padlocked and open with Life Stones from elites, minibosses and caches. If something can't be grown, the screen points at what you're missing.
- **Delvers.** Mage, Rogue and Warrior are available immediately. Other delvers unlock through regions, secrets, collections and guardians. Only one guardian/sentinel character reward is granted per descent, with special discovery exceptions. Selection shows species-specific combat perks.
- **Saving.** Your run saves automatically. Pause with **P** or **Esc**, and choose Resume Saved Descent from the title screen to continue after closing the game.

### Enemies that adapt

Enemies react to how you play. They respond to the weapon you have been using, and they notice whether you are on keyboard, touch or a controller and adjust to that without changing your aim or controls. If you would rather not have this, switch off **Adaptive enemies** on the pause screen.

## Controls

Every keyboard and controller action can be rebound on the Controls screen (**C** on the title or pause screen).

**Keyboard and mouse**

| Action | Key |
|---|---|
| Move | WASD or arrow keys |
| Aim and attack | Mouse; hold the left button to attack |
| Dash | Space |
| Choose weapon | 1 / 2 / 3, Tab or the mouse wheel |
| Class ability | 4 or right-click |
| Use a consumable | Q |
| Shockwave or familiars | R |
| Bomb | F |
| Interact, buy, talk | E |
| Map | M |
| Journal | J |
| Pause | P or Esc |

**Controller**

| Action | Button |
|---|---|
| Move | Left stick |
| Aim and attack | Right stick; RT / R2 to fire |
| Interact | A / ✕ |
| Bomb | B / ○ |
| Shockwave or familiars | Y / △ |
| Use a consumable | LT / L2 |
| Dash | RB / R1 |
| Choose weapon | LB / L1 |
| Map | Back / Share |
| Pause | Start / Options |

**Touch**

Drag the left side of the screen to move and hold the right side to attack. While an enemy is alive in the room, attacks aim at the nearest one automatically. On-screen buttons cover dash, bombs, items, abilities, weapon switching, the map, the journal and pause. Touch controls appear when you first touch the screen and give way to a controller or keyboard when you use one.

## Running it yourself

The game is a set of static files. Serve the folder with any web server (for example `python -m http.server 8000`) and open <http://localhost:8000/>, or open `index.html` directly. A server is recommended so that audio and artwork load reliably.

Developers and contributors: see the [docs](docs/) folder.
