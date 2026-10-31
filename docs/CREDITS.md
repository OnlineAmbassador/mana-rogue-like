# Credits

Third-party artwork, sounds and references used by MANA: Hollow Sanctum. Per-file credits for Source of Mana material are in `assets/som/CREDITS.md`. That file also records `assets/som/graphics/artis-market.png` (EJlol, IvanMorve, Reid; CC BY-SA 3.0), the market-stall sheet used to dress the shop room.

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
- `graphics/items/generic/gemstone-a.png` — Crush, Enchilado; GPLv2 and CC BY-SA 3.0 (the CC BY-SA 3.0 option is used here). The Lifestone icon. The file is unmodified; the game recolours it at runtime with the dye values of TMW item 730 (`generic/gemstone-a.png|W:#a0a010,ffffa0`), mapping grey levels onto that gradient. The recolour is an adaptation made in the game's canvas code.
- `graphics/items/generic/crystal.png` — Crush, Enchilado; GPLv2 and CC BY-SA 3.0 (CC BY-SA 3.0 used). The Dark Crystal icon, unmodified on disk and recoloured at runtime with the dye values of TMW item 631 (`generic/crystal.png|W:#252e6a,923eda,ba72ec,ffffff`).
- `graphics/items/generic/ironore.png` — Crush, Enchilado; GPLv2 and CC BY-SA 3.0 (CC BY-SA 3.0 used). The Iron Ore icon, unmodified.
- `graphics/items/equipment/chest/leathershirt.png` — EJlol; GPLv2 and CC BY-SA 3.0 (CC BY-SA 3.0 used). The Leather Vest icon, unmodified.
- `graphics/items/equipment/legs/chaps.png` — Black Don; GPLv2. The Leather Legguards icon, unmodified.
- `graphics/items/equipment/legs/silkpants.png` — LuH; GPLv2. The Silk Shorts icon, unmodified.
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

## Credits and lore references

Sound effects under `assets/som/sounds` are copied unmodified from [Source of Mana](https://github.com/sourceofmana) and licensed CC BY-SA 4.0 (`assets/som/CC BY-SA 4.0`). Per-file credits are in `assets/som/CREDITS.md`.

The story is an unofficial fan-made addition, not canon. It takes inspiration from The Mana World's setting and uses references to [Hurnscald](https://wiki.themanaworld.org/wiki/Hurnscald), [Artis](https://wiki.themanaworld.org/wiki/Artis), [Candor](https://wiki.themanaworld.org/wiki/Candor), and the [Great Quake](https://wiki.themanaworld.org/wiki/The_Great_Quake). Mana Seeds, Kaore, Soul Menhirs, and the last Mana Tree are drawn from Source of Mana's lore. The wiki identifies some history material as legacy or unfinished; the game does not claim to represent official canon.

## Acknowledgements

Compatible presentation fixes adapted from [WildX-480's fork](https://github.com/WildX-480/mana-rogue-like): preserved control-hint line breaks and live game-message announcements. Its unrelated balance and audio changes are not merged.
