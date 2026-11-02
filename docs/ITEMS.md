# Items

Reference for every item in `shopItemCatalog` (`game.js`), its base cost and effect, and what the item review of 2026-10-31 changed. Costs are base costs: a shop price is the base plus 2 zeny per floor after the first (bombs and hearts plus 1), capped at 15 (`createShopStock`, `worldmanager.js`). The review was done as a set of questions with the project owner; the outcomes are pinned by `tests/items.test.js`, so change a number here and in that test together. Credits for the artwork are in [CREDITS.md](CREDITS.md).

## How bonuses are shown

Every item lists its bonuses as signed, rounded lines: `+50% Attack`, `-10% Speed`, `+2 Armor`. The lines appear on shop cards (green for a gain, red for a loss, up to two rows), in a second toast on pickup, after the item name when you hover it in the pause inventory, and after the description in the codex. They are built by `itemEffectTagsFor` (`gameui.js`) from the numbers the game applies: `ITEM_TUNING` in `playermanager.js`, a curio's `effects`, clothing `speedMul` and `attackMorphs`, so the text and the effect cannot drift apart. A saved shop stall keeps an old copy of its item, and the live catalogue entry decides the numbers. One scale throughout: percent change in the useful direction, rates shown as rates (fire rate, swing rate, charge speed), never as delays. Flat bonuses stay flat and small.

Known limit: damage is an integer. Each hit is rounded after the multiplier (`damageEnemy`), so `-15% Attack` changes nothing on a 1-damage hit and `+25% Attack` only shows on some hits at 1 to 3 base damage. The percentage is the multiplier, not a promise about every hit.

Hidden, not shown on cards: taking an ability or element multiplies the fire delay by 0.88, but only down to a floor of 0.55 s, so it helps a slow early weapon (about +14% for the first one) and does nothing once Swift Feather has brought the delay below 0.55 s. Decide in playtest whether to keep, show or remove it.

Rounding done with this change (all within about 2% DPS): Mana Pearl size x1.45 to x1.5; Swift Feather delay x0.7 to x1/1.4 (+40% fire rate) and shot speed +70 to x1.15; Mana-Cafe Latte speed x1.12 to x1.1; Silk Shorts +32 speed to x1.15; Leather Legguards -18 speed to x0.9 (clothing speed is now a multiplier); Wind-Up Wraps and Longbow Draw charge time x0.7 to x1/1.4 (+40% charge speed); Rapid Quiver delay x0.55 to x1/1.8; Flurry Gauntlets cooldown x0.35 to x1/2.8; Frost shots speed x0.88 to x0.9 and Miasma x0.82 to x0.8.

## New this review

| Item | How you get it | Effect |
|---|---|---|
| **Lifestone** | Every major boss drops one beside its other reward. Never in shops or reward pools, never "owned". | +1 heart container while you hold fewer than five extra hearts, then recovers three hearts, one at 6, 12 and 18 s (`LIFESTONE_HEARTS`, `LIFESTONE_TICK_SECONDS`, `playermanager.js`). Accepted at full health. Replaces the Guardian Heart. |
| **Iron Ore** | 6% per eligible kill. | Sells for 1z at a shop's sell pad. |
| **Dark Crystal** | 2% per eligible kill. | Sells for 3z. |

Eligible kills are normal, elite and miniboss foes. Elites and minibosses roll twice as often; each Luck point adds 1% (ore) and 0.5% (crystal). Summoned (`bossSummoned`), split-off (`isOffspring`), relic-ambush (`surpriseSpawn`) and altar-ambush or fluffy-summoned (`noMaterialDrops`) foes, and major bosses, never drop them. The rates are in `MATERIAL_DROP_TUNING` (`game.js`). With about 205 eligible kills a run (an estimate: 7 on floor 1, 50 on floor 9) the rates add roughly 25 zeny a run, weighted to later floors, on top of about 6 zeny a floor from coins. Carried materials are saved with the run and lost with it, like zeny.

New shop services (see [DEVELOPMENT.md](DEVELOPMENT.md)): the **sell pad** and the **repair pad**, and a stock rule that always adds one non-ability upgrade (up to five stalls).

