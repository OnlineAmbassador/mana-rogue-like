# Source of Mana credits

Source of Mana is developed by [Manasource / Reid and contributors](https://github.com/sourceofmana); the playable reference is [Source of Mana on itch.io](https://manasource.itch.io/source-of-mana). These borrowed files are licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see [the bundled license](<CC BY-SA 4.0>)). Attribution is not a claim of endorsement.

## Graphics and map reference

Copied unmodified from [revision ebb0335f1ac438a883f1d70e27cdfe92f811ed28](https://github.com/sourceofmana/sourceofmana/tree/ebb0335f1ac438a883f1d70e27cdfe92f811ed28). Authors and license were verified against that revision's [LICENSE.md](https://github.com/sourceofmana/sourceofmana/blob/ebb0335f1ac438a883f1d70e27cdfe92f811ed28/LICENSE.md) and the map's license property.

| Local file | Original path under `data/` | Artist / author | Contributor |
|---|---|---|---|
| `graphics/wall.png` | `graphics/tilesets/tonori/wall.png` | Modanung | Reid |
| `graphics/soulmenhir.png` | `graphics/sprites/npcs/soulmenhir.png` | Crush | Reid |
| `maps/tulimshar.tmx` | `maps/tonori/tulimshar/tulimshar.tmx` | Reid | |

The game does not load the map. It is kept unmodified as the source that `tests/presentation.test.js` checks the wall tile ids against, so a wrong id fails a test. The map is an architectural reference, not a standalone playable level: its other tilesets remain upstream. The renderer adapts its `Over` layer at zero-based (39,25) through (39,28), and its `Ground` layer at (35,0) through (38,0), into repeatable horizontal faces and vertical wall-top walkways. Four 4x4 corner adaptations join them with native handed elbows, rather than overlapping straight runs:

- Left stepped curve: `Over` (35,54..56), IDs `1,8,24`, and `Ground` (35,57), ID `40`.
- Right stepped curve: `Over` (47,54), (48,55..56), IDs `3,11,27`, and `Ground` (48,57), ID `43`.
- Diagonal inner joins: `Over` (36,27..28), IDs `25,41`, and (47,56..57), IDs `26,42`.
- Transparent corner pieces are drawn over wall-top ground, following the map's layered construction; they are not opaque standalone blocks. Repeatable straight fill is adapted to fit the room rather than importing a full source building.

This adapted wall arrangement retains CC BY-SA 4.0 terms. Wall depth is compressed to the existing 64px collision boundary; the original images are not edited. The soul menhir uses its native 64x64 image. No Source of Mana UI art is copied.

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
