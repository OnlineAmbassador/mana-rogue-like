# Playtest checklist

Play a few runs, then note what you find under each question. There are no wrong answers; "felt fine" is useful too.

Useful to write down with each note: which character you played, which floor, and whether you used keyboard, touch or a gamepad.

## Combat feel

- **Charged attacks.** Hold the attack button to charge a bow or magic shot. Does a charged shot feel worth the wait? Does a fully charged magic shot make bosses too easy?
- **Arrow and spell arcs.** Do shots hit where they appear to land, especially at long range?
- Aim at bat/vampire-bat bodies and Road Captain heads/torsos. Ranged, melee and beam hits should follow their scaled visible bodies rather than the old ground circle; touch targeting should aim at the body. Fast shots crossing those bodies should not skip through between frames. Movement/contact collision stays unchanged.
- **Enemy difficulty.** Are fights fair? Look for enemies that feel too accurate, too fast, or that hit you from out of nowhere.
- **Boss fights.** Do boss warnings give you enough time to react? Is there too much waiting around between attacks, or too little?
- **Weapon swap.** Is the 6-second wait before swapping weapons too long?

## Altar rooms

Some floors have a side room with two altars (shown as **R** on the map). The left one costs a heart for an upgrade. The right one starts a fight and rewards a heart.

- Is the fight a fair price for the heart? Is it too easy or too hard?
- Do altar rooms show up too often, or not often enough?
- Are the two altars and their labels easy to read and tell apart?

## Screen layout

Check on a computer and on a phone if you can.

- Ordinary drops (including bombs and XP) and upgrade icons are reduced to 80% of their enlarged size, without smoothing or antialiasing changes. Their text, shop icons and inventory icons retain their sizes.
- Guardian Heart relic icons and healing-heart drops are a further 25% smaller than other drop icons; HUD hearts remain unchanged.

- Does anything overlap on the screen (hearts, minimap, item pop-ups, touch buttons)?
- Is all the text readable?
- Is the full map easy to use with touch or a gamepad?
- Check larger blue-outlined drops and shop icons against light sand and dark cave floors. Shop pedestal icons are reduced to 87.5% of the enlarged presentation; drop and inventory sizes remain unchanged. All world text, including merchant labels, descriptions and drop names, should match the door labels' bold 10px Arial and dark outline, not blue-outlined text. HUD and menu typography remain separate. Purchased/affordability behavior should remain unchanged.
- The player should retain its previous size, with clothing, hats and weapons aligned. Mobs and companions should be halfway between their old size and the oversized integer-scale experiment; boss health bars and names should stay above their bodies. Collision and pickup reach must remain unchanged.

## Sound

- Do sound effects play, and do they respond to the volume setting?
- Is anything silent, doubled, or noticeably late? Please try Chrome, Firefox and Safari if you can.

## Phone performance and artwork

Test on the actual phone in Chrome; laptop results or CPU throttling do not certify phone performance. Record the model, browser version, orientation, region, and whether the phone is warm or in battery-saver mode.

- Try a fresh load, large rooms, busy boss fights, and a longer run. Note whether stalls occur only on entering a room or continue during combat.
- Rotate between portrait and landscape. Check that artwork, touch controls, warnings and collision positions stay aligned.
- In Tulimshar, check the native 32px castle walls: all four corners should connect to straight coping and side walls, without stretched tiles or repeated windows. No ocean, decorative flags or candles/torches should remain. Dune ground and interior roads stay stationary; subtle sand gusts animate beneath gameplay. Check low quality and reduced motion.
- Confirm the thinner 32px collision border matches the artwork, all open exits work, lock/seal/boss cues remain readable and secret cracks still reveal routes. Other regions and secret rooms retain their earlier 64px border and visuals.
- While artwork is loading or has failed, combat should not advance behind the loading panel. A transient failure retries once; a repeated failure shows the path and **Retry artwork**.
- After restoring the connection and retrying, verify that the real sprites appear and gameplay resumes without held movement or attacks.
- Switch away from the tab and return. The game should not fight or progress while hidden.

## Directional lighting

- In outdoor regions, check that walls, characters, enemies, menhirs and breakables cast shadows down and right, away from upper-left sunlight. Shadows should follow movement and lift attacks without leaving a second centered shadow behind.
- In Candor, Frostia, World Edge and secret rooms, check for diagonal god rays through ceiling crevices. Their direction should match the shadows, and combat warnings and labels should stay readable.
- Cave rays should have irregular, layered edges rather than perfectly straight triangular wedges. Their room-seeded contours remain stable while brightness and dust animate; low quality and reduced motion preserve the organic shape.
- The upper ends of cave rays fade in over their first 18%, hiding the straight starting cap; their lower ends also fade out.
- Open north/west doors and enter differently sized rooms: wall shadows should leave the open passages clear and update immediately.
- Compare low quality and reduced motion: shadows and rays remain, dust is reduced on low quality, and reduced motion freezes ray ambience but not actor-following shadows. Check sustained phone performance in a busy cave as well as outdoors.
- Watch grounded characters through walking, attacks and rolling: transparent tile padding must not leave a gap between feet and shadows. Lifted enemies should keep their shadow on the ground rather than dragging it upward.
- Fire/lightning attacks, luminous enemy orbs, charged magic and beams should brighten nearby ground and actors. Ordinary arrows, acid and webs should not glow. All airborne projectiles should have ground-separated shadows that approach them on landing.
- Acid/slime pools and gas should have only a subtle lower-right depth edge; webs should cast strand-shaped shadows, not solid dark circles. Hazards and combat warnings must remain easy to distinguish.
- Shadows should be smallest under grounded objects and grow as mobs, bombs or shots rise; landing should shrink them again. Check bats and vampire bats (including companions) for only one shadow, with their wing animation unchanged and no baked-in shadow beneath the body.
- Spider mobs and companions should cast their shadow from beneath the abdomen, not the lowest leg pixels; other creatures retain their existing anchors.
- Mouse (ratto) mobs and companions also anchor shadows beneath the abdomen, not their feet; artwork and hitboxes remain unchanged.
- Tree/log obstacles should have one solid lower-right shadow connected beneath the trunk, without light gaps through the root contact.
- The soul menhir should also have a solid lower-right shadow connected at its stone base, wider than the tree shadow to match the broader stone, while retaining its magical aura.

## Reporting

Short notes are enough, for example: "Floor 3, Mage, keyboard: charged magic killed the boss in about 10 seconds, felt too easy."

---

*For developers:* `node tests/helpers/sim.js` prints damage rates and boss kill times from the real game code. Current finding: a fully charged magic shot does about 9 times the damage per second of tapping, and no number has been changed yet. `BALANCE.md` covers the enemy-AI numbers.
