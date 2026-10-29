# Next Agent Handoff

## Persistent instruction

**This instruction is not to be removed** — Always read this handoff first when resuming work. Never delete this file. When the current task is complete, update this handoff with the next task and retain this instruction verbatim.

**Controller behavior is locked:** Do not change controller input, mappings, movement, aiming, firing, or disconnect handling unless the user explicitly asks to change controller behavior.

## Current task

No pending implementation task. The latest game-feel request is complete: charge attacks have distinct payoff, charge mode and repeated ability offers are rare, experienced players can encounter advanced AI earlier, major bosses rely more on their own attack sets, and some optional trials span two rooms with the reward gated to the last chamber. Preserve the controller lock below. The next agent should await the next user request and playtest the new combat/trial pacing if asked.

## Completed work

- Optional, enemy-free trial rooms now randomize among a light-routing mirror puzzle, a repeating rune-memory sequence, and a moving-spark chase. Layout, sequence, progress, mode, and completion reward persist through save/resume. Challenges stay clear of doorways and award a collectible heart, zenny, bomb, or eligible ability; an uncollected regional Codex appears 90% of the time and is relocated rather than duplicated.
- Each cleared room adds one Familiar charge, up to eight stored. After finding the Mana Familiar Sigil, the defense action consumes five charge and summons up to three weapon-icon familiars. They orbit 32 pixels from the player, sweep reliably into enemies, and each blocks one hostile hit or hits one enemy. The active orbit caps at 13; summoning at 12 adds one, and summoning at 13 preserves charge. Charge and active guards persist through save/resume.
- Boss phase changes and the boss-room-only Guardian Heart restore at most two hearts, including at expanded maximum health. Guardian Heart still increases the health container when capacity allows. Player-facing item, phase, tutorial, and README text reflects the cap.
- Shockwave is available from the start and consumes its existing blank stock; acquiring the Mana Familiar Sigil replaces it with the five-charge summon action. HUD, touchscreen label, controls, tutorial, and README reflect this progression.
- Charge projectiles retain a substantial damage bonus, and charged magic respects weapon cooldown instead of rapid-firing on taps.
- Elemental menhirs spawn in their own key-locked branch on 75% of maps; otherwise the branch contains an ability reward. A separate guaranteed key cache preserves access to the locked branch. Bomb-cache rooms remain separate rewards.
- Shops include a bomb, a one-point health restore, and one upgrade; a second ability appears sometimes, never a third. The second ability no longer displaces the heart, four-item layouts are centered, and shop dialogue is moved away from item cards.
- The Mana Familiar Sigil is excluded from the two standard ability slots across shops, room rewards, and boss loot.
- Added focused coverage for once-per-room charge grants, the five-charge/eight-storage rule, 12→13 and full-orbit behavior, default Shockwave dispatch, shop stock/purchases, shrine chance, and charged magic damage.
- Preserved the map and elemental-shrine behavior from earlier work. Updated player-facing README and tutorial copy.
- Extracted gamepad state, polling, button mappings, menus and stick handling into `controllermanager.js`, loaded before `game.js`.
- Restored right-stick aim as the player's facing and projectile direction; the left stick only moves, and disconnect returns to touch mode when supported.
- Controller behavior is user-approved and locked: left stick moves only; right stick alone controls aim/facing and firing direction; controller mappings and disconnect behavior must not be changed without explicit user authorization.
- Mouse position controls keyboard/mouse firing direction; controller mode uses only the stored right-stick aim, even while the stick is neutral. Touch mode selects the closest live mob regardless of touch-drag aim.
- Preserved multi-touch movement/attack and touch action buttons; the defense button says Shockwave by default and changes to Mana Guard when the Familiar Sigil is owned.
- Added input tests for right-stick direction, controller disconnect recovery, mouse-facing behavior, and multi-touch flows.
- Input mode changes on keyboard key, controller button/stick activity, or touchscreen press; mouse pointer movement can aim without switching the active input mode until a click. A held controller button does not repeatedly take input mode back after keyboard/touch use.
- Touchscreen controls are no longer enabled automatically solely because the device supports touch. The first touchscreen press activates them, touchscreen input can take over even with a controller connected, and controller disconnect restores the last actually used non-controller mode.
- Touch attacks always target the nearest live enemy; touch-drag direction and movement do not affect aim. With no live enemies, touch shots use a fixed rightward neutral direction.
- Added regression tests for touchscreen mode activation, cursor aim independent of button state, controller right-stick aim independent of other input, and touch nearest-target aim.
- Updated README and tutorial guidance for mode detection, device-specific aim sources, and the mirror puzzle.
- Performance inspection identified repeated `splice` calls while removing expired particles from a capped array (up to 400), which could cause quadratic element shifting. Replaced with stable, single-pass in-place compaction. Existing adaptive quality still handles expensive canvas glow and particle caps.
- Charged bow releases now create a sustained beam with a captured aim direction. It clips at room boundaries and obstacles, damages enemies on its path at a throttled interval, and produces one impact explosion. Fully charged magic produces a larger explosive shot with a substantial damage multiplier and continues to respect weapon cooldowns.
- Charge mode has a 5% chance to appear on an eligible upgrade, can be discovered only once per run, and applies to all selectable weapon styles. Ability offer IDs are tracked per run so generated shops, room rewards, and boss drops avoid repeating abilities; both offer history and linked trial state persist through save/resume.
- Saved playtime and character unlocks can promote capable enemies to advanced boss-style AI on floor one, without adding enemies to a room. Major bosses no longer share the multi-circle pressure pattern; minibosses use one clear pressure marker while major bosses lean on their individual phase attacks.
- A subset of optional trial rooms now links into a randomized second puzzle chamber. The first chamber grants its normal room-clear charge but cannot release the trial reward; completing both chambers is required. Revisiting the first chamber cannot release the final reward early.

## Validation

- `node --test`: 138 tests passed, 0 failed.
- `node --check` passed for every root JavaScript file.
- Particle cleanup microbenchmark: 3,000 arrays of 400 particles, half expired; splice cleanup took 279.5 ms versus 163.7 ms for compaction (~41% faster in this synthetic test including allocation).
- Regression coverage includes controller left-stick movement without facing changes, cursor/right-stick/touch aim source isolation, movement-independent firing direction, room-clear charge-ups, three-guard summon, one-impact guard collisions, swept orbital hits, all trial modes, randomized-state persistence, reward delivery, and the two-heart cap at expanded health.
- Verified the controller lock is backed by dedicated tests for right-stick aim, left-stick movement without facing changes, and controller aim-source isolation.
- Focused balance, health, and magic regressions pass for five-percent charge discovery, no-repeat ability offers, experienced-run AI promotion, obstacle-clipped charge beams, charged-magic output/cooldown, two-room reward gating, and reduced miniboss pressure telegraphs.
- Git commands were unavailable in the current PowerShell environment, so worktree status and `git diff --check` could not be inspected.

## Resume guidance

1. Always read this handoff before resuming.
2. Do not remove the persistent instruction above.
3. There is no pending implementation task; wait for the next user request. If asked to evaluate balance, playtest whether charged shots feel rewarding without trivializing bosses, whether advanced-AI promotions are readable, and whether two-room trials justify their time. Run `node --test` and `node --check` after future code edits.
4. Preserve map-generation, shrine, mirror puzzle save-state and reward, guard charge persistence, and isolated controller, mouse, and touchscreen aim behavior.
