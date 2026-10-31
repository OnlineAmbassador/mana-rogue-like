# Items

Reference for every item in `shopItemCatalog` (`game.js`), its base cost and effect, and what the item review of 2026-10-31 changed. Costs are base costs: a shop price is the base plus 2 zeny per floor after the first (bombs and hearts plus 1), capped at 15 (`createShopStock`, `worldmanager.js`). The review was done as a set of questions with the project owner; the outcomes are pinned by `tests/items.test.js`, so change a number here and in that test together. Credits for the artwork are in [CREDITS.md](CREDITS.md).

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
| Mana Pearl | 7 | Tear size x1.45, +1 damage | was 5; +1 doubles a damage-1 class |
| Prism Shard | 8 | Three-way fan, 0.4x per shot (1.2x if all land); with a non-water element the fan fuses into one x1.6 shot | was five shots at 0.2x with a "three-way" description |
| Swift Feather | 8 | Fire delay x0.7, +70 projectile speed | was 6 |
| Heart Vessel I / II / III | 8 / 11 / 14 | +1 max heart and +1 heart; extra hearts capped at nine | now bought in order (II needs I, III needs II) |
| Luck Up I / II | 6 / 9 | +1 Luck each, in order | Luck now also raises Iron Ore and Dark Crystal drops |
| Far-Reach Lens I / II / III | 8 / 11 / 14 | Projectile range x1.35 each, III pierces solid barriers; melee reach +10% per tier | was 7 / 10 / 13 and projectile-only |
| Wild Magic Core | 9 | Wild lightning links four foes, decay lasts four seconds, wild explosions reach farther | merges Storm Spool, Ember Seed, Nova Pearl; the name is a placeholder |

## Abilities and elements

Two standard ability slots; Betsanc does not use one.

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Frost Rune | 9 | Auto pulse freezes foes within 250 px for 2.4 s every 12 s; its morph makes shots x0.9 damage and x0.88 speed | unchanged |
| Betsanc (id `orbiting-projectiles`) | 10 | Replaces Shockwave with orbiting guards: 1 charge per cleared room, 5 charge for 3 guards | renamed from Mana Familiar Sigil; mechanics unchanged |
| Spore Bloom | 10 | Magic shots become slowing spore clusters; unlocks the Sporeling | unchanged |
| Bonded Aegis | 11 | Blocks three hits, never refills | its shot morph (x0.65 damage, x1.25 delay) was removed |
| Ember / Storm / Miasma Sigil | 7 each | Add a magic element; unlock after 5 / 15 / 30 minutes of playtime plus the matching enemy ability | was 8 / 9 / 8; shot trade-offs kept |

## Weapons and weapon mods

| Item | Base cost | Effect | Review |
|---|---|---|---|
| Iron Sword | 8 | +2 melee damage, reach 92 | was 7; no longer offered when a sword is already held (the Warrior starts with one) |
| Swift Daggers | 7 | +1 melee damage, reach 53, swing cooldown x0.8 | the speed is new |
| Wind-Up Wraps | 7 | Taking it puts melee in charge mode; charge builds 30% faster | it used to re-roll the style to rapid, so it almost never worked |
| Flurry Gauntlets | 7 | Jabs at 1.0x scale with cooldown x0.35 (about +10% DPS) | was x0.4 (about -4%) |
| Cinder Edge | 8 | Swings leave a fire wall | unchanged |
| Piercing Heads | 8 | Arrows pierce 9 foes | was 7 |
| Longbow Draw | 7 | Taking it puts the bow in charge mode; draw 30% faster | same fix as Wind-Up |
| Rapid Quiver | 7 | Damage x0.6, delay x0.55 (about +9% DPS) | unchanged |
| Storm Fletching | 9 | Arrows chain lightning | unchanged |
| Impact Core / Storm Conduit / Lingering Mana | 8 / 9 / 8 | Magic bursts / chains / leaves a cloud | unchanged |

One mod per style; a new one replaces the old. Taking any weapon, mod or element re-rolls that style's fire mode (rapid, or a 5% once-per-run charge discovery), except the two charge mods above.

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
| Mana-Cafe Latte | 6 | Speed x1.12, fire rate x1.15 | unchanged |
| Mana Lisa | 4 | Fire rate x1.2 | was 6 |
| Roll With It / Wild Card | 5 / 5 | Random status each room / every 14 s | were 6 |
| ~~Overdrawn Account~~ | | | removed: never better than Hot Take |

Sole Survivor stays 5 although Run-On Sentence is better in every stat; the extra 1z is the price of the better one.

## Clothing

| Item | Base cost | Effect |
|---|---|---|
| Silk Shorts | 6 | Speed +32 |
| Leather Legguards | 8 | 2 armor, speed -18 |
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
