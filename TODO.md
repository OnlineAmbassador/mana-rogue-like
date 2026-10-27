# Deferred Gameplay Backlog

## Discovery and progression
- [x] Add a main-menu Codex with descriptions for collected items, encountered enemies, and witnessed enemy moves.
- [x] Track cumulative active playtime and stage enemy unlocks for the next descent.
- [x] Introduce enemy types over time and record first encounters in the Codex so later descents reveal new foes.
- [x] Unlock selected item availability after witnessing the corresponding enemy attack; require finding the item in a later descent.
- [x] Complete progressive Far-Reach Lens tiers, with wall-piercing shots available only at the maximum tier.
- [x] Require shop purchases before abilities and elemental sigils can appear as locked-room rewards; slightly weight never-purchased offers (+6%).

## Elemental combat
- [x] Let collected Water, Fire, and Lightning affinities modify sword, dagger, brawl, arrow, and magic attacks, with distinct effects.
- [x] Apply Miasma through the shared cross-style elemental impact system.
- [x] Rework Spore Bloom into a slowing spore burst triggered by player bombs.

## Encounters and rewards
- [x] Add progression-scaled elite mutations and visual variants, including TMW hats.
- [x] Add linked enemy twins with shared three-hit armor, a speed synergy, and a player Aegis ability discovered by witnessing that shield; break both bonuses when the pair splits.
- [x] Add distinct horizontal, vertical, and diagonal movement attacks with telegraphs to the boss roster; keep each regional boss on a 3+ attack rotation and remove all boss hit-recoil.
- [ ] Add an optional risk/reward shrine encounter.
- [x] Give each regional boss a distinct 3+ attack rotation and movement signature, route minibosses through species-specific boss AI with lower health, and use available TMW walk/attack animation frames.
- [x] Increase secret-room bonus treasure variety and frequency: zenny, an extra upgrade chance, and occasional bombs or hearts.

## Publishing and performance
- [x] Auto quality mode (disables glow, caps particles when frame time is high).
- [x] Fix missing asset paths and draw familiars.
- [ ] Trim `assets/tmw` to the ~10 MB the game uses (about 250 MB now) before hosting.
- [ ] Preload sound effects into Web Audio buffers instead of per-sound Audio pools.
- [ ] Render the canvas at devicePixelRatio for sharper high-DPI displays.
- [ ] Playtest balance: charge damage, projectile drop, AI difficulty, HUD layout.

## Final polish
- [ ] Finish the broader art-direction and game-feel pass across regions, combat feedback, and reward presentation.