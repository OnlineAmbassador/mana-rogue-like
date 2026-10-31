# Playtest checklist

Play a few runs, then note what you find under each question. There are no wrong answers; "felt fine" is useful too.

Useful to write down with each note: which character you played, which floor, and whether you used keyboard, touch or a gamepad.

## Combat feel

- **Charged attacks.** Hold the attack button to charge a bow or magic shot. Does a charged shot feel worth the wait? Does a fully charged magic shot make bosses too easy?
- **Arrow and spell arcs.** Do shots hit where they appear to land, especially at long range?
- **Enemy difficulty.** Are fights fair? Look for enemies that feel too accurate, too fast, or that hit you from out of nowhere.
- **Boss fights.** Do boss warnings give you enough time to react? Is there too much waiting around between attacks, or too little?
- **Weapon swap.** Is the 6-second wait before swapping weapons too long?
- **Enemies that read your input.** Play with keyboard, touch and a gamepad if you can. Does each feel distinct and fair? Look for touch shots that miss at close range, gamepad enemies that flank or crowd you too much, and the timing of the wide pulse (the circle that tells you to dash). The pause screen can turn Adaptive enemies off for comparison.
- **Weapon styles.** Do enemies respond differently to sword, bow and magic, and does that feel fair?
- **Tougher enemies.** Are enemies that gain boss-style moves early easy to read? Are the two-room trials worth the time?
- **Desert regions.** Do the Tulimshar and Candor walls, paving and sand effects look right?

## Altar rooms

Some floors have a side room with two altars (shown as **R** on the map). The left one costs a heart for an upgrade. The right one starts a fight and rewards a heart.

- Is the fight a fair price for the heart? Is it too easy or too hard?
- Do altar rooms show up too often, or not often enough?
- Are the two altars and their labels easy to read and tell apart?

## Items and shops

The item numbers are in [ITEMS.md](ITEMS.md).

- **Lifestone.** After a boss, is the 18-second regeneration (one heart every 6 seconds) a reward you notice? Is the extra heart container a fair swap for the old Guardian Heart?
- **Selling.** Do Iron Ore and Dark Crystal drop often enough to notice, and too often to ignore? Is selling them at the sell pad clear without being told? Roughly how much zeny did you have per floor?
- **Repair.** Is paying 2z to 4z a point to mend armor worth it, and is the repair pad easy to find and use?
- **Shop room.** Does the stall, banner and counter art read well? Is any text on the item cards cut off, especially with five stalls? Do the pads crowd the bank pads?
- **Prices.** Can you afford what you want? Do hearts and bombs feel fair against upgrades from floor 5 on?
- **Stacked damage.** With several damage curios and a Pearl, do bosses fall too fast? Does the x2.5 curio cap feel right?
- **Charge mods.** Does picking Wind-Up Wraps or Longbow Draw (which switch that style to charge mode) feel good?

## Screen layout

Check on a computer and on a phone if you can.

- Does anything overlap on the screen (hearts, minimap, item pop-ups, touch buttons)?
- Is all the text readable?
- Is the full map easy to use with touch or a gamepad?

## Sound

- Do sound effects play, and do they respond to the volume setting?
- Is anything silent, doubled, or noticeably late? Please try Chrome, Firefox and Safari if you can.

## Reporting

Short notes are enough, for example: "Floor 3, Mage, keyboard: charged magic killed the boss in about 10 seconds, felt too easy."

---

*For developers:* `node tests/helpers/sim.js` prints current damage rates and boss kill times from the real game code. [BALANCE.md](BALANCE.md) covers the enemy-AI numbers.