## Passives

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Mana Pearl | 7 | +50% shot size, +1 damage | was 5; +1 doubles a damage-1 class |
| Prism Shard | 8 | Three-way fan, 0.4x per shot (1.2x if all land); with a non-water element the fan fuses into one x1.6 shot | was five shots at 0.2x with a "three-way" description |
| Swift Feather | 8 | +40% fire rate, +15% projectile speed | was 6 |
| Heart Vessel I / II / III | 8 / 11 / 14 | +1 max heart and +1 heart; extra hearts capped at nine | now bought in order (II needs I, III needs II) |
| Luck Up I / II | 6 / 9 | +1 Luck each, in order | Luck now also raises Iron Ore and Dark Crystal drops |
| Far-Reach Lens I / II / III | 8 / 11 / 14 | +35% projectile range each, III pierces solid barriers; melee reach +10% per tier | was 7 / 10 / 13 and projectile-only |
| Wild Magic Core | 9 | Wild lightning links four foes, decay lasts four seconds, wild explosions reach farther | merges Storm Spool, Ember Seed, Nova Pearl; the name is a placeholder |

## Abilities and elements

Two standard ability slots; Betsanc does not use one.

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Frost Rune | 9 | Auto pulse freezes foes within 250 px for 2.4 s every 12 s; its morph makes shots -10% damage and -10% speed | unchanged |
| Betsanc (id `orbiting-projectiles`) | 10 | Replaces Shockwave with orbiting guards: 1 charge per cleared room, 5 charge for 3 guards | renamed from Mana Familiar Sigil; mechanics unchanged |
| Spore Bloom | 10 | Magic shots become slowing spore clusters; unlocks the Sporeling | unchanged |
| Bonded Aegis | 11 | Blocks three hits, never refills | its shot morph (x0.65 damage, x1.25 delay) was removed |
| Ember / Storm / Miasma Sigil | 7 each | Add a magic element; unlock after 5 / 15 / 30 minutes of playtime plus the matching enemy ability | was 8 / 9 / 8; shot trade-offs kept |

## Weapons and weapon mods

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Iron Sword | 8 | +2 melee damage, reach 92 (+40% against bare hands) | was 7; no longer offered when a sword is already held (the Warrior starts with one) |
| Swift Daggers | 7 | +1 melee damage, reach 53 (-20% against bare hands), +25% swing rate | the speed is new |
| Wind-Up Wraps | 7 | Powers the Wind-Up branch (charge mode); +40% charge speed | charge mode now comes from the highlighted branch, not a re-roll |
| Flurry Gauntlets | 7 | Jabs at 1.0x scale (-62% hit damage) with +180% swing rate (about +8% DPS) | was x0.4 (about -4%) |
| Cinder Edge | 8 | Swings leave a wall of the run element (fire with no element) | unchanged |
| Piercing Heads | 8 | Arrows pierce 9 foes | was 7 |
| Longbow Draw | 7 | Powers the Longdraw branch (charge mode); +40% charge speed | same as Wind-Up |
| Rapid Quiver | 7 | -40% damage, +80% fire rate (about +8% DPS) | unchanged |
| Storm Fletching | 9 | Arrows chain lightning | unchanged |
| Impact Core / Storm Conduit / Lingering Mana | 8 / 9 / 8 | Magic bursts / chains / leaves a cloud | unchanged |

One mod per style; a new one replaces the old. Fire modes are no longer re-rolled: charge and triple shots come only from highlighted weapon branches (`skillBranches` in playermanager.js).

### Weapon branches

Each weapon style (Blade, Bow, Magic) has 5 branches, and 3 of them can be highlighted at once. You can only edit them in a cleared room, through the B key, D-pad up or the touch **Build** button. An item that changes attack behaviour (mods, elements, Prism, Wild Magic Core, Spore Bloom) works only while a highlighted branch of the held style lists it. A branch that lists items stays dormant until you own one of them. Cleave, Focus and Riposte are techniques that always work. Stat items are in no branch and always work. Picking up a gated item highlights its branch automatically when a slot is free.

