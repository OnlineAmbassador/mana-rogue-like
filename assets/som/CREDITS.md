# Source of Mana credits

Source of Mana is developed by [Manasource / Reid and contributors](https://github.com/sourceofmana); the playable reference is [Source of Mana on itch.io](https://manasource.itch.io/source-of-mana). These borrowed files are licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see [the bundled license](<CC BY-SA 4.0>)). Attribution is not a claim of endorsement.

## Graphics and map reference

Copied from [revision ebb0335f1ac438a883f1d70e27cdfe92f811ed28](https://github.com/sourceofmana/sourceofmana/tree/ebb0335f1ac438a883f1d70e27cdfe92f811ed28). Authors and license were verified against that revision's [LICENSE.md](https://github.com/sourceofmana/sourceofmana/blob/ebb0335f1ac438a883f1d70e27cdfe92f811ed28/LICENSE.md) and the map's license property. The images were later losslessly recompressed by `tools/optimize-pngs.js` (2026-10-31): every decoded pixel is identical to the upstream file, colour-management chunks were kept and text and other metadata chunks were dropped, so the bytes differ from upstream but the pictures do not.

| Local file | Original path under `data/` | Artist / author | Contributor |
|---|---|---|---|
| `graphics/wall.png` | `graphics/tilesets/tonori/wall.png` | Modanung | Reid |
| `graphics/soulmenhir.png` | `graphics/sprites/npcs/soulmenhir.png` | Crush | Reid |
| `maps/tulimshar.tmx` | `maps/tonori/tulimshar/tulimshar.tmx` | Reid | |
| `graphics/effect-arrow.png` | `graphics/effects/arrow.png` | Alige |  |
| `graphics/effect-cast.png` | `graphics/effects/particles/cast.png` | Reid |  |
| `graphics/effect-cast1.png` | `graphics/effects/particles/cast1.png` | Reid |  |
| `graphics/effect-cast5.png` | `graphics/effects/particles/cast5.png` | Reid |  |
| `graphics/effect-cast10.png` | `graphics/effects/particles/cast10.png` | Reid |  |
| `graphics/effect-fire.png` | `graphics/effects/particles/fire.png` | Neorice |  |
| `graphics/effect-orb.png` | `graphics/effects/particles/orb.png` | Reid |  |
| `graphics/effect-orb-oval.png` | `graphics/effects/particles/orb-oval.png` | Reid |  |
| `graphics/effect-orb-glow.png` | `graphics/effects/particles/orb-glow.png` | Reid |  |
| `graphics/effect-mana-ball.png` | `graphics/effects/particles/mana-ball.png` | Reid |  |
| `graphics/effect-smoke.png` | `graphics/effects/particles/smoke.png` | Reid |  |
| `graphics/effect-twinkle.png` | `graphics/effects/particles/twinkle.png` | Reid |  |
| `graphics/effect-arc.png` | `graphics/effects/particles/arc.png` | Reid |  |
| `graphics/effect-bubble-16.png` | `graphics/effects/particles/bubble-16.png` | Fate |  |
| `graphics/effect-sonic-wave.png` | `graphics/effects/sonic-wave.png` | Pateame | Reid |
| `graphics/accessory-fire.png` | `graphics/sprites/accessories/fire.png` | Sharm | Reid |
| `graphics/spiderweb-x4x3.png` | `graphics/tilesets/generic/cave/spiderweb-x4x3.png` | Reid |  |
| `graphics/skill-spitfire.png` | `graphics/items/skill/spitfire.png` | Reid |  |
| `graphics/skill-spell.png` | `graphics/items/skill/spell.png` | Reid |  |

### Artis market sheet (CC BY-SA 3.0)

`graphics/artis-market.png` is the exception to the CC BY-SA 4.0 rule above. It comes from [sourceofmana/artdesign](https://github.com/sourceofmana/artdesign) revision [07f2d74ef5b6c0731b33af87c2e8c3850c2b3109](https://github.com/sourceofmana/artdesign/tree/07f2d74ef5b6c0731b33af87c2e8c3850c2b3109), path `tilesets/Artis/City/artis-market.png` (last changed in commit `c97f8a69d734`, 2023-04-17). That revision's `licenses/EvolMedia` records `Tileset/Artis_market.xcf` as EJlol, IvanMorve and Reid under CC BY-SA 3.0, and `licenses/Artists.txt` lists all three as having agreed to CC BY-SA 3.0. The licence text is in `assets/tmw/clientdata/CC BY-SA 3.0`. File SHA-256 `e00a30254167089e4dbb09c5bec1a70cf64c038eb030ad774b161bc894077f54`; the file is unmodified.

| Local file | Original path | Artists |
|---|---|---|
| `graphics/artis-market.png` | `tilesets/Artis/City/artis-market.png` | EJlol, IvanMorve, Reid |

The shop room (`shopart.js`) draws unstretched sub-rectangles of it: the striped-canopy stall (352,0,128x96), the plank counters (352,104,64x55), the two striped banners (256,0 and 320,0, 32x96) and the gem and bead props (416,104,94x55), at a fixed pixel scale with smoothing off. Everything else in the shop is text and simple canvas shapes.

The game does not load the map. It is kept unmodified as the source that `tests/presentation.test.js` checks the wall tile ids against, so a wrong id fails a test. The map is an architectural reference, not a standalone playable level: its other tilesets remain upstream. The renderer adapts its `Over` layer at zero-based (39,25) through (39,28), and its `Ground` layer at (35,0) through (38,0), into repeatable horizontal faces and vertical wall-top walkways. Four 4x4 corner adaptations join them with native handed elbows, rather than overlapping straight runs:

- Left stepped curve: `Over` (35,54..56), IDs `1,8,24`, and `Ground` (35,57), ID `40`.
- Right stepped curve: `Over` (47,54), (48,55..56), IDs `3,11,27`, and `Ground` (48,57), ID `43`.
- Diagonal inner joins: `Over` (36,27..28), IDs `25,41`, and (47,56..57), IDs `26,42`.
- Transparent corner pieces are drawn over wall-top ground, following the map's layered construction; they are not opaque standalone blocks. Repeatable straight fill is adapted to fit the room rather than importing a full source building.

This adapted wall arrangement retains CC BY-SA 4.0 terms. Wall depth is compressed to the existing 64px collision boundary; the original images are not edited. The soul menhir uses its native 64x64 image. No Source of Mana UI art is copied.

The `effect-*`, `accessory-fire`, `spiderweb` and `skill-*` files are drawn by `effectart.js` (effects, ground circles, pads, webs and item icons). They are scaled, rotated and recoloured only at draw time; the files are unchanged.

## Sounds

The sound files are copied unmodified from Source of Mana (`data/sounds`). Authors below are as listed in Source of Mana's `LICENSE.md`.

## sounds/alteration
- `exp.ogg`, `gp.ogg`, `hit.ogg`, `dodge.ogg`, `levelup.ogg`, `skillup.ogg`, `quest-done.ogg`, `quest-update.ogg`: Kenny690
- `heal.ogg`: Ledmitz

## sounds/entities
- `chest/open.ogg`: Ledmitz
- `croc/*`, `piou/*`: Ezili
- `skeleton/death.ogg`: Reid
- `slime/hit.ogg`: Ledmitz
- `bat/*`, `fluffy/*`, `pinkie/*`, `ratto/*`, `scorpion/*`, `shroom/*`, `slime/attack.ogg`, `slime/death.ogg`, `snake/attack.ogg`, `turtle/*`: Cosmostrator