Tier I has no tier price, but behavior abilities require a preceding paid stat rune before activation. Every higher tier also requires one of its stat forks, enough career XP (a rising threshold, never spent), and its own price (`branchTierCost`). Damage/reach stats lead toward Sword, attack/charge speed toward Arrows, and movement/splash/spell stats toward Magic. Either fork opens the next rune; both can be upgraded for their bonuses. Form tiers cost Iron Ore, power tiers Dark Crystals, speed tiers banked zeny, and behavior upgrades Life Stones. Weapon learning costs 1 Life Stone, Dual Grip 2, Confluence seals 1, fusions/moves 2 and Trinity 3; all require stat prerequisites. Life Stones drop from elites/minibosses (8%), purpose caches (10%), bomb caches (25%) and boss relics. Activating partner branches creates synergies. Progress lives in `save.branches`; the version-1 grid resets legacy tree upgrades once while preserving XP, resources, found weapons and other profile unlocks. Level-ups also offer a pick-one-of-three boon.

## Curios

Multipliers combine across all curios and the chaos status. The total **damage** multiplier is capped at x2.5 (`CURIO_DAMAGE_CAP`, `curioMultiplier`); boss HP does not count curios, so this is a limit, not a balance fix, and PLAYTEST.md asks whether it feels right.

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Hot Take | 8 | Damage x1.5 | was 5, x1.4 with speed x0.9 |
| Sole Survivor | 5 | Speed x1.2, damage x0.85 | unchanged |
| Run-On Sentence | 6 | Speed x1.35, damage x0.95 | was 5, x1.25 / x0.9 |
| Trigger Happy | 5 | Fire rate x1.4, damage x0.85 | was x1.3 / x0.8 |
| Heavy Metal | 6 | Damage x1.6, fire rate x0.75 | unchanged |
| Protein Shake-Down | 7 | Damage x1.25 | unchanged |
| Mana-Cafe Latte | 6 | +10% speed, +15% fire rate | unchanged |
| Mana Lisa | 4 | Fire rate x1.2 | was 6 |
| Roll With It / Wild Card | 5 / 5 | Random status each room / every 14 s | were 6 |
| ~~Overdrawn Account~~ | | | removed: never better than Hot Take |

Sole Survivor stays 5 although Run-On Sentence is better in every stat; the extra 1z is the price of the better one.

## Clothing

| Item | Base cost | Effect |
|---|---|---|
| Silk Shorts | 6 | +15% speed |
| Leather Legguards | 8 | 2 armor, -10% speed |
| Leather Vest | 7 | 1 armor |

Each armor point blocks one hit. Armor is now repairable at the repair pad (2z a point on floors 1-3, 3z on floors 4-6, 4z on floors 7-9). Bonded Aegis charges are not repaired.

## Consumables

Only found in breakable scenery (12% to 20% per object, one of the three at random); never sold.

| Item | Cost (unused) | Effect |
|---|---|---|
| Mana Tonic | 4 | +2 hearts |
| Bomb Bundle | 4 | +2 bombs |
| Mana Burst | 6 | 8 damage to every foe in the room, plus 4 per floor after the first (`manaBurstDamage`; 40 on floor 9) |

`strongestPlayerSingleHit()` keeps its flat 8 for Mana Burst, because it also sets miniboss and split-off HP.

## Shop staples

Bomb: 4z on floor 1, +1 per floor. Heart (+1 health): 3z, +1 per floor. Both are capped at 15z. Abilities and upgrades: base cost +2 per floor.

## Removed

Guardian Heart (replaced by the Lifestone), Overdrawn Account, Storm Spool / Ember Seed / Nova Pearl (merged), and Spell-Scribe, Brawler's Wraps and Trail-Worn Bow (every class already knows all three styles, so they could never be offered). A saved pickup of the Guardian Heart becomes a Lifestone on restore. Orphaned art left on disk: `coinbag.png`, `grimoir.png`, `leatherpatch.png`, `woodenbow.png`, and the old clothing icons `cottoncloth.png`, `fur.png`, `processedfur.png`; `node tools/trim-assets.js` lists them.

## Dormant: monster Familiars

39 `<monster>-companion` entries exist in the catalogue and the player code but no shop or reward offers them, since the earlier removal of the shop offer. All share one set of stats (2 hp, mirror your shots, contact damage 2, up to two per run) and now cost a flat 12z. Two at once would add up to double your shot damage, so they need a purpose and a balance pass before they come back; see the to-do in [HANDOFF.md](HANDOFF.md).

## Not items

Level-up boons (Swift, Might, Frenzy, Vigor, Reach) were not reviewed. Might gives a flat +1 damage, which is as strong early as the Mana Pearl, and is worth a look after playtesting.
