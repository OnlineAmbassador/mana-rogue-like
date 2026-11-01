/* Player combat, movement abilities, damage, and hit feedback. */

// The run's element is picked when the run starts and stays locked until an obelisk offers the choice again.
function getActiveAttackElement() {
  return magicElements.has(activeMagicElement) ? activeMagicElement : null;
}

const MAGIC_ELEMENT_NAMES = {
  bubble: 'Water', fire: 'Fire', lightning: 'Lightning', gas: 'Gas', spore: 'Spore', ice: 'Ice', wind: 'Wind', earth: 'Earth',
};
function magicElementName(element) {
  return MAGIC_ELEMENT_NAMES[element] || element;
}

function startingMagicElements(entry) {
  return ['bubble'];
}

// Profile discoveries never bypass an obelisk in a new run.
function availableMagicElements(entry = character) {
  return startingMagicElements(entry);
}

// The last element picked is remembered on the profile and offered first next time.
function preferredMagicElement() {
  const element = branchState().element;
  return magicElements.has(element) ? element : 'bubble';
}

function selectMagicElement(element) {
  if (!magicElements.has(element)) return false;
  activeMagicElement = element;
  branchState().element = element;
  resetChargeState();
  persistBranchState();
  return true;
}

// Obelisks unlock elements for this run; the profile records discoveries, not starting access.
function unlockMagicElement(element) {
  if (!Object.hasOwn(magicElementPalette, element)) {
    showMessage('This obelisk has no valid element.', 3);
    return false;
  }
  const state = branchState();
  state.elements ||= [];
  const added = !magicElements.has(element);
  if (!state.elements.includes(element)) state.elements.push(element);
  magicElements.add(element);
  persistBranchState();
  return added;
}

// ---- Element picker: opens when a run starts and at each obelisk ----
let elementChoices = null;
let elementPickSource = 'start';
let elementFocus = 0;
let elementInputGuardUntil = 0;

function openElementChoice(source) {
  const choices = Object.keys(magicElementPalette).filter((element) => magicElements.has(element));
  if (choices.length < 2 && source === 'start') return false;
  elementChoices = choices;
  elementPickSource = source;
  elementFocus = Math.max(0, choices.indexOf(source === 'start' ? preferredMagicElement() : activeMagicElement));
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  elementInputGuardUntil = performance.now() + 350;
  mode = 'element';
  return true;
}

function chooseElement(index) {
  const element = elementChoices?.[index];
  if (!element || !selectMagicElement(element)) return false;
  const source = elementPickSource;
  elementChoices = null;
  mode = 'playing';
  suppressHeldAttackInput();
  const name = magicElementName(element);
  showMessage(source === 'start'
    ? `${name} magic for this run. An obelisk can change it.`
    : `The obelisk attunes you to ${name}.`, 3);
  addParticles(player.x, player.y, magicElementPalette[element], 20, 160);
  playSound('som:alteration/skillup.ogg', 0.3);
  updateHud();
  if (typeof saveRunState === 'function') saveRunState();
  if (source === 'start') openAbilityChoice();
  return true;
}

// ---- Starting ability: after the element, a run can open with one weapon ability the profile has found ----
const START_ABILITY_IDS = {
  melee: ['mod-windup', 'mod-flurry', 'mod-cinder'],
  bow: ['mod-pierce', 'mod-draw', 'mod-quiver', 'mod-storm-arrows'],
  magic: ['mod-splash', 'mod-chain', 'mod-lingering', 'spore-bloom'],
};
// The random card leans on the run's element: each weapon has one ability that suits it.
const ELEMENT_ABILITY_AFFINITY = {
  bubble: { melee: 'mod-flurry', bow: 'mod-pierce', magic: 'mod-lingering' },
  fire: { melee: 'mod-cinder', bow: 'mod-draw', magic: 'mod-splash' },
  lightning: { melee: 'mod-flurry', bow: 'mod-storm-arrows', magic: 'mod-chain' },
  gas: { melee: 'mod-cinder', bow: 'mod-quiver', magic: 'mod-lingering' },
  spore: { melee: 'mod-flurry', bow: 'mod-pierce', magic: 'spore-bloom' },
  ice: { melee: 'mod-windup', bow: 'mod-pierce', magic: 'mod-splash' },
  wind: { melee: 'mod-flurry', bow: 'mod-quiver', magic: 'mod-chain' },
  earth: { melee: 'mod-windup', bow: 'mod-draw', magic: 'mod-splash' },
};
const BASE_WEAPON_FOR_STYLE = { melee: 'blade', bow: 'bow', magic: 'magic' };
const START_ABILITY_ROWS = 4;
let abilitySlots = null;
let abilityFocus = 0;
let abilityInputGuardUntil = 0;

function startAbilityItem(id) {
  return shopItemCatalog.find((item) => item.id === id) || null;
}

function startAbilityStyle(item) {
  return item?.style || branchesForItem(item?.id)[0]?.style || 'magic';
}

function itemDiscovered(id) {
  return typeof save !== 'undefined' && Boolean(save?.discoveredItemIds?.includes(id));
}

// Unowned and unlocked on this profile; Spore Bloom also unlocks a class, so it must have been found for real first.
function startAbilityEligible(item) {
  return Boolean(item) && !ownedItems.has(item.id) && isUpgradeAvailable(item) &&
    (item.id !== 'spore-bloom' || itemDiscovered(item.id));
}

function randomStartAbilityPool(element = activeMagicElement) {
  const affinity = ELEMENT_ABILITY_AFFINITY[element] || ELEMENT_ABILITY_AFFINITY.bubble;
  const suited = BRANCH_STYLES.map((style) => startAbilityItem(affinity[style])).filter(startAbilityEligible);
  if (suited.length) return suited;
  return BRANCH_STYLES.flatMap((style) => START_ABILITY_IDS[style].map(startAbilityItem)).filter(startAbilityEligible);
}

function randomStartAbility(element = activeMagicElement, random = Math.random) {
  const pool = randomStartAbilityPool(element);
  return pool.length ? pool[Math.floor(random() * pool.length)] : null;
}

// Whether an ability suits the run's element (the random card's pick for that weapon).
function abilitySuitsElement(item, element = activeMagicElement) {
  return ELEMENT_ABILITY_AFFINITY[element]?.[startAbilityStyle(item)] === item?.id;
}

// Three columns (Blade, Bow, Magic) of found abilities, then a Random card and a Skip button on the bottom row.
function startAbilitySlots() {
  const slots = [];
  BRANCH_STYLES.forEach((style, column) => {
    START_ABILITY_IDS[style].map(startAbilityItem)
      .filter((item) => item && itemDiscovered(item.id) && startAbilityEligible(item))
      .forEach((item, row) => slots.push({ kind: 'item', item, style, column, row }));
  });
  if (randomStartAbilityPool().length) slots.push({ kind: 'random', column: 1, row: START_ABILITY_ROWS });
  slots.push({ kind: 'skip', column: 2, row: START_ABILITY_ROWS });
  return slots;
}

function openAbilityChoice() {
  const slots = startAbilitySlots();
  if (!slots.some((slot) => slot.kind !== 'skip')) return false;
  abilitySlots = slots;
  const last = branchState().startAbility;
  const remembered = last ? slots.findIndex((slot) => slot.item?.id === last) : -1;
  abilityFocus = remembered >= 0 ? remembered : Math.max(0, slots.findIndex((slot) => slot.kind !== 'skip'));
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  abilityInputGuardUntil = performance.now() + 350;
  mode = 'ability';
  return true;
}

// Up/down walks a column; left/right moves to the nearest card in the next column that has one.
function moveAbilityFocus(dx, dy = 0) {
  const current = abilitySlots?.[abilityFocus];
  if (!current) return;
  const score = (slot) => {
    if (dy) {
      const rows = (slot.row - current.row) * Math.sign(dy);
      return rows > 0 ? rows * 10 + Math.abs(slot.column - current.column) : Infinity;
    }
    const columns = (slot.column - current.column) * Math.sign(dx);
    return columns > 0 ? columns * 10 + Math.abs(slot.row - current.row) : Infinity;
  };
  let best = -1;
  abilitySlots.forEach((slot, index) => {
    if (score(slot) < (best < 0 ? Infinity : score(abilitySlots[best]))) best = index;
  });
  if (best >= 0) abilityFocus = best;
}

// Lights the ability's own branch on its weapon, replacing the last highlighted one if all three slots are taken.
function highlightStartBranch(item) {
  const style = startAbilityStyle(item);
  const branch = branchesForItem(item.id).find((entry) => entry.style === style);
  if (!branch) return null;
  const loadout = branchState().loadouts[style] ||= [];
  if (loadout.includes(branch.id)) return { branch, replaced: null };
  const replaced = loadout.length >= BRANCH_SLOTS ? branchById(loadout.pop()) : null;
  loadout.push(branch.id);
  persistBranchState();
  return { branch, replaced };
}

// Puts a weapon of the ability's family in the main hand (the old main moves to the off hand) unless one is
// already ready to use. Returns the weapon now held, or null when nothing changed.
function holdStartAbilityWeapon(style) {
  const family = (id) => weaponById(id)?.family;
  if (family(weaponHands.main) === style || (offhandActive() && family(weaponHands.off) === style)) return null;
  const previous = weaponHands.main;
  const id = family(weaponHands.off) === style ? weaponHands.off : BASE_WEAPON_FOR_STYLE[style];
  setWeaponHand('main', id);
  if (weaponHands.off !== previous && previous !== id) setWeaponHand('off', previous);
  return weaponById(id);
}

function grantStartAbility(item, rolled = false) {
  if (!startAbilityEligible(item)) return false;
  const highlight = highlightStartBranch(item);
  if (!grantUpgrade(item, 'start')) return false;
  const held = holdStartAbilityWeapon(startAbilityStyle(item));
  branchState().startAbility = item.id;
  persistBranchState();
  const notes = [];
  if (highlight?.replaced) notes.push(`${highlight.branch.name} replaces ${highlight.replaced.name}.`);
  else if (highlight) notes.push(`${highlight.branch.name} branch on.`);
  if (held) notes.push(`${held.name} in hand.`);
  showMessage(`${rolled ? 'The element chose ' : ''}${item.name} for this run. ${notes.join(' ')}`.trim(), 4);
  return true;
}

function chooseStartAbility(index = abilityFocus) {
  const slot = abilitySlots?.[index];
  if (!slot) return false;
  abilitySlots = null;
  mode = 'playing';
  suppressHeldAttackInput();
  if (slot.kind === 'skip') {
    showMessage('No starting ability. Find them in the descent.', 2.5);
  } else {
    const item = slot.kind === 'random' ? randomStartAbility() : slot.item;
    if (!item || !grantStartAbility(item, slot.kind === 'random')) showMessage('That ability could not be taken.', 2.5);
  }
  updateHud();
  if (startingWeaponPending) {
    openStartingWeaponChoice();
    return true;
  }
  if (typeof saveRunState === 'function') saveRunState();
  return true;
}

const STARTING_WEAPON_STYLES = ['melee', 'bow', 'magic'];
let startingWeaponPending = false;
let startingWeaponFocus = 0;
let startingWeaponGuardUntil = 0;

function openStartingWeaponChoice() {
  startingWeaponPending = true;
  startingWeaponFocus = Math.max(0, STARTING_WEAPON_STYLES.indexOf(activeCombatStyle));
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  resetChargeState();
  startingWeaponGuardUntil = performance.now() + 350;
  mode = 'weapon';
  updateHud();
}

function chooseStartingWeapon(index = startingWeaponFocus) {
  const style = STARTING_WEAPON_STYLES[index];
  if (mode !== 'weapon' || !startingWeaponPending || !style) return false;
  if (!setWeaponHand('main', BASE_WEAPON_FOR_STYLE[style])) return false;
  if (style === 'melee') meleeWeapons.add('sword');
  startingWeaponPending = false;
  resetStyleHeat();
  mode = 'playing';
  suppressHeldAttackInput();
  showMessage(`${weaponById(weaponHands.main).name} ready. Use Build to change your weapons.`, 3);
  updateHud();
  saveRunState();
  return true;
}

function magicColor(projectile) {
  return magicElementPalette[projectile.element] || projectile.color || magicElementPalette.bubble || '#62d9ee';
}

// The run element's colour for weapon effects, or the weapon's own colour when no element is active.
function elementAccent(fallback) {
  return magicElementPalette[getActiveAttackElement()] || fallback;
}

function triggerHitStop(duration, minGap = 0) {
  const now = performance.now();
  if (minGap > 0 && now < hitStopReadyAt) return;
  hitStopTimer = Math.max(hitStopTimer, duration);
  hitStopReadyAt = now + (duration + minGap) * 1000;
}

function fireMode(style = activeCombatStyle) {
  return branchEffects(style).mode || fireModes[style] || 'rapid';
}

function activeWeaponMod(style) {
  return shopItemCatalog.find((item) => item.kind === 'mod' && item.style === style && itemActive(item.id, style)) || null;
}

// Class branches: one tree per weapon. Up to BRANCH_SLOTS branches are highlighted per weapon, and behaviour
// items only work while the held weapon has a highlighted branch that lists them. Tier 1 is free. Every later growth
// (tiers, learned weapons, Dual Grip, Confluence nodes) first needs career XP to reach growthXpRequirement(), which
// climbs with each growth owned; XP is a threshold and never spent. The growth is then paid for by its kind: stats with
// materials carried this run or banked zeny depending on the stat (STAT_COST_RULES), abilities with Life Stones (they
// are lock nodes). Stat items (pearl, feather, lenses...) are in no branch and always work.
const BRANCH_SLOTS = 3;
const GROWTH_MATERIAL_KEYS = ['ironOre', 'darkCrystal', 'lifeStone'];
// Stat price per fx key, scaled by how big the effect is: form stats cost Iron Ore, power stats Dark Crystal, speed
// stats banked zeny. Any other fx key (mode, triple, burn, fireWall, linger) is an ability.
const STAT_COST_RULES = {
  shots: ['ironOre', (value) => 4 * value],
  chain: ['ironOre', (value) => 3 * value],
  pierce: ['ironOre', (value) => 2 * value],
  explode: ['ironOre', (value) => value / 6],
  reach: ['ironOre', (value) => (value - 1) * 30],
  arc: ['ironOre', (value) => value * 10],
  damage: ['darkCrystal', (value) => (value - 1) * 10],
  parryDamage: ['darkCrystal', (value) => (value - 1) * 5],
  rate: ['zeny', (value) => (1 - value) * 500],
  chargeSpeed: ['zeny', (value) => (value - 1) * 200],
  parryWindow: ['zeny', (value) => value * 600],
};
const ABILITY_TIER_COST = { lifeStone: 1 };
const BRANCH_STYLES = ['melee', 'bow', 'magic'];
const BRANCH_STYLE_NAMES = { melee: 'Blade', bow: 'Bow', magic: 'Magic' };
const skillBranches = [
  { id: 'prism', style: 'magic', name: 'Prism', icon: '◇', items: ['prism'], tiers: [
    { fx: { shots: 1 }, text: '+1 shot in a fan' },
    { fx: { shots: 1 }, text: '+1 more shot' },
    { fx: { damage: 1.15 }, text: '+15% damage' }] },
  { id: 'conduit', style: 'magic', name: 'Conduit', icon: 'ϟ', items: ['mod-chain', 'element-lightning', 'wild-magic-core'], tiers: [
    { fx: { chain: 1 }, text: 'Hits arc to 1 more foe' },
    { fx: { chain: 1 }, text: '+1 more arc' },
    { fx: { damage: 1.15 }, text: '+15% damage' }] },
  { id: 'impact', style: 'magic', name: 'Impact', icon: '✸', items: ['mod-splash', 'element-fire'], tiers: [
    { fx: { explode: 40 }, text: 'Shots burst on impact' },
    { fx: { explode: 18 }, text: 'Bigger bursts' },
    { fx: { explode: 18, damage: 1.1 }, text: 'Huge bursts, +10% damage' }] },
  { id: 'miasma', style: 'magic', name: 'Miasma', icon: '☁', items: ['mod-lingering', 'element-gas', 'spore-bloom'], tiers: [
    { fx: { linger: 'short' }, text: 'Shots leave a brief cloud' },
    { fx: { linger: 'long' }, text: 'Clouds linger 5 s' },
    { fx: { damage: 1.12 }, text: '+12% damage' }] },
  { id: 'focus', style: 'magic', name: 'Focus', icon: '◎', items: [], tiers: [
    { fx: { mode: 'charge' }, text: 'Hold to charge a heavy orb' },
    { fx: { chargeSpeed: 1.3 }, text: 'Charge 30% faster' },
    { fx: { damage: 1.2 }, text: '+20% damage' }] },
  { id: 'volley', style: 'bow', name: 'Volley', icon: '⋔', items: ['prism'], tiers: [
    { fx: { triple: true }, text: 'Taps fire 3 arrows' },
    { fx: { rate: 0.9 }, text: 'Fire 10% faster' },
    { fx: { damage: 1.15 }, text: '+15% damage' }] },
  { id: 'piercer', style: 'bow', name: 'Piercer', icon: '➶', items: ['mod-pierce'], tiers: [
    { fx: { pierce: 1 }, text: 'Arrows pass through 1 foe' },
    { fx: { pierce: 2 }, text: '+2 more' },
    { fx: { damage: 1.15 }, text: '+15% damage' }] },
  { id: 'stormstring', style: 'bow', name: 'Stormstring', icon: 'ϟ', items: ['mod-storm-arrows'], tiers: [
    { fx: { chain: 1 }, text: 'Arrows arc to 1 more foe' },
    { fx: { chain: 1 }, text: '+1 more arc' },
    { fx: { damage: 1.1 }, text: '+10% damage' }] },
  { id: 'longdraw', style: 'bow', name: 'Longdraw', icon: '◎', items: ['mod-draw'], tiers: [
    { fx: { mode: 'charge' }, text: 'Hold to draw a piercing beam' },
    { fx: { chargeSpeed: 1.3 }, text: 'Draw 30% faster' },
    { fx: { damage: 1.2 }, text: '+20% damage' }] },
  { id: 'quickdraw', style: 'bow', name: 'Quickdraw', icon: '»', items: ['mod-quiver'], tiers: [
    { fx: { rate: 0.88 }, text: 'Fire 12% faster' },
    { fx: { rate: 0.9 }, text: 'Fire 10% faster again' },
    { fx: { damage: 1.1 }, text: '+10% damage' }] },
  { id: 'cleave', style: 'melee', name: 'Cleave', icon: '⟋', items: [], tiers: [
    { fx: { reach: 1.1 }, text: '+10% reach' },
    { fx: { arc: 0.3 }, text: 'Wider swings' },
    { fx: { damage: 1.15 }, text: '+15% damage' }] },
  { id: 'flurry', style: 'melee', name: 'Flurry', icon: '≋', items: ['mod-flurry'], tiers: [
    { fx: { rate: 0.9 }, text: 'Swing 10% faster' },
    { fx: { rate: 0.9 }, text: 'Swing 10% faster again' },
    { fx: { damage: 1.1 }, text: '+10% damage' }] },
  { id: 'windup', style: 'melee', name: 'Wind-Up', icon: '◎', items: ['mod-windup'], tiers: [
    { fx: { mode: 'charge' }, text: 'Hold to charge a spin' },
    { fx: { chargeSpeed: 1.3 }, text: 'Charge 30% faster' },
    { fx: { damage: 1.2 }, text: '+20% damage' }] },
  { id: 'cinder', style: 'melee', name: 'Cinder', icon: '♨', items: ['mod-cinder'], tiers: [
    { fx: { burn: true }, text: 'Hits set foes burning' },
    { fx: { fireWall: true }, text: 'Swings leave a wall of your element' },
    { fx: { damage: 1.1 }, text: '+10% damage' }] },
  { id: 'riposte', style: 'melee', name: 'Riposte', icon: '⟲', items: [], tiers: [
    { fx: { parryWindow: 0.1 }, text: 'Longer parry window' },
    { fx: { parryDamage: 1.4 }, text: 'Parried shots hit 40% harder' },
    { fx: { damage: 1.1, parryWindow: 0.06 }, text: '+10% damage, even longer parry' }] },
];
const branchSynergies = [
  { id: 'fork-storm', style: 'magic', branches: ['prism', 'conduit'], name: 'Fork Storm', text: 'Split shots arc +1', fx: { chain: 1 } },
  { id: 'firedamp', style: 'magic', branches: ['impact', 'miasma'], name: 'Firedamp', text: 'Bursts grow and leave clouds', fx: { explode: 16, linger: 'short' } },
  { id: 'supernova', style: 'magic', branches: ['focus', 'impact'], name: 'Supernova', text: '+20% damage, +20 burst', fx: { damage: 1.2, explode: 20 } },
  { id: 'thunderhead', style: 'magic', branches: ['conduit', 'focus'], name: 'Thunderhead', text: 'Arcs +1, shots pierce 1', fx: { chain: 1, pierce: 1 } },
  { id: 'skewer-fan', style: 'bow', branches: ['volley', 'piercer'], name: 'Skewer Fan', text: 'Every arrow pierces +2', fx: { pierce: 2 } },
  { id: 'thunder-draw', style: 'bow', branches: ['stormstring', 'longdraw'], name: 'Thunder Draw', text: 'Arrows arc +2', fx: { chain: 2 } },
  { id: 'arrow-rain', style: 'bow', branches: ['volley', 'quickdraw'], name: 'Arrow Rain', text: 'Fire 10% faster', fx: { rate: 0.9 } },
  { id: 'railshot', style: 'bow', branches: ['piercer', 'longdraw'], name: 'Railshot', text: '+15% damage, pierce +1', fx: { damage: 1.15, pierce: 1 } },
  { id: 'ember-dance', style: 'melee', branches: ['flurry', 'cinder'], name: 'Ember Dance', text: 'Element walls, 8% faster', fx: { fireWall: true, rate: 0.92 } },
  { id: 'whirlwind', style: 'melee', branches: ['windup', 'cleave'], name: 'Whirlwind', text: 'Much wider, +10% reach', fx: { arc: 0.5, reach: 1.1 } },
  { id: 'counterflow', style: 'melee', branches: ['riposte', 'flurry'], name: 'Counterflow', text: 'Parry longer, +30% parry hits', fx: { parryWindow: 0.12, parryDamage: 1.3 } },
  { id: 'molten-guard', style: 'melee', branches: ['riposte', 'cinder'], name: 'Molten Guard', text: '+25% parry hits, +10% damage', fx: { parryDamage: 1.25, damage: 1.1 } },
];
const BRANCH_MULTIPLIED_FX = new Set(['damage', 'rate', 'chargeSpeed', 'reach', 'parryDamage']);
const fallbackBranchState = createBranchState();

function createBranchState() {
  return { xp: 0, unlocks: {}, loadouts: { melee: [], bow: [], magic: [] }, element: null, elements: [],
    weapons: createWeaponState(), confluence: [], play: null, startAbility: null };
}

function createWeaponState() {
  return { found: [], learned: [], grip: false, runes: 0, hands: {} };
}

// Lives on the profile save (so the periodic profile save persists it); tests without a save use the fallback.
function branchState() {
  return (typeof save !== 'undefined' && save?.branches) || fallbackBranchState;
}

function branchById(id) {
  return skillBranches.find((branch) => branch.id === id) || null;
}

function branchTier(id) {
  return clamp(Math.floor(branchState().unlocks[id] || 1), 1, 3);
}

function branchLoadout(style) {
  return branchState().loadouts[style] || [];
}

function emptyBranchFx() {
  return {
    mode: null, triple: false, damage: 1, rate: 1, chargeSpeed: 1, pierce: 0, chain: 0, explode: 0, linger: null,
    shots: 0, reach: 1, arc: 0, burn: false, fireWall: false, parryWindow: 0, parryDamage: 1,
  };
}

function mergeBranchFx(target, fx) {
  for (const [key, value] of Object.entries(fx)) {
    if (BRANCH_MULTIPLIED_FX.has(key)) target[key] *= value;
    else if (key === 'linger') target.linger = target.linger === 'long' || value === 'long' ? 'long' : value;
    else if (typeof value === 'number') target[key] += value;
    else target[key] = value || target[key];
  }
}

// Branches that list items stay dormant until one of those items is found this run; item-less branches are
// pure technique and always work once highlighted.
function branchPowered(branch) {
  return branch.items.length === 0 || branch.items.some((id) => ownedItems.has(id));
}

function activeBranchSynergies(style) {
  const loadout = branchLoadout(style);
  return branchSynergies.filter((synergy) => synergy.style === style &&
    synergy.branches.every((id) => loadout.includes(id) && branchPowered(branchById(id))));
}

function branchEffects(style) {
  const fx = emptyBranchFx();
  for (const id of branchLoadout(style)) {
    const branch = branchById(id);
    if (!branch || branch.style !== style || !branchPowered(branch)) continue;
    for (let tier = 0; tier < branchTier(id); tier += 1) mergeBranchFx(fx, branch.tiers[tier].fx);
  }
  for (const synergy of activeBranchSynergies(style)) mergeBranchFx(fx, synergy.fx);
  for (const id of confluenceState()) {
    const node = confluenceNode(id);
    const nodeFx = node?.kind === 'stat' ? CONFLUENCE_STATS[node.stat]?.fx : node?.kind === 'trinity' ? CONFLUENCE_TRINITY.fx : null;
    if (nodeFx) mergeBranchFx(fx, nodeFx);
  }
  return fx;
}

function branchesForItem(id) {
  return skillBranches.filter((branch) => branch.items.includes(id));
}

// Class starting items (a Sporeling's bloom, for example) are part of the class and never need a branch.
function itemActive(id, style = currentAttackStyle()) {
  if (!ownedItems.has(id)) return false;
  const gates = branchesForItem(id);
  if (gates.length === 0 || id === character?.startingAbility) return true;
  return gates.some((branch) => branch.style === style && branchLoadout(style).includes(branch.id));
}

function persistBranchState() {
  if (typeof save !== 'undefined' && save?.branches && typeof persistSave === 'function') persistSave();
}

// A found item lights up its branch if that weapon still has a free slot; otherwise the player decides at a safe room.
function autoHighlightForItem(item) {
  const gates = branchesForItem(item.id);
  if (gates.length === 0) return null;
  const highlighted = gates.find((branch) => branchLoadout(branch.style).includes(branch.id));
  if (highlighted) return { branch: highlighted, active: true };
  const ordered = [...gates].sort((a, b) => Number(b.style === activeCombatStyle) - Number(a.style === activeCombatStyle));
  for (const branch of ordered) {
    const loadout = branchState().loadouts[branch.style] ||= [];
    if (loadout.length >= BRANCH_SLOTS) continue;
    loadout.push(branch.id);
    persistBranchState();
    return { branch, active: true, added: true };
  }
  return { branch: ordered[0], active: false };
}

function toggleBranch(id) {
  const branch = branchById(id);
  if (!branch) return 'missing';
  const loadout = branchState().loadouts[branch.style] ||= [];
  const index = loadout.indexOf(id);
  if (index >= 0) loadout.splice(index, 1);
  else if (loadout.length >= BRANCH_SLOTS) return 'full';
  else loadout.push(id);
  resetChargeState();
  persistBranchState();
  return index >= 0 ? 'off' : 'on';
}

function nextBranchTierCost(id) {
  return branchTierCost(id, branchTier(id) + 1);
}

// Whether a node's fx is an ability (any fx with no stat price): abilities are Life Stone lock nodes.
function isAbilityFx(fx) {
  return Object.keys(fx || {}).some((key) => !STAT_COST_RULES[key]);
}

function statCost(fx) {
  const cost = {};
  for (const [key, value] of Object.entries(fx || {})) {
    const rule = STAT_COST_RULES[key];
    if (!rule) continue;
    const [currency, amount] = rule;
    cost[currency] = (cost[currency] || 0) + amount(value);
  }
  for (const key of Object.keys(cost)) {
    cost[key] = key === 'zeny' ? Math.max(5, Math.round(cost[key] / 5 + 1e-9) * 5) : Math.max(1, Math.round(cost[key] + 1e-9));
  }
  return cost;
}

// What growing `tier` of a branch costs: tier I is free, abilities take a Life Stone, stats their own material.
function branchTierCost(id, tier) {
  const fx = branchById(id)?.tiers[tier - 1]?.fx;
  if (!fx || tier <= 1) return null;
  return isAbilityFx(fx) ? { ...ABILITY_TIER_COST } : statCost(fx);
}

function branchTierIsAbility(id, tier) {
  return isAbilityFx(branchById(id)?.tiers[tier - 1]?.fx);
}

function bankedZenyBalance() {
  return typeof save !== 'undefined' ? save?.bankedZeny || 0 : 0;
}

// 'gate' when career XP is below the next growth's threshold, 'short' when materials or banked zeny run short.
function unlockBranchTier(id) {
  const cost = nextBranchTierCost(id);
  if (!branchById(id) || !cost) return 'maxed';
  const paid = spendBranchCost(cost);
  if (paid !== true) return paid;
  branchState().unlocks[id] = branchTier(id) + 1;
  persistBranchState();
  return 'unlocked';
}

function carriedMaterials() {
  return typeof materials !== 'undefined' ? materials : null;
}

// Every growth owned: grown tiers, learned weapons, Dual Grip and Confluence nodes.
function growthCount() {
  const state = branchState();
  let count = 0;
  for (const id of Object.keys(state.unlocks)) if (branchById(id)) count += branchTier(id) - 1;
  const weapons = weaponState();
  return count + weapons.learned.length + (weapons.grip ? 1 : 0) + confluenceState().length;
}

// A slow career curve: 30 XP for the first growth, about 1,000 by the fifteenth, about 14,000 for the last.
function growthXpRequirement(count = growthCount()) {
  return 30 * (count + 1) + 4 * count * count;
}

function growthBlock(cost) {
  if (branchState().xp < growthXpRequirement()) return 'gate';
  const pouch = carriedMaterials();
  if (GROWTH_MATERIAL_KEYS.some((key) => (cost[key] || 0) > (pouch?.[key] || 0))) return 'short';
  return bankedZenyBalance() < (cost.zeny || 0) ? 'short' : null;
}

function addBranchXp(amount) {
  branchState().xp += amount;
}

// The Confluence: at the highest level the Blade, Bow and Magic maps join into one. Each bridge runs from a tier III
// node on one weapon to a tier III node on the next, through four stat nodes and a fusion in the middle; a unique move
// hangs off each fusion, and the Trinity at the centre needs all three fusions. Like a sphere grid, a node can be grown
// once a node linked to it is owned. Stats work for every weapon; a fusion works while either of its bridge's weapon
// families is in the main hand (any hand once the Trinity is grown); moves always work.
const CONFLUENCE_STATS = {
  might: { name: 'Might', icon: '⚔', short: '+6% DMG', text: '+6% damage with every weapon', fx: { damage: 1.06 }, cost: { darkCrystal: 2 } },
  haste: { name: 'Haste', icon: '»', short: '5% FAST', text: 'Every weapon attacks 5% faster', fx: { rate: 0.95 }, cost: { zeny: 70 } },
  reach: { name: 'Reach', icon: '⟷', short: '+6% RCH', text: '+6% melee reach', fx: { reach: 1.06 }, cost: { ironOre: 5 } },
  tempo: { name: 'Tempo', icon: '◎', short: '+10% CHG', text: 'Charge and draw 10% faster', fx: { chargeSpeed: 1.1 }, cost: { zeny: 60 } },
  vigor: { name: 'Vigor', icon: '♥', short: '+1 HEART', text: '+1 heart container every run', cost: { darkCrystal: 3 } },
  fortune: { name: 'Fortune', icon: '✤', short: '+1 LUCK', text: '+1 luck every run: more drops', cost: { zeny: 90 } },
  stride: { name: 'Stride', icon: '➠', short: '+4% MOVE', text: 'Walk 4% faster', cost: { ironOre: 4 } },
};
const CONFLUENCE_BRIDGES = [
  { id: 'edge-string', styles: ['melee', 'bow'], ends: ['cleave', 'stormstring'], color: '#e8b46a',
    stats: ['might', 'stride', 'vigor', 'reach'],
    fusion: { id: 'riposte-volley', name: 'Riposte Volley', icon: '⟲', text: 'Every shot you parry also looses three arrows at the nearest foes.' },
    move: { id: 'weapon-form', name: 'Weapon Form', icon: '⇶', text: 'Your dash turns you into your main weapon: every foe on the path takes a hit.' } },
  { id: 'string-spell', styles: ['bow', 'magic'], ends: ['quickdraw', 'focus'], color: '#8fd6c8',
    stats: ['haste', 'fortune', 'vigor', 'tempo'],
    fusion: { id: 'spellstring', name: 'Spellstring', icon: '➹', text: 'Arrows burst in your element where they land.' },
    move: { id: 'elemental-call', name: 'Elemental Call', icon: '✺', text: 'In every fight, two creatures of your element answer your call and fight beside you.' } },
  { id: 'spell-edge', styles: ['magic', 'melee'], ends: ['impact', 'windup'], color: '#d08ae0',
    stats: ['tempo', 'might', 'vigor', 'haste'],
    fusion: { id: 'spellblade', name: 'Spellblade', icon: 'ϟ', text: 'Charged swings release a wave of your element.' },
    move: { id: 'earthshaker', name: 'Earthshaker', icon: '⛰', text: 'Dash while holding attack to leap and smash the ground: a shockwave that stuns and throws foes back.' } },
];
const CONFLUENCE_TRINITY = { name: 'Trinity', icon: '❂', fx: { damage: 1.25, rate: 0.9 },
  text: '+25% damage, 10% faster attacks, and every fusion works whatever you hold.' };
// Stats carry their own price (CONFLUENCE_STATS). Seals, fusions, moves and the Trinity are Life Stone lock nodes: a
// Bridge Seal sits at each end of every bridge, so the way off a weapon map is unlocked with a Life Stone.
const CONFLUENCE_COSTS = {
  seal: { lifeStone: 1 },
  fusion: { lifeStone: 2 },
  move: { lifeStone: 2 },
  trinity: { lifeStone: 3 },
};
const CONFLUENCE_SEAL = { name: 'Bridge Seal', icon: '⛓', text: 'A lock between a weapon map and its bridge. Unseal it with a Life Stone to grow on toward the Confluence.' };
const EARTHSHAKER_COOLDOWN = 7;
let confluenceNodeCache = null;

function confluenceState() {
  const state = branchState();
  state.confluence ||= [];
  return state.confluence;
}

// Logic nodes; `links` name the nodes a node can grow from ('tier:<branch>' is that branch's tier III).
function confluenceNodes() {
  if (confluenceNodeCache) return confluenceNodeCache;
  const nodes = [];
  for (const bridge of CONFLUENCE_BRIDGES) {
    const part = (name) => `cf:${bridge.id}:${name}`;
    const chain = [`tier:${bridge.ends[0]}`, part('g1'), part('s1'), part('s2'), part('fusion'), part('s3'), part('s4'), part('g2'),
      `tier:${bridge.ends[1]}`];
    const linksAt = (index) => [chain[index - 1], chain[index + 1]];
    nodes.push({ id: part('g1'), kind: 'seal', bridge, cost: CONFLUENCE_COSTS.seal, links: linksAt(1) });
    bridge.stats.forEach((stat, index) => {
      const chainIndex = index < 2 ? index + 2 : index + 3;
      nodes.push({ id: part(`s${index + 1}`), kind: 'stat', bridge, stat, cost: CONFLUENCE_STATS[stat].cost, links: linksAt(chainIndex) });
    });
    nodes.push({ id: part('g2'), kind: 'seal', bridge, cost: CONFLUENCE_COSTS.seal, links: linksAt(7) });
    nodes.push({ id: part('fusion'), kind: 'fusion', bridge, fusion: bridge.fusion, cost: CONFLUENCE_COSTS.fusion,
      links: [...linksAt(4), part('move')] });
    nodes.push({ id: part('move'), kind: 'move', bridge, move: bridge.move, cost: CONFLUENCE_COSTS.move, links: [part('fusion')] });
  }
  nodes.push({ id: 'cf:trinity', kind: 'trinity', cost: CONFLUENCE_COSTS.trinity,
    links: CONFLUENCE_BRIDGES.map((bridge) => `cf:${bridge.id}:fusion`) });
  confluenceNodeCache = nodes;
  return nodes;
}

function confluenceNode(id) {
  return confluenceNodes().find((node) => node.id === id) || null;
}

function confluenceOwned(id) {
  if (id.startsWith('tier:')) return branchById(id.slice(5)) ? branchTier(id.slice(5)) >= 3 : false;
  return confluenceState().includes(id);
}

// The Trinity needs every fusion; any other node needs one owned neighbour.
function confluenceReachable(node, owned = confluenceOwned) {
  if (node.kind === 'trinity') return node.links.every(owned);
  return node.links.some(owned);
}

function growConfluenceNode(id) {
  const node = confluenceNode(id);
  if (!node) return 'missing';
  if (confluenceOwned(id)) return 'known';
  if (!confluenceReachable(node)) return 'locked';
  const paid = spendBranchCost(node.cost);
  if (paid !== true) return paid;
  confluenceState().push(id);
  applyConfluenceRunBonus(node, 1);
  persistBranchState();
  return 'grown';
}

// Vigor and Fortune are applied when a run begins, and straight away when grown or unwoven mid-run.
function applyConfluenceRunBonus(node, sign) {
  if (node.kind !== 'stat' || typeof player === 'undefined' || !player) return;
  if (node.stat === 'vigor') {
    player.maxHp = Math.max(1, player.maxHp + sign);
    player.hp = clamp(player.hp + sign, Math.min(player.hp, 0.5), player.maxHp);
  } else if (node.stat === 'fortune') {
    player.luck = (player.luck || 0) + sign;
  }
}

function confluenceStatCount(stat) {
  return confluenceState().filter((id) => confluenceNode(id)?.stat === stat).length;
}

function confluenceSpeedMultiplier() {
  return Math.pow(1.04, confluenceStatCount('stride'));
}

// Whether every owned node would still reach a tier III root without `removedId`, or with one branch's tier lowered.
function confluenceConnectedWithout(removedId, tierOverride = null) {
  const owned = confluenceState().filter((id) => id !== removedId && confluenceNode(id));
  const reached = new Set();
  const linkOwned = (id) => {
    if (!id.startsWith('tier:')) return reached.has(id);
    const branchId = id.slice(5);
    return (tierOverride?.id === branchId ? tierOverride.tier : branchTier(branchId)) >= 3;
  };
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of owned) {
      if (reached.has(id) || !confluenceReachable(confluenceNode(id), linkOwned)) continue;
      reached.add(id);
      grew = true;
    }
  }
  return reached.size === owned.length;
}

function confluenceFusionActive(fusionId) {
  const bridge = CONFLUENCE_BRIDGES.find((entry) => entry.fusion.id === fusionId);
  if (!bridge || !confluenceOwned(`cf:${bridge.id}:fusion`)) return false;
  if (confluenceOwned('cf:trinity')) return true;
  return bridge.styles.includes(weaponById(weaponHands.main)?.family);
}

function confluenceMoveOwned(moveId) {
  const bridge = CONFLUENCE_BRIDGES.find((entry) => entry.move.id === moveId);
  return Boolean(bridge && confluenceOwned(`cf:${bridge.id}:move`));
}

// Play style: how much each weapon family is used and whether its attacks are held (charged) or tapped. Halved
// once it grows large, so recent runs count most. Drives the suggested path on the branch maps.
const PLAYSTYLE_HALVE_AT = 4000;
const CHARGE_BRANCHES = new Set(skillBranches.filter((branch) => branch.tiers[0].fx.mode === 'charge').map((branch) => branch.id));
const TEMPO_BRANCHES = new Set(skillBranches.filter((branch) => branch.tiers.some((tier) => tier.fx.rate < 1)).map((branch) => branch.id));

function createPlayState() {
  return Object.fromEntries(BRANCH_STYLES.map((style) => [style, { use: 0, charge: 0, tap: 0 }]));
}

function playState() {
  const state = branchState();
  state.play ||= createPlayState();
  for (const style of BRANCH_STYLES) state.play[style] ||= { use: 0, charge: 0, tap: 0 };
  return state.play;
}

function recordPlaystyle(style, charged) {
  if (!BRANCH_STYLES.includes(style)) return;
  const play = playState();
  play[style].use += 1;
  play[style][charged ? 'charge' : 'tap'] += 1;
  if (BRANCH_STYLES.reduce((sum, key) => sum + play[key].use, 0) > PLAYSTYLE_HALVE_AT) {
    for (const key of BRANCH_STYLES) for (const field of ['use', 'charge', 'tap']) play[key][field] = Math.floor(play[key][field] / 2);
  }
}

// Share of attacks made with a family (an even third before any are recorded).
function playstyleShare(style) {
  const play = playState();
  const total = BRANCH_STYLES.reduce((sum, key) => sum + play[key].use, 0);
  return total > 0 ? play[style].use / total : 1 / 3;
}

// Fraction of a family's attacks that were charged; null until there are enough to judge.
function playstyleChargeRatio(style) {
  const { charge, tap } = playState()[style];
  return charge + tap >= 12 ? charge / (charge + tap) : null;
}

function playstyleLeader() {
  return BRANCH_STYLES.reduce((best, style) => (playstyleShare(style) > playstyleShare(best) ? style : best), BRANCH_STYLES[0]);
}

// Why a branch fits: the strongest reason wins the label. `tiers` holds what-if tiers while planning a path.
function scoreBranchStep(branch, tiers) {
  const tierOf = (id) => tiers[id] || branchTier(id);
  const loadout = branchLoadout(branch.style);
  const reasons = [];
  const add = (points, text) => reasons.push({ points, text });
  if (loadout.includes(branch.id)) add(3, 'You have it highlighted');
  if (tierOf(branch.id) > 1) add((tierOf(branch.id) - 1) * 1.5, 'Builds on what you have grown');
  if (branch.items.length && branchPowered(branch)) add(2.5, `Your ${branchItemLabel(branch)} powers it`);
  else if (branch.items.length) add(-1, '');
  for (const synergy of branchSynergies.filter((entry) => entry.branches.includes(branch.id))) {
    const partner = synergy.branches.find((id) => id !== branch.id);
    if (loadout.includes(partner) || tierOf(partner) > 1) add(1.5, `Pairs with ${branchById(partner)?.name} for ${synergy.name}`);
  }
  const ratio = playstyleChargeRatio(branch.style);
  if (ratio !== null && CHARGE_BRANCHES.has(branch.id)) add(4 * ratio - 1, 'You hold to charge a lot');
  if (ratio !== null && TEMPO_BRANCHES.has(branch.id)) add(3.5 * (1 - ratio) - 0.5, 'You tap attacks quickly');
  if (CONFLUENCE_BRIDGES.some((bridge) => bridge.ends.includes(branch.id))) {
    add(playstyleShare(branch.style) * 1.5, 'Leads toward a Confluence bridge');
  }
  const best = reasons.filter((entry) => entry.text).sort((a, b) => b.points - a.points)[0];
  return { score: reasons.reduce((sum, entry) => sum + entry.points, 0) - tierOf(branch.id) * 0.2,
    reason: best && best.points > 0 ? best.text : 'A solid next step' };
}

function branchItemLabel(branch) {
  const names = branch.items.filter((id) => ownedItems.has(id)).map((id) => itemDisplayName(id));
  return names[0] || 'item';
}

function itemDisplayName(id) {
  if (typeof shopItemCatalog !== 'undefined') {
    const item = shopItemCatalog.find((entry) => entry.id === id);
    if (item?.name) return item.name;
  }
  return id.replace(/^(mod|element)-/, '').replace(/-/g, ' ');
}

function scoreConfluenceStep(node) {
  const styles = node.bridge ? node.bridge.styles : BRANCH_STYLES;
  const fit = styles.reduce((sum, style) => sum + playstyleShare(style), 0);
  const kind = { stat: 0, seal: 0.2, fusion: 2, move: 1.5, trinity: 6 }[node.kind] || 0;
  const vigor = node.stat === 'vigor' ? 0.5 : 0;
  const names = styles.map((style) => BRANCH_STYLE_NAMES[style]).join(' and ');
  const reason = node.kind === 'trinity' ? 'Wakes every fusion' : node.kind === 'seal' ? `Unseals the ${names} bridge`
    : fit >= 0.75 ? `Bridges ${names}, the weapons you use most`
    : node.kind === 'fusion' ? 'Opens a fusion' : node.kind === 'move' ? 'Gives a new move' : `Bridges ${names}`;
  return { score: fit * 4 + kind + vigor, reason };
}

// The next few growths that suit how you play, planned one after another. Each step is
// { mapId, kind: 'tier'|'confluence', id, tier?, reason }; on the Confluence tab tier steps lead to a bridge end.
// Only a suggestion: any other reachable node can be grown instead.
function suggestedPath(tab, steps = 3) {
  const tiers = {};
  const owned = new Set(confluenceState());
  const path = [];
  const tierOf = (id) => tiers[id] || branchTier(id);
  for (let step = 0; step < steps; step += 1) {
    let best = null;
    const consider = (entry, scored) => {
      if (!best || scored.score > best.score) best = { ...entry, ...scored };
    };
    if (tab === 'confluence') {
      const ownedAt = (id) => (id.startsWith('tier:') ? tierOf(id.slice(5)) >= 3 : owned.has(id));
      for (const node of confluenceNodes()) {
        if (owned.has(node.id) || !confluenceReachable(node, ownedAt)) continue;
        consider({ mapId: node.id, kind: 'confluence', id: node.id }, scoreConfluenceStep(node));
      }
      if (!best) {
        // No bridge open yet: lead up the end branch of the bridge that best fits your weapons.
        for (const bridge of CONFLUENCE_BRIDGES) {
          const fit = bridge.styles.reduce((sum, style) => sum + playstyleShare(style), 0);
          for (const id of bridge.ends) {
            const branch = branchById(id);
            if (tierOf(id) >= 3) continue;
            consider({ mapId: `${branch.style}/${id}:${tierOf(id) + 1}`, kind: 'tier', id, tier: tierOf(id) + 1 },
              { score: fit * 4 + tierOf(id), reason: `Opens the ${bridge.styles.map((style) => BRANCH_STYLE_NAMES[style]).join(' + ')} bridge` });
          }
        }
      }
    } else {
      for (const branch of skillBranches.filter((entry) => entry.style === tab)) {
        if (tierOf(branch.id) >= 3) continue;
        consider({ mapId: `${branch.id}:${tierOf(branch.id) + 1}`, kind: 'tier', id: branch.id, tier: tierOf(branch.id) + 1 },
          scoreBranchStep(branch, tiers));
      }
    }
    if (!best) break;
    if (best.kind === 'tier') tiers[best.id] = best.tier;
    else owned.add(best.id);
    delete best.score;
    path.push(best);
  }
  return path;
}

// Learnable weapons. Each belongs to a family (the melee, bow or magic engine and its branch map) and reshapes
// that engine through `fx`; the family's highlighted branches still apply. Blade, Bow and Magic are always known.
// Others drop in runs, then are learned on their family's map like any other growth.
const WEAPON_LEARN_COST = { lifeStone: 1 };
const DUAL_GRIP_COST = { lifeStone: 2 };
// The off hand attacks on its own, Diablo-style: only at a foe within OFFHAND_CONE of where you are looking.
const OFFHAND_CONE = Math.PI / 6;
const OFFHAND_DAMAGE_SCALE = 0.6;
const OFFHAND_RATE_SCALE = 1.35;
const OFFHAND_RANGED_RANGE = 380;
const weaponCatalog = [
  { id: 'blade', family: 'melee', name: 'Blade', icon: '⚔', base: true, text: 'Your fists and any blade you find.' },
  { id: 'bow', family: 'bow', name: 'Bow', icon: '➶', base: true, text: 'Tap for arrows; Longdraw holds for a beam.' },
  { id: 'magic', family: 'magic', name: 'Magic', icon: '✦', base: true, text: 'Shots of your chosen element.' },
  { id: 'axe', family: 'melee', name: 'Axe', icon: '🪓', text: 'Slow, wide chops that knock foes back.',
    fx: { damage: 1.35, rate: 1.3, arc: 0.35, knockback: 1.8 } },
  { id: 'halberd', family: 'melee', name: 'Halberd', icon: '⍿', text: 'A long, narrow thrust.',
    fx: { damage: 1.15, rate: 1.1, reach: 1.45, arc: -0.45 } },
  { id: 'scythe', family: 'melee', name: 'Scythe', icon: '☾', text: 'A huge, slow sweep.',
    fx: { damage: 1.2, rate: 1.45, reach: 1.2, arc: 0.95 } },
  { id: 'kanabo', family: 'melee', name: 'Kanabo', icon: '▮', text: 'Slow crushing blows that stun.',
    fx: { damage: 1.5, rate: 1.55, reach: 0.95, stun: 0.6 } },
  { id: 'whip', family: 'melee', name: 'Whip', icon: '∿', text: 'Fast, very long and thin; lighter hits.',
    fx: { damage: 0.75, rate: 0.75, reach: 1.7, arc: -0.55 } },
  { id: 'kunai', family: 'bow', name: 'Kunai', icon: '✧', text: 'Fast thrown blades with a short range.',
    fx: { damage: 0.8, rate: 0.7, speed: 1.25, range: 0.6 } },
  { id: 'scepter', family: 'magic', name: 'Scepter', icon: '⚚', text: 'Slower, bigger orbs that curve toward foes.',
    fx: { damage: 1.35, rate: 1.3, size: 1.35, speed: 0.85, homing: 2.2 } },
];
let weaponHands = { main: 'magic', off: 'blade' };
// Set only while the off hand attacks, so the shared attack code aims and shapes for that weapon.
let offhandContext = null;

function weaponById(id) {
  return weaponCatalog.find((entry) => entry.id === id) || null;
}

function weaponState() {
  const state = branchState();
  state.weapons ||= createWeaponState();
  return state.weapons;
}

function weaponFound(id) {
  const entry = weaponById(id);
  return Boolean(entry && (entry.base || weaponState().found.includes(id)));
}

function weaponLearned(id) {
  const entry = weaponById(id);
  return Boolean(entry && (entry.base || weaponState().learned.includes(id)));
}

function dualGripOwned() {
  return Boolean(weaponState().grip);
}

function heldWeaponId() {
  return offhandContext ? weaponHands.off : weaponHands.main;
}

function weaponHandOf(id) {
  return weaponHands.main === id ? 'main' : weaponHands.off === id ? 'off' : null;
}

// Any weapon can be held at any time; one you have not found yet hits weaker, a found one a little less so, and
// learning it on its map brings it to full power.
const WEAPON_PROFICIENCY = { unfound: 0.7, found: 0.85, learned: 1 };

function weaponProficiencyRank(id) {
  return weaponLearned(id) ? 'learned' : weaponFound(id) ? 'found' : 'unfound';
}

function weaponProficiency(id) {
  return weaponById(id) ? WEAPON_PROFICIENCY[weaponProficiencyRank(id)] : 1;
}

// The held weapon's shape for one family; a family it does not belong to keeps its plain base shape.
function weaponShape(style) {
  const held = weaponById(heldWeaponId());
  const fx = held?.family === style ? held.fx || {} : {};
  const shape = { damage: 1, rate: 1, reach: 1, arc: 0, knockback: 0, stun: 0, speed: 1, range: 1, size: 1, homing: 0, ...fx };
  if (held?.family === style) shape.damage *= weaponProficiency(held.id);
  if (offhandContext) {
    shape.damage *= OFFHAND_DAMAGE_SCALE;
    shape.rate *= OFFHAND_RATE_SCALE;
  }
  shape.variant = held?.family === style && !held.base ? held.id : null;
  return shape;
}

function defaultWeaponHands(entry = character) {
  const main = weaponCatalog.find((item) => item.base && item.family === (entry?.startingStyle || 'magic'))?.id || 'magic';
  return { main, off: main === 'blade' ? 'bow' : 'blade' };
}

// Hands are remembered per class, so each class keeps its own pair.
function savedWeaponHands(entry = character) {
  const fallback = defaultWeaponHands(entry);
  const stored = weaponState().hands[entry?.className] || {};
  const main = weaponById(stored.main) ? stored.main : fallback.main;
  let off = weaponById(stored.off) && stored.off !== main ? stored.off : fallback.off;
  if (off === main) off = main === 'blade' ? 'bow' : 'blade';
  return { main, off };
}

function applyWeaponHands(hands) {
  weaponHands = { main: hands.main, off: hands.off };
  activeCombatStyle = weaponById(hands.main)?.family || activeCombatStyle;
  resetChargeState();
  if (player) player.offhand = { cooldown: 0, charge: 0 };
}

// Setting a weapon into the hand the other one holds swaps them.
function setWeaponHand(slot, id) {
  if (!['main', 'off'].includes(slot) || !weaponById(id)) return false;
  const other = slot === 'main' ? 'off' : 'main';
  const next = { ...weaponHands };
  if (next[other] === id) next[other] = next[slot];
  next[slot] = id;
  applyWeaponHands(next);
  if (character?.className) weaponState().hands[character.className] = { ...weaponHands };
  persistBranchState();
  if (typeof updateHud === 'function') updateHud();
  return true;
}

function findWeapon(id) {
  const entry = weaponById(id);
  if (!entry || entry.base || weaponState().found.includes(id)) return false;
  weaponState().found.push(id);
  persistBranchState();
  return true;
}

function weaponDropPool() {
  return weaponCatalog.filter((entry) => !entry.base && !weaponState().found.includes(entry.id));
}

function canAfford(cost) {
  return !growthBlock(cost);
}

// Takes the carried materials and banked zeny together, or nothing; returns true, 'gate' or 'short'.
function spendBranchCost(cost) {
  const block = growthBlock(cost);
  if (block) return block;
  if (cost.zeny) {
    if (typeof persistBankedZeny !== 'function' || !persistBankedZeny(bankedZenyBalance() - cost.zeny)) return 'short';
  }
  const pouch = carriedMaterials();
  for (const key of GROWTH_MATERIAL_KEYS) if (cost[key]) pouch[key] -= cost[key];
  return true;
}

// The branch screen only opens mid-run, so refunded materials go back into the carried pouch.
function refundBranchCost(cost) {
  const pouch = carriedMaterials();
  if (pouch) for (const key of GROWTH_MATERIAL_KEYS) if (cost[key]) pouch[key] = (pouch[key] || 0) + cost[key];
  if (cost.zeny && typeof persistBankedZeny === 'function') persistBankedZeny(bankedZenyBalance() + cost.zeny);
}

function learnWeapon(id) {
  if (!weaponFound(id)) return 'unknown';
  if (weaponLearned(id)) return 'known';
  const paid = spendBranchCost(WEAPON_LEARN_COST);
  if (paid !== true) return paid;
  weaponState().learned.push(id);
  persistBranchState();
  return 'learned';
}

function growDualGrip() {
  if (dualGripOwned()) return 'known';
  const paid = spendBranchCost(DUAL_GRIP_COST);
  if (paid !== true) return paid;
  weaponState().grip = true;
  if (player) player.offhand = { cooldown: 0, charge: 0 };
  persistBranchState();
  return 'learned';
}

function addUnweavingRune() {
  weaponState().runes = Math.min(99, (weaponState().runes || 0) + 1);
  persistBranchState();
}

// What an Unweaving Rune would undo on a map node: the newest grown tier, a learned weapon, Dual Grip or a Confluence
// node. A node something else still grows from is `blocked` until that is unwoven first.
function unweaveTarget(kind, id) {
  if (kind === 'tier') {
    if (!branchById(id) || branchTier(id) < 2) return null;
    const tier = branchTier(id);
    if (tier === 3 && !confluenceConnectedWithout(null, { id, tier: 2 })) return { blocked: true };
    return { cost: branchTierCost(id, tier) };
  }
  if (kind === 'weapon') return !weaponById(id)?.base && weaponLearned(id) ? { cost: WEAPON_LEARN_COST } : null;
  if (kind === 'grip') return dualGripOwned() ? { cost: DUAL_GRIP_COST } : null;
  if (kind === 'confluence') {
    const node = confluenceNode(id);
    if (!node || !confluenceOwned(id)) return null;
    return confluenceConnectedWithout(id) ? { cost: node.cost } : { blocked: true };
  }
  return null;
}

// Spends one rune to undo a node and refunds what it cost, so a build can be respecced.
function unweaveNode(kind, id) {
  const target = unweaveTarget(kind, id);
  if (!target) return 'nothing';
  if (target.blocked) return 'blocked';
  const state = weaponState();
  if (!(state.runes > 0)) return 'no-rune';
  state.runes -= 1;
  if (kind === 'confluence') {
    branchState().confluence = confluenceState().filter((entry) => entry !== id);
    applyConfluenceRunBonus(confluenceNode(id), -1);
  } else if (kind === 'tier') {
    const tier = branchTier(id) - 1;
    if (tier <= 1) delete branchState().unlocks[id];
    else branchState().unlocks[id] = tier;
  } else if (kind === 'weapon') {
    // It stays in hand, just back at found strength.
    state.learned = state.learned.filter((entry) => entry !== id);
  } else if (kind === 'grip') {
    state.grip = false;
  }
  refundBranchCost(target.cost);
  persistBranchState();
  return 'done';
}

function offhandActive() {
  const off = weaponHands.off;
  return dualGripOwned() && Boolean(weaponById(off)) && off !== weaponHands.main;
}

function offhandRange(style) {
  if (style !== 'melee') return OFFHAND_RANGED_RANGE * weaponShape(style).range;
  return 92 * weaponShape('melee').reach * branchEffects('melee').reach + 12;
}

// The foe nearest to where the player is looking, inside the cone and range; null when the player looks away.
function offhandTargetAngle(range) {
  const look = Math.atan2(player.lookY || 0, player.lookX || 1);
  const originY = attackOriginY();
  let best = null;
  let bestScore = Infinity;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0) || enemy.manaRift) continue;
    const target = enemyAttackTarget(enemy);
    const dx = target.x - player.x;
    const dy = target.y - originY;
    const distance = Math.hypot(dx, dy);
    if (distance > range + (target.radius || 0)) continue;
    const angle = Math.atan2(dy, dx);
    const offset = Math.abs(Math.atan2(Math.sin(angle - look), Math.cos(angle - look)));
    if (offset > OFFHAND_CONE || !hasLineOfSight(player, enemy)) continue;
    const score = distance + offset * 240;
    if (score < bestScore) {
      best = angle;
      bestScore = score;
    }
  }
  return best;
}

function offhandChargeTime(style) {
  if (style === 'melee') return meleeChargeTime();
  if (style === 'bow') return BOW_TAP_WINDOW + bowChargeTime();
  return 0.9 / branchEffects('magic').chargeSpeed;
}

// Runs one off-hand attack through the main attack code, then restores everything the main hand owns.
function performOffhandAttack(angle, action) {
  const family = weaponById(weaponHands.off).family;
  const saved = {
    style: activeCombatStyle, cooldown: player.fireCooldown, lookX: player.lookX, lookY: player.lookY,
    spin: player.spin, pulse: player.attackPulse, animStyle: player.attackAnimationStyle, animTimer: player.attackAnimationTimer,
    swapCooldown: weaponSwapCooldown,
    meleeCharge: player.meleeCharge, bowHold: player.bowHold, magicHold: player.magicHold, chargeFraction: player.chargeFraction,
  };
  offhandContext = { angle };
  activeCombatStyle = family;
  player.fireCooldown = 0;
  try {
    action(family);
    player.offhand.cooldown = player.fireCooldown;
  } finally {
    offhandContext = null;
    activeCombatStyle = saved.style;
    player.fireCooldown = saved.cooldown;
    player.lookX = saved.lookX;
    player.lookY = saved.lookY;
    player.spin = saved.spin;
    player.attackPulse = saved.pulse;
    player.attackAnimationStyle = saved.animStyle;
    player.attackAnimationTimer = saved.animTimer;
    weaponSwapCooldown = saved.swapCooldown;
    player.meleeCharge = saved.meleeCharge;
    player.bowHold = saved.bowHold;
    player.magicHold = saved.magicHold;
    player.chargeFraction = saved.chargeFraction;
  }
}

// The off hand follows its own family tree: with that family's charge branch highlighted it charges while a foe
// stays in the cone and releases a charged attack; otherwise it taps at its own, slower rate.
function updateOffhand(dt, control = true) {
  const state = player.offhand ||= { cooldown: 0, charge: 0 };
  state.cooldown = Math.max(0, state.cooldown - dt * (typeof curioMultiplier === 'function' ? curioMultiplier('fire') : 1));
  if (!control || mode !== 'playing' || !offhandActive()) {
    state.charge = 0;
    return;
  }
  const family = weaponById(weaponHands.off).family;
  offhandContext = { angle: 0 };
  const range = offhandRange(family);
  offhandContext = null;
  const angle = offhandTargetAngle(range);
  const charges = fireMode(family) === 'charge';
  if (angle === null) {
    state.charge = Math.max(0, state.charge - dt * 2);
    return;
  }
  if (charges) {
    if (state.cooldown > 0) return;
    state.charge += dt;
    const needed = offhandChargeTime(family);
    if (state.charge < needed) return;
    state.charge = 0;
    performOffhandAttack(angle, (style) => {
      if (style === 'melee') performMeleeAttack(true);
      else if (style === 'bow') shoot({ charge: 1 });
      else shoot({ magicCharge: 1 });
    });
    return;
  }
  if (state.cooldown > 0) return;
  performOffhandAttack(angle, (style) => {
    if (style === 'melee') performMeleeAttack(false);
    else if (style === 'bow') shoot({ quick: true });
    else shoot();
  });
}

// Axe hits shove foes further; Kanabo hits stun them (bosses shrug it off, minibosses for half as long).
function applyWeaponImpact(enemy, shape, angle) {
  if (enemy.boss) return;
  if (shape.knockback > 0) {
    const push = 10 * shape.knockback * (enemy.miniBoss ? 0.5 : 1);
    moveEnemy(enemy, Math.cos(angle) * push / 0.06, Math.sin(angle) * push / 0.06, 0.06);
  }
  if (shape.stun > 0) enemy.stunTimer = Math.max(enemy.stunTimer || 0, shape.stun * (enemy.miniBoss ? 0.5 : 1));
}

// Scepter orbs turn gently toward the nearest foe ahead of them.
function steerHomingProjectile(projectile, dt) {
  const speed = Math.hypot(projectile.vx, projectile.vy);
  if (!speed) return;
  const heading = Math.atan2(projectile.vy, projectile.vx);
  let best = null;
  let bestDistance = 320;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0) || enemy.manaRift) continue;
    const distance = Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y);
    const angle = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
    if (distance < bestDistance && Math.abs(Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading))) < Math.PI / 2) {
      best = angle;
      bestDistance = distance;
    }
  }
  if (best === null) return;
  const turn = clamp(Math.atan2(Math.sin(best - heading), Math.cos(best - heading)), -projectile.homing * dt, projectile.homing * dt);
  projectile.vx = Math.cos(heading + turn) * speed;
  projectile.vy = Math.sin(heading + turn) * speed;
}

function resetChargeState() {
  player.meleeCharge = 0;
  player.bowHold = 0;
  player.magicHold = 0;
  player.chargeFraction = 0;
}

// Prism's fan only exists while a highlighted branch carries it; otherwise its damage split is undone.
function styleShotProfile(style) {
  if (!ownedItems.has('prism') || weapon.shotCount <= 1 || itemActive('prism', style)) {
    return { count: weapon.shotCount, damage: weapon.shotDamageMultiplier, prism: ownedItems.has('prism') && weapon.shotCount > 1 };
  }
  return { count: 1, damage: weapon.shotDamageMultiplier * weapon.shotCount / PRISM_TOTAL_DAMAGE, prism: false };
}

function classSignature(entry = character) {
  return classSignatures[entry?.className] || null;
}

function characterProfile(entry = character) {
  const cls = classProfiles[entry?.className] || {};
  const race = raceProfiles[entry?.raceHead] || {};
  const pick = (key) => (cls[key] ?? 1) * (race[key] ?? 1);
  return {
    melee: pick('melee'), meleeRate: pick('meleeRate'), bow: pick('bow'), bowRate: pick('bowRate'),
    magic: pick('magic'),
  };
}

function nativeStyle() {
  return character?.startingStyle || 'magic';
}

function styleUnlocked() {
  return true;
}

function styleSynergy(style) {
  const profile = characterProfile();
  const strong = style === 'melee' ? profile.melee >= 1.2 : style === 'bow' ? profile.bow >= 1.2 || profile.bowRate >= 1.2 : profile.magic >= 1.2;
  return strong && Boolean(activeWeaponMod(style));
}

// Mob AI reacts to the weapon the player has been relying on, not the one held this instant, so a quick
// swap cannot dodge the counter. Heat is seconds spent attacking with each style, decaying over time.
const STYLE_HEAT_HALF_LIFE = 4;
const STYLE_HEAT_MIN = 2;
const STYLE_HEAT_LEAD = 1.25;
const styleHeat = { melee: 0, bow: 0, magic: 0 };
let dominantAIStyle = null;
let styleShiftAnnounced = false;
// Swapping weapons is free but not instant, so rapid swapping cannot sidestep the mob response above.
const WEAPON_SWAP_COOLDOWN = 6;
let weaponSwapCooldown = 0;

function resetStyleHeat() {
  weaponSwapCooldown = 0;
  for (const style of Object.keys(styleHeat)) styleHeat[style] = 0;
  dominantAIStyle = null;
  styleShiftAnnounced = false;
  if (styleHeat[activeCombatStyle] === 0) {
    styleHeat[activeCombatStyle] = STYLE_HEAT_MIN * 2;
    dominantAIStyle = activeCombatStyle;
  }
}

function refreshDominantStyle() {
  const leader = Object.keys(styleHeat).reduce((best, style) => (styleHeat[style] > styleHeat[best] ? style : best), 'melee');
  if (dominantAIStyle && styleHeat[dominantAIStyle] < STYLE_HEAT_MIN * 0.5) dominantAIStyle = null;
  if (leader === dominantAIStyle) return;
  const incumbentHeat = dominantAIStyle ? styleHeat[dominantAIStyle] : 0;
  if (styleHeat[leader] >= STYLE_HEAT_MIN && styleHeat[leader] >= incumbentHeat * STYLE_HEAT_LEAD) {
    const shifted = dominantAIStyle !== null;
    dominantAIStyle = leader;
    if (shifted && !styleShiftAnnounced) {
      styleShiftAnnounced = true;
      showMessage('Foes adjust.', 1.4);
    }
  }
}

function recordStyleUse(style, seconds) {
  if (!(style in styleHeat)) return;
  styleHeat[style] += Math.min(1.5, Math.max(0, seconds));
  refreshDominantStyle();
}

function updateStyleHeat(dt) {
  const decay = Math.pow(0.5, dt / STYLE_HEAT_HALF_LIFE);
  for (const style of Object.keys(styleHeat)) styleHeat[style] *= decay;
  refreshDominantStyle();
}

function resolveElementalImpact(projectile, target) {
  const impactX = projectile.x - projectile.vx * 0.02;
  const impactY = projectile.y - projectile.vy * 0.02;
  if (projectile.element === 'bubble') {
    target.wetTimer = 3.5;
    target.slowTimer = Math.max(target.slowTimer || 0, 0.35);
    damageEnemy(target, projectile.damage, impactX, impactY, false, false);
    addParticles(target.x, target.y - target.radius * 0.25, magicElementPalette.bubble, 18, 145);
    addParticles(target.x, target.y, '#c9fbff', 8, 80);
    if (projectile.type !== 'melee') {
      leaveElementPuddle(target.x, target.y + target.radius * 0.35, 'water', {
        radius: Math.max(26, target.radius * 1.1), duration: 1.35, slow: 0, damage: 0,
      });
    }
  } else if (projectile.element === 'lightning') {
    const wetTarget = (target.wetTimer || 0) > 0;
    damageEnemy(target, projectile.damage * (wetTarget ? 1.8 : 1), impactX, impactY, false, false);
    if (wetTarget) {
      const chained = enemies.filter((enemy) => enemy !== target && distanceBetween(enemy, target) < 150)
        .sort((first, second) => distanceBetween(first, target) - distanceBetween(second, target)).slice(0, 2);
      for (const enemy of chained) {
        lightningArcs.push({ x1: target.x, y1: target.y, x2: enemy.x, y2: enemy.y, ttl: 0.18 });
        damageEnemy(enemy, Math.max(1, projectile.damage * 0.65), target.x, target.y, false, false);
      }
    }
    addParticles(target.x, target.y, magicElementPalette.lightning, wetTarget ? 24 : 16, 190);
    addParticles(target.x, target.y, '#fffbe0', 8, 110);
    // Lightning leaves a short charged pool and runs through any water nearby.
    const shock = Math.max(1, Math.round(projectile.damage * 0.3));
    electrifyPuddles(target.x, target.y, 60, shock);
    leaveElementPuddle(target.x, target.y + target.radius * 0.35, 'charged', { duration: 2.4, damage: shock });
  } else {
    damageEnemy(target, projectile.damage, impactX, impactY, false, false);
    if (projectile.element === 'fire') {
      target.burnTimer = Math.max(target.burnTimer || 0, 2.4);
      target.burnCooldown = Math.min(target.burnCooldown || 0.6, 0.15);
      igniteMiasmaAt(projectile.x, projectile.y, true);
      addParticles(target.x, target.y, magicElementPalette.fire, 20, 170);
      addParticles(target.x, target.y, '#ffe4a3', 8, 110);
      createGroundHazard(target.x, target.y, 'fire', 'player', {
        radius: Math.max(24, target.radius * 0.8), duration: 0.75, damage: 0,
      });
      quenchHazardsNear(target.x, target.y, 40, ['water', 'slush', 'charged']);
    } else if (projectile.element === 'gas') {
      const cloudCount = groundHazards.filter((hazard) => hazard.kind === 'miasma' && hazard.owner === 'player').length;
      if (cloudCount < 3) createGroundHazard(projectile.x, projectile.y, 'miasma', 'player',
        { color: magicColor(projectile), element: projectile.element, suppressHitStop: true });
      addParticles(projectile.x, projectile.y, magicElementPalette.gas, 22, 65);
      addParticles(projectile.x, projectile.y, '#eaffb5', 8, 95);
    } else if (['ice', 'wind', 'earth', 'spore'].includes(projectile.element)) {
      if (projectile.element === 'ice' || projectile.element === 'earth') {
        target.slowTimer = Math.max(target.slowTimer || 0, projectile.element === 'ice' ? 0.8 : 0.35);
      }
      if (projectile.element === 'wind') {
        target.slowTimer = Math.max(target.slowTimer || 0, 0.25);
      }
      addParticles(target.x, target.y, magicColor(projectile), 20, projectile.element === 'wind' ? 190 : 110);
      if (projectile.element === 'ice') {
        // Ice freezes the ground to slush, puts fire out, and cracks off sparks and earth shards.
        quenchHazardsNear(target.x, target.y, 40, ['fire']);
        leaveElementPuddle(target.x, target.y + target.radius * 0.35, 'slush', { duration: 3.5 });
        addParticles(target.x, target.y, '#ffe66a', 6, 170);
        addParticles(target.x, target.y + target.radius * 0.3, '#8a6a43', 6, 120);
      }
    }
  }
}

function prepareWildMagicShot(projectile) {
  projectile.color = magicColor(projectile);
  const mage = character?.className === 'Mage';
  const special = Math.random() < (mage ? 0.06 : 0.01);
  const effects = ['nova', 'chain', 'rot', 'rift', 'gas', 'wall', 'spores', 'bomb', 'slam'];
  projectile.magicSurprise = true;
  projectile.wildEnemyChance = mage ? 0.4 : 0.1;
  projectile.wildObjectChance = mage ? 0.2 : 0.05;
  projectile.wildPhase = Math.random() * Math.PI * 2;
  projectile.wildAge = 0;
  projectile.wildAmplitude = special ? 0.14 : mage ? 0.07 : 0.025;
  if (special) {
    projectile.wildEffect = effects[Math.floor(Math.random() * effects.length)];
    projectile.size *= 1.2;
    projectile.radius *= 1.2;
    projectile.pulse = Math.max(projectile.pulse || 0, 0.18);
  }
  return projectile;
}

function updateWildMagicFlight(projectile, dt) {
  if (!projectile.magicSurprise) return;
  const age = projectile.wildAge || 0;
  const phase = projectile.wildPhase;
  const turn = projectile.wildAmplitude *
    (Math.sin((age + dt) * 11 + phase) - Math.sin(age * 11 + phase));
  const vx = projectile.vx;
  projectile.vx = vx * Math.cos(turn) - projectile.vy * Math.sin(turn);
  projectile.vy = vx * Math.sin(turn) + projectile.vy * Math.cos(turn);
  projectile.wildAge = age + dt;
}

function triggerWildMagicImpact(projectile, target = null) {
  if (!projectile.magicSurprise || projectile.wildImpactResolved) return;
  projectile.wildImpactResolved = true;
  if (!projectile.wildEffect && Math.random() >=
    (target ? projectile.wildEnemyChance : projectile.wildObjectChance)) return;
  const near = enemies.filter((enemy) => enemy.hp > 0 && distanceBetween(enemy, projectile) < 150 &&
    hasLineOfSight(projectile, enemy));
  const effects = target && !target.boss && !target.miniBoss
    ? ['nova', 'chain', 'rot', 'rift', 'gas', 'wall', 'spores', 'bomb', 'slam']
    : ['nova', 'chain', 'rot', 'gas', 'wall', 'spores'];
  const effect = projectile.wildEffect || effects[Math.floor(Math.random() * effects.length)];
  const damage = Math.max(1, Math.round(projectile.damage * 0.45));
  const origin = target || projectile;
  const color = magicColor(projectile);
  // A short cast trail connects the surprise to its caster rather than the affected mob.
  lightningArcs.push({ x1: player.x, y1: player.y - 20, x2: origin.x, y2: origin.y,
    ttl: 0.22, color, owner: 'player', castTrail: true });
  if (effect === 'gas' || effect === 'wall') {
    const angle = Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;
    const count = effect === 'wall' ? 5 : 3;
    for (let index = 0; index < count; index += 1) {
      if (groundHazards.filter((hazard) => hazard.owner === 'player').length >= 16) break;
      const offset = (index - (count - 1) / 2) * 28;
      createGroundHazard(
        clamp(origin.x + Math.cos(angle) * offset, 40, ROOM_W - 40),
        clamp(origin.y + Math.sin(angle) * offset, 40, ROOM_H - 40),
        effect === 'wall' ? 'fire' : 'miasma', 'player',
        { radius: effect === 'wall' ? 26 : 38, duration: 2.8, damage: Math.min(3, damage),
          suppressHitStop: true, color, element: projectile.element },
      );
    }
    addParticles(origin.x, origin.y, color, 36, effect === 'wall' ? 190 : 100);
  } else if (effect === 'spores') {
    burstClusterOrb({ x: origin.x, y: origin.y, magicCluster: true, damage: projectile.damage,
      element: projectile.element, color, target }, 'player');
    addParticles(origin.x, origin.y, color, 30, 180);
  } else if ((effect === 'bomb' || effect === 'slam') && target?.hp > 0) {
    if (effect === 'slam' && !target.boss && !target.miniBoss && !target.manaRift) {
      target.manaSlam = target.manaSlam || { timer: 1, duration: 1, damage, color, element: projectile.element };
    } else {
      target.manaBomb = target.manaBomb || { timer: 1.2, duration: 1.2, damage, color, element: projectile.element };
    }
    addParticles(origin.x, origin.y, color, 20, 120);
  } else if (effect === 'chain') {
    const arcStart = lightningArcs.length;
    chainLightningFrom(origin, damage, itemActive('wild-magic-core', 'magic') ? 4 : 2, true, color);
    for (let index = arcStart; index < lightningArcs.length; index += 1) {
      Object.assign(lightningArcs[index], { ttl: 0.4, color, owner: 'player' });
    }
    addParticles(origin.x, origin.y, color, 22, 200);
  } else if (effect === 'rot') {
    const victims = target?.hp > 0 ? [target] : near.slice(0, 2);
    for (const enemy of victims) {
      enemy.manaRotTimer = Math.max(enemy.manaRotTimer || 0, itemActive('wild-magic-core', 'magic') ? 4 : 2.4);
      enemy.manaRotTick = Math.min(enemy.manaRotTick || 0.1, 0.1);
      enemy.manaRotDamage = Math.max(enemy.manaRotDamage || 0, Math.min(3, damage));
      enemy.manaRotColor = color;
    }
    addParticles(origin.x, origin.y, color, 26, 170);
  } else if (effect === 'rift' && target?.hp > 0 && !target.boss && !target.miniBoss) {
    const destination = findEnemySpawnPosition(null, null, target.radius, 100, target);
    if (destination) {
      target.manaRift = { timer: 0.8, duration: 0.8, destination, moved: false, color };
      addParticles(target.x, target.y, color, 24, 135);
    } else {
      target.slowTimer = Math.max(target.slowTimer || 0, 1.2);
      addParticles(target.x, target.y, color, 24, 135);
    }
  } else {
    const radius = itemActive('wild-magic-core', 'magic') ? 135 : 95;
    addParticles(origin.x, origin.y, color, 32, 240);
    addParticles(origin.x, origin.y, '#fff4df', 12, 180);
    for (const enemy of [...near]) {
      if (distanceBetween(enemy, origin) > radius + enemy.radius) continue;
      damageEnemy(enemy, damage, origin.x, origin.y, false, false);
    }
  }
}

function detonateWildMagic(enemy, damage, color, element) {
  addParticles(enemy.x, enemy.y, color, 40, 260);
  addParticles(enemy.x, enemy.y, '#fff3da', 18, 190);
  for (const target of [...enemies]) {
    if (target.hp <= 0 || target.manaRift || distanceBetween(target, enemy) > 105 + target.radius ||
      !hasLineOfSight(enemy, target)) continue;
    damageEnemy(target, target === enemy ? damage * 2 : damage, enemy.x, enemy.y, false, false);
  }
  if (groundHazards.filter((hazard) => hazard.owner === 'player').length < 16) {
    createGroundHazard(enemy.x, enemy.y, 'fire', 'player',
      { radius: 40, duration: 1, damage: 0, color, element, suppressHitStop: true });
  }
}

function updateWildMagicStatus(enemy, dt) {
  if (enemy.manaBomb) {
    enemy.manaBomb.timer = Math.max(0, enemy.manaBomb.timer - dt);
    if (enemy.manaBomb.timer === 0) {
      const { damage, color, element } = enemy.manaBomb;
      enemy.manaBomb = null;
      detonateWildMagic(enemy, damage, color, element);
      if (enemy.hp <= 0) return true;
    }
  }
  if (enemy.manaSlam) {
    enemy.manaSlam.timer = Math.max(0, enemy.manaSlam.timer - dt);
    if (enemy.manaSlam.timer === 0) {
      const { damage, color, element } = enemy.manaSlam;
      enemy.manaSlam = null;
      detonateWildMagic(enemy, damage, color, element);
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.8);
    }
    return true;
  }
  if (enemy.manaRotTimer > 0) {
    enemy.manaRotTimer = Math.max(0, enemy.manaRotTimer - dt);
    enemy.manaRotTick -= dt;
    if (enemy.manaRotTick <= 0) {
      enemy.manaRotTick = 0.6;
      addParticles(enemy.x, enemy.y - enemy.radius * 0.5, enemy.manaRotColor, 12, 110);
      damageEnemy(enemy, enemy.manaRotDamage, enemy.x, enemy.y, false, false);
      if (enemy.hp <= 0) return true;
    }
  }
  const rift = enemy.manaRift;
  if (!rift) return false;
  rift.timer = Math.max(0, rift.timer - dt);
  if (!rift.moved && rift.timer <= rift.duration / 2) {
    const destination = findEnemySpawnPosition(rift.destination.x, rift.destination.y, enemy.radius, 100, enemy);
    if (destination) {
      enemy.x = destination.x;
      enemy.y = destination.y;
    }
    rift.moved = true;
    addParticles(enemy.x, enemy.y, rift.color, 24, 135);
  }
  if (rift.timer === 0) {
    enemy.manaRift = null;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.7);
  }
  return true;
}

function spawnSwordHitBurst(enemy, strikeAngle) {
  const capacity = (quality.low ? MAX_PARTICLES_LOW : MAX_PARTICLES) - particles.length;
  const count = Math.min(quality.low ? 16 : 32, Math.max(0, capacity));
  const waterHit = (enemy.wetTimer || 0) > 0;
  const colors = waterHit ? ['#55c9ef', '#b9f4ff', '#e7fcff'] : ['#a91e37', '#d83b52', '#ff8990'];
  for (let index = 0; index < count; index += 1) {
    const angle = strikeAngle + (Math.random() - 0.5) * 0.7;
    const speed = 360 + Math.random() * 260;
    const lifetime = 0.5 + Math.random() * 0.2;
    particles.push({
      x: enemy.x + Math.cos(angle) * enemy.radius * 0.2,
      y: enemy.y + Math.sin(angle) * enemy.radius * 0.2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 24,
      color: colors[index % colors.length],
      radius: 2.8 + Math.random() * 3.2,
      streak: true,
      ttl: lifetime,
      maxTtl: lifetime,
    });
  }
  enemy.swordHitEffectTimer = 0.7;
}

const ARROW_DEFLECT_CHANCE = 0.5;
const ARROW_DEFLECT_CHARGED_CHANCE = 0.75;

function deflectArrowTipProjectile(arrow, incoming, dt = 0) {
  const arrowLastDeflect = Number.isFinite(arrow.lastDeflectTime) ? arrow.lastDeflectTime : -1;
  const incomingLastDeflect = Number.isFinite(incoming.lastDeflectTime) ? incoming.lastDeflectTime : -1;
  if (elapsed - arrowLastDeflect < 0.12 || elapsed - incomingLastDeflect < 0.12) return false;
  const arrowSpeed = Math.hypot(arrow.vx, arrow.vy);
  if (arrowSpeed === 0) return false;
  const forwardX = arrow.vx / arrowSpeed;
  const forwardY = arrow.vy / arrowSpeed;
  const tipX = arrow.x + forwardX * 14;
  const tipY = arrow.y + forwardY * 14;
  const endX = incoming.x - tipX;
  const endY = incoming.y - tipY;
  const startX = incoming.x - incoming.vx * dt - (arrow.previousX ?? arrow.x) - forwardX * 14;
  const startY = incoming.y - incoming.vy * dt - (arrow.previousY ?? arrow.y) - forwardY * 14;
  const radius = incoming.radius || 0;
  let entry = 0;
  let exit = 1;
  // Sweep relative motion through a forgiving, arrow-aligned box around the tip.
  for (const [start, end, extent] of [
    [startX * forwardX + startY * forwardY, endX * forwardX + endY * forwardY, 18 + radius],
    [-startX * forwardY + startY * forwardX, -endX * forwardY + endY * forwardX, 12 + radius],
  ]) {
    const travel = end - start;
    if (travel === 0) {
      if (Math.abs(start) > extent) return false;
      continue;
    }
    const first = (-extent - start) / travel;
    const last = (extent - start) / travel;
    entry = Math.max(entry, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (entry > exit) return false;
  }

  // Arrows only sometimes knock a shot away (the sword always parries). Each arrow rolls once per enemy shot, so
  // a miss lets that shot fly on instead of re-rolling every frame while the two overlap.
  arrow.deflectRolls ||= new WeakSet();
  if (arrow.deflectRolls.has(incoming)) return false;
  arrow.deflectRolls.add(incoming);
  if (Math.random() >= (arrow.charged ? ARROW_DEFLECT_CHARGED_CHANCE : ARROW_DEFLECT_CHANCE)) return false;

  const direction = Math.random() < 0.5 ? -1 : 1;
  const target = enemies.filter((enemy) => enemy.hp > 0 && hasLineOfSight(incoming, enemy))
    .sort((a, b) => distanceBetween(incoming, a) - distanceBetween(incoming, b))[0];
  const returnAngle = target
    ? Math.atan2(target.y - incoming.y, target.x - incoming.x) + (Math.random() * 64 - 32) * Math.PI / 180
    : Math.atan2(arrow.vy, arrow.vx) + direction * (35 + Math.random() * 45) * Math.PI / 180;
  const speed = Math.max(620, Math.hypot(incoming.vx, incoming.vy) * 1.65) * (1 + Math.random() * 0.15);
  spawnPlayerProjectile({
    x: incoming.x, y: incoming.y,
    vx: Math.cos(returnAngle) * speed, vy: Math.sin(returnAngle) * speed,
    radius: incoming.radius || 6, size: 1, color: incoming.color, kind: incoming.kind,
    type: 'reflected', damage: Math.max(1, arrow.damage || 0) + Math.max(0, incoming.damage || 0),
    ttl: 1.4, trailTimer: 0, parried: true, arrowParried: true,
  });
  const arrowAngle = Math.atan2(arrow.vy, arrow.vx) - direction * (35 + Math.random() * 35) * Math.PI / 180;
  const boostedArrowSpeed = Math.max(arrowSpeed, Math.min(1200, arrowSpeed * 1.2));
  arrow.vx = Math.cos(arrowAngle) * boostedArrowSpeed;
  arrow.vy = Math.sin(arrowAngle) * boostedArrowSpeed;
  arrow.lastDeflectTime = elapsed;
  incoming.lastDeflectTime = elapsed;
  addParticles(tipX, tipY, '#fff3bb', 14, 200);
  playSound('weapons/axe/hit.ogg', 0.25);
  return true;
}

function rewardArrowParryHit(projectile, enemy, hpBeforeHit) {
  if (!projectile.arrowParried || projectile.healthRewarded || enemy.hp >= hpBeforeHit ||
    player.hp <= 0 || mode !== 'playing') return;
  projectile.healthRewarded = true;
  if (player.hp >= player.maxHp || Math.random() >= 0.4) return;
  player.hp = Math.min(player.maxHp, player.hp + 0.5);
  popOverPlayer({ icon: 'half-heart', color: '#ff7b8e' });
  updateHud();
}

function triggerCameraShake(profileName) {
  const profile = cameraShakeProfiles[profileName];
  if (!profile || cameraShake.remaining > 0 && cameraShake.intensity > profile.intensity) return;
  cameraShake.duration = profile.duration;
  cameraShake.remaining = profile.duration;
  cameraShake.intensity = profile.intensity;
  cameraShake.frequency = profile.frequency;
  cameraShake.style = profile.style;
  cameraShake.phase = 0;
}

function getCameraShakeOffset() {
  if (cameraShake.remaining <= 0) return { x: 0, y: 0 };
  const strength = cameraShake.intensity * cameraShake.remaining / cameraShake.duration;
  const phase = cameraShake.phase * cameraShake.frequency;
  if (cameraShake.style === 'rumble') {
    return { x: Math.sin(phase * 0.7) * strength, y: Math.sin(phase * 1.1) * strength * 0.7 };
  }
  const verticalScale = cameraShake.style === 'heavy' ? 0.85 : 0.55;
  return { x: Math.sin(phase) * strength, y: Math.cos(phase * 1.25) * strength * verticalScale };
}

function ownedAbilityCount() {
  return shopItemCatalog.filter((item) => item.kind === 'ability' &&
    item.id !== 'orbiting-projectiles' && ownedItems.has(item.id)).length;
}

function reservedAbilityCount() {
  return shopItemCatalog.filter((item) => item.kind === 'ability' &&
    item.id !== 'orbiting-projectiles' &&
    reservedUpgradeIds.has(item.id) && !ownedItems.has(item.id)).length;
}

// Roster health (3–12) maps onto 3–6 starting hearts.
function startingHearts(entry) {
  return clamp(Math.round(2 + (entry.hp || 6) / 3), 3, 6);
}

function extraHearts() {
  return Math.max(0, player.maxHp - (character ? startingHearts(character) : BASE_HEARTS));
}

function phaseRewardHealAmount() {
  return Math.min(2, Math.ceil(player.maxHp / 2));
}

function gainMaxHeart() {
  if (extraHearts() >= MAX_EXTRA_HEARTS) return false;
  player.maxHp += 1;
  player.hp = Math.min(player.maxHp, player.hp + 1);
  return true;
}

function heartVesselAllowed() {
  const extra = extraHearts();
  return extra < MAX_EXTRA_HEARTS && (extra < SOFT_EXTRA_HEARTS || Math.random() < 0.04);
}

// The Lifestone is a boss drop: one extra heart container while extra hearts are below the soft cap, then three
// hearts recovered one at a time. It is not added to ownedItems, so every boss can drop one.
const LIFESTONE_HEARTS = 3;
const LIFESTONE_TICK_SECONDS = 6;
// Each Far-Reach Lens tier also lengthens every melee weapon.
const MELEE_REACH_PER_LENS = 0.1;
// Flurry Gauntlets swing 2.8x as often (cooldown x1/2.8), Swift Daggers 1.25x (cooldown x0.8).
const FLURRY_SWING_RATE = 2.8;
const FLURRY_COOLDOWN_SCALE = 1 / FLURRY_SWING_RATE;
const DAGGER_COOLDOWN_SCALE = 0.8;
// Item bonuses in the units players read: a multiplier above 1 is a gain (1.5 is +50%). `itemEffectTagsFor` prints
// these same numbers, so the text on the cards and the effect cannot drift apart. Costs are in docs/ITEMS.md.
const ITEM_TUNING = {
  pearlSize: 1.5,
  featherFireRate: 1.4,
  featherShotSpeed: 1.15,
  rangeLens: 1.35,
  quiverFireRate: 1.8,
  quiverDamage: 0.6,
  // Wind-Up Wraps and Longbow Draw: charge builds this much faster (charge time x1/1.4).
  chargeSpeed: 1.4,
};
// Prism Shard: a three-way fan whose shots add up to 1.2x one shot. A fused elemental shot stays at 1.6x.
const PRISM_SHOT_COUNT = 3;
const PRISM_TOTAL_DAMAGE = 1.2;

function lifestoneGainsHeart() {
  return extraHearts() < Math.min(SOFT_EXTRA_HEARTS, MAX_EXTRA_HEARTS);
}

function startLifestoneRegen() {
  const active = player.lifestoneRegen;
  player.lifestoneRegen = { ticks: (active?.ticks || 0) + LIFESTONE_HEARTS, timer: active ? active.timer : LIFESTONE_TICK_SECONDS };
}

// Runs on game time, so it pauses with the game; damage does not interrupt it and a dead run stops it.
function updateLifestoneRegen(dt) {
  const regen = player.lifestoneRegen;
  if (!regen) return;
  if (deathTimer > 0 || player.hp <= 0) {
    player.lifestoneRegen = null;
    return;
  }
  regen.timer -= dt;
  while (regen.timer <= 0 && regen.ticks > 0) {
    regen.timer += LIFESTONE_TICK_SECONDS;
    regen.ticks -= 1;
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
      playPickupSound('heal', 0.3);
      popOverPlayer({ icon: 'heart', color: '#ff7b8e' });
      addParticles(player.x, player.y - 12, '#ffe7a6', 8, 70);
      updateHud();
    }
  }
  if (regen.ticks <= 0) player.lifestoneRegen = null;
}

function isUpgradeAvailable(item) {
  if (item.kind === 'boss-relic') return false;
  if (item.kind === 'element' && !magicElements.has(item.element)) return false;
  const rangeTier = rangeLensItemIds.indexOf(item.id);
  const luckTier = ['luck-up-i', 'luck-up-ii'].indexOf(item.id);
  // Heart vessels are bought in order: each tier needs the one before it.
  const vesselTier = ['heart-vessel-i', 'heart-vessel-ii', 'heart-vessel-iii'].indexOf(item.id);
  const vesselsOwned = vesselTier < 0 ? 0
    : ['heart-vessel-i', 'heart-vessel-ii', 'heart-vessel-iii'].filter((id) => ownedItems.has(id)).length;
  if (item.kind === 'weapon' && item.weapon && meleeWeapons.has(item.weapon)) return false;
  return isCatalogItemUnlocked(item) && (rangeTier < 0 || rangeTier === weapon.rangeLevel) &&
    (luckTier < 0 || luckTier === player.luck) && (vesselTier < 0 || vesselTier === vesselsOwned);
}

function strongestPlayerSingleHit() {
  const baseDamage = player.damage + weapon.damageBonus;
  let strongestHit = Math.max(1, baseDamage);
  if (combatStyles.has('melee')) {
    for (const weaponType of meleeWeapons) {
      strongestHit = Math.max(strongestHit, baseDamage +
        (weaponType === 'sword' ? 2 : weaponType === 'daggers' ? 1 : 0));
    }
  }
  if (consumables.some((item) => item.id === 'mana-burst' && item.count > 0)) {
    strongestHit = Math.max(strongestHit, 8);
  }
  if (ownedItems.has('prism') && weapon.shotCount > 1 && getActiveAttackElement() &&
      getActiveAttackElement() !== 'bubble') {
    strongestHit = Math.max(strongestHit, Math.ceil(baseDamage * 1.6));
  }
  return Math.ceil(strongestHit);
}

function activeAttackMorph() {
  const morph = {
    shape: null, color: null, drop: null, pulse: 0, explode: 0, slowOnHit: 0, surround: false,
    speedMul: 1, damageMul: 1, sizeMul: 1, delayMul: 1,
  };
  for (const id of [...ownedItems].filter((itemId) => attackMorphs[itemId] && itemActive(itemId)).slice(-2)) {
    const source = attackMorphs[id];
    for (const key of ['shape', 'color', 'drop']) if (source[key]) morph[key] = source[key];
    morph.pulse = Math.max(morph.pulse, source.pulse || 0);
    morph.explode = Math.max(morph.explode, source.explode || 0);
    morph.slowOnHit = Math.max(morph.slowOnHit, source.slowOnHit || 0);
    morph.surround = morph.surround || source.surround === true;
    for (const key of ['speedMul', 'damageMul', 'sizeMul', 'delayMul']) morph[key] *= source[key] || 1;
  }
  return morph;
}

function triggerMagicCluster(projectile, target = null, obstacle = null) {
  if (!projectile.magicCluster || projectile.clusterBurst) return;
  projectile.clusterBurst = true;
  burstClusterOrb({
    x: clamp(projectile.x, 6, ROOM_W - 6),
    y: clamp(projectile.y, 6, ROOM_H - 6),
    magicCluster: true, damage: projectile.damage, element: projectile.element,
    target, obstacle,
  }, 'player');
}

function chainLightningFrom(origin, damage, links, suppressHitStop = false, color = magicElementPalette.lightning) {
  let source = origin;
  const struck = new Set([origin]);
  for (let link = 0; link < links; link += 1) {
    let next = null;
    let nearest = 190 * 190;
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.manaRift || struck.has(enemy)) continue;
      const distance = (enemy.x - source.x) ** 2 + (enemy.y - source.y) ** 2;
      if (distance < nearest && hasLineOfSight(source, enemy)) {
        next = enemy;
        nearest = distance;
      }
    }
    if (!next) return;
    struck.add(next);
    lightningArcs.push({ x1: source.x, y1: source.y, x2: next.x, y2: next.y, ttl: 0.18, color, owner: 'player' });
    damageEnemy(next, Math.max(1, Math.round(damage * 0.6)), source.x, source.y, false, !suppressHitStop);
    addParticles(next.x, next.y, color, 6, 70);
    source = next;
  }
}

function applyMorphLanding(projectile, primaryTarget, suppressHitStop = false) {
  if (projectile.owner === 'companion') return;
  if (projectile.explode) {
    addParticles(projectile.x, projectile.y, projectile.color, 14, 130);
    for (const enemy of [...enemies]) {
      if (enemy === primaryTarget || distanceBetween(enemy, projectile) > projectile.explode + enemy.radius) continue;
      damageEnemy(enemy, Math.max(1, Math.round(projectile.damage * 0.5)), projectile.x, projectile.y, false, !suppressHitStop);
    }
  }
  if (projectile.drop && groundHazards.filter((hazard) => hazard.owner === 'player').length < 4) {
    const long = projectile.drop === 'long';
    createGroundHazard(projectile.x, projectile.y, 'miasma', 'player', {
      radius: long ? 40 : 28, duration: long ? 5 : 1.8, color: projectile.color,
      element: projectile.element, suppressHitStop,
    });
  }
}

function spawnPlayerProjectile(projectile) {
  if (projectiles.length >= MAX_PLAYER_PROJECTILES) {
    const expendableIndex = projectiles.findIndex((entry) => entry.owner === 'companion');
    projectiles.splice(expendableIndex >= 0 ? expendableIndex : 0, 1);
  }
  const ttl0 = projectile.ttl || 0.5;
  const curve = (projectile.dropCurve || (projectile.type === 'arrow' ? 2.2 : 2.6)) + weapon.rangeLevel * 0.5;
  projectiles.push({ ...projectile, owner: projectile.owner || 'player', born: elapsed, ttl0, dropCurve: curve });
}

function performMeleeSwing(baseAngle, damageScale = 1, charged = false) {
  const originY = attackOriginY();
  const ownedWeapons = [...meleeWeapons];
  const fx = branchEffects('melee');
  const shape = weaponShape('melee');
  const reachBoost = (charged ? 1.25 : 1) * fx.reach * shape.reach;
  const arc = clamp((charged ? Math.PI : 0.95) + fx.arc + shape.arc, 0.3, Math.PI);
  const lensReach = 1 + MELEE_REACH_PER_LENS * (weapon.rangeLevel || 0);
  const reachOf = (item) => (item === 'sword' ? 92 : item === 'daggers' ? 53 : 66) * reachBoost * lensReach;
  const strikeRange = Math.max(...ownedWeapons.map(reachOf));
  const meleeProfile = characterProfile().melee * (styleSynergy('melee') ? 1.2 : 1) * fx.damage * shape.damage;
  const damage = Math.max(1, Math.round((player.damage + weapon.damageBonus +
    ownedWeapons.reduce((bonus, item) => bonus + (item === 'sword' ? 2 : item === 'daggers' ? 1 : 0), 0)) * damageScale * meleeProfile));
  if (!offhandContext) {
    player.swordParryDamage = damage;
    player.swordParryRewarded = false;
    player.swordParryTimer = Math.max(player.swordParryTimer, 0.28 + fx.parryWindow);
    player.swordParryRadius = 0;
  }
  const hitEnemies = new Set();
  const angleTo = (target) => {
    const toTarget = Math.atan2(target.y - originY, target.x - player.x);
    return Math.atan2(Math.sin(toTarget - baseAngle), Math.cos(toTarget - baseAngle));
  };
  let hitCount = 0;
  let killCount = 0;
  let hitHeavyTarget = false;
  for (const enemy of [...enemies]) {
    if (enemy.manaRift) continue;
    const target = enemyAttackTarget(enemy);
    const distance = Math.hypot(target.x - player.x, target.y - originY);
    if (distance <= strikeRange + target.radius && Math.abs(angleTo(target)) < arc &&
      hasLineOfSight(player, enemy)) {
      hitCount += 1;
      if (enemy.boss || enemy.miniBoss) hitHeavyTarget = true;
      const element = getActiveAttackElement();
      if (element) {
        resolveElementalImpact({
          x: enemy.x, y: enemy.y,
          vx: Math.cos(baseAngle), vy: Math.sin(baseAngle),
          damage, element, type: 'melee',
        }, enemy);
      } else {
        damageEnemy(enemy, damage, player.x, originY);
      }
      if (ownedWeapons.includes('sword')) spawnSwordHitBurst(enemy, baseAngle);
      if (fx.burn && enemy.hp > 0) enemy.burnTimer = Math.max(enemy.burnTimer || 0, 2.4);
      if (enemy.hp > 0) applyWeaponImpact(enemy, shape, baseAngle);
      hitEnemies.add(enemy);
      if (enemy.hp <= 0) killCount += 1;
    }
  }
  if (hitCount > 0) {
    // Freeze-frame on contact: heavier for charged swings, kills and big targets.
    triggerHitStop((charged ? 0.12 : 0.09) + (killCount > 0 ? 0.02 : 0) + (hitHeavyTarget ? 0.02 : 0));
    triggerCameraShake('swordImpact');
  }
  for (let index = breakables.length - 1; index >= 0; index -= 1) {
    const obstacle = breakables[index];
    const distance = Math.hypot(obstacle.x - player.x, obstacle.y - originY);
    if (distance > strikeRange + obstacle.radius || Math.abs(angleTo(obstacle)) >= arc) continue;
    damageObstacle(obstacle, charged ? 2 : 1, 'melee');
  }
  ownedWeapons.forEach((item, index) => {
    const duration = (charged ? 0.38 : 0.2) + index * 0.035;
    player.meleeSwings.push({
      angle: baseAngle,
      timer: duration,
      maxTimer: duration,
      reach: reachOf(item),
      hitReach: strikeRange,
      arc,
      weapon: item,
      variant: shape.variant,
      offhand: Boolean(offhandContext),
      charged,
      spin: charged && !offhandContext,
      damage,
      hitEnemies: item === 'sword' ? new Set(hitEnemies) : null,
      element: getActiveAttackElement(),
    });
  });
  if (charged) {
    player.spin = { angle: baseAngle, timer: 0.38, duration: 0.38 };
    triggerCameraShake?.('charge');
    if (!offhandContext && confluenceFusionActive('spellblade')) releaseSpellbladeWave(baseAngle, damage);
  }
  if (activeWeaponMod('melee')?.id === 'mod-cinder' || fx.fireWall) spawnElementWall(baseAngle, damage, charged);
  addParticles(player.x + Math.cos(baseAngle) * 44, originY + Math.sin(baseAngle) * 44,
    elementAccent(charged ? '#fff2a0' : combatPalette.melee), 7 + ownedWeapons.length * 3, 100);
  updateHud();
}

function updateMeleeBladeContacts() {
  const originY = attackOriginY();
  let hitCount = 0;
  for (const swing of player.meleeSwings) {
    if (swing.weapon !== 'sword') continue;
    const progress = clamp(1 - swing.timer / swing.maxTimer, 0, 1);
    const bladeRadius = swing.reach + progress * 12;
    const ribbonCenter = swing.spin ? swing.angle + progress * Math.PI * 2 - 0.9 : swing.angle;
    const ribbonSpan = swing.spin ? 1.1 : 0.85;
    const hitEnemies = swing.hitEnemies || (swing.hitEnemies = new Set());
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.manaRift || hitEnemies.has(enemy) || !hasLineOfSight(player, enemy)) continue;
      const target = enemyAttackTarget(enemy);
      const dx = target.x - player.x;
      const dy = target.y - originY;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const angleDiff = Math.atan2(Math.sin(angle - ribbonCenter), Math.cos(angle - ribbonCenter));
      let bladeDistance;
      if (Math.abs(angleDiff) <= ribbonSpan) {
        bladeDistance = Math.abs(distance - bladeRadius);
      } else {
        const endpointAngle = ribbonCenter + Math.sign(angleDiff) * ribbonSpan;
        bladeDistance = Math.hypot(
          dx - Math.cos(endpointAngle) * bladeRadius,
          dy - Math.sin(endpointAngle) * bladeRadius,
        );
      }
      if (bladeDistance > target.radius + 4) continue;

      hitEnemies.add(enemy);
      const element = swing.element;
      if (element) {
        resolveElementalImpact({
          x: enemy.x, y: enemy.y,
          vx: Math.cos(swing.angle), vy: Math.sin(swing.angle),
          damage: swing.damage, element, type: 'melee',
        }, enemy);
      } else {
        damageEnemy(enemy, swing.damage, player.x, originY);
      }
      spawnSwordHitBurst(enemy, ribbonCenter);
      hitCount += 1;
    }
  }
  if (hitCount > 0) {
    triggerHitStop(0.09);
    triggerCameraShake('swordImpact');
  }
}

// Cinder's wall takes the run's element: fire (or no element) burns, water soaks, ice freezes to slush, lightning
// leaves charged ground, and gas, spore, wind and earth leave a tinted cloud. Every wall segment deals damage.
const ELEMENT_WALL_KINDS = { fire: 'fire', bubble: 'water', ice: 'slush', lightning: 'charged' };
const ELEMENT_WALL_CAP = 12;

function elementWallSpec(element = getActiveAttackElement()) {
  const kind = element ? ELEMENT_WALL_KINDS[element] || 'miasma' : 'fire';
  const color = element && kind !== 'fire' ? magicElementPalette[element] : undefined;
  return { kind, color, element: element || 'fire' };
}

function spawnElementWall(angle, swingDamage, charged) {
  const distances = charged ? [50, 85, 120, 155] : [50, 85, 120];
  const { kind, color, element } = elementWallSpec();
  for (const distance of distances) {
    if (groundHazards.filter((hazard) => hazard.owner === 'player' && hazard.wall).length >= ELEMENT_WALL_CAP) return;
    const x = clamp(player.x + Math.cos(angle) * distance, 50, ROOM_W - 50);
    const y = clamp(player.y + Math.sin(angle) * distance, 50, ROOM_H - 50);
    if (kind === 'fire') igniteMiasmaAt(x, y);
    createGroundHazard(x, y, kind, 'player', {
      radius: 30, duration: charged ? 3.2 : 2.4, damage: Math.max(1, Math.round(swingDamage * 0.4)), wall: true,
      slow: 0, ...(color ? { color, element } : {}), suppressHitStop: kind === 'miasma',
    });
  }
}

function updateMeleeProjectileParry(projectileIndex = null, dt = 0) {
  const swordSwing = player.meleeSwings.find((swing) => swing.weapon === 'sword') || player.meleeSwings[0];
  if (!swordSwing && player.swordParryTimer <= 0) return;
  const parryAngle = swordSwing?.angle ?? Math.atan2(player.lookY, player.lookX);
  const parryDamageBase = swordSwing?.damage || player.swordParryDamage;
  let parryWindowActive = player.swordParryTimer > 0;
  const firstIndex = projectileIndex ?? enemyProjectiles.length - 1;
  const lastIndex = projectileIndex ?? 0;
  let deflected = false;
  for (let index = firstIndex; index >= lastIndex; index -= 1) {
    const incoming = enemyProjectiles[index];
    const dx = player.x - incoming.x;
    const dy = player.y - incoming.y;
    const velocitySquared = incoming.vx * incoming.vx + incoming.vy * incoming.vy;
    const contactDistance = player.radius + (incoming.radius || 0);
    const currentDistance = Math.hypot(dx, dy);
    const contactTime = (x, y, radius) => {
      const startX = incoming.x - incoming.vx * dt;
      const startY = incoming.y - incoming.vy * dt;
      const travelX = incoming.x - startX;
      const travelY = incoming.y - startY;
      const lengthSquared = travelX * travelX + travelY * travelY;
      const offsetX = startX - x;
      const offsetY = startY - y;
      const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
      if (c <= 0) return 0;
      if (lengthSquared === 0) return Infinity;
      const b = offsetX * travelX + offsetY * travelY;
      const discriminant = b * b - lengthSquared * c;
      if (discriminant < 0) return Infinity;
      const t = (-b - Math.sqrt(discriminant)) / lengthSquared;
      return t >= 0 && t <= 1 ? t : Infinity;
    };
    const bodyTime = contactTime(player.x, player.y, contactDistance);
    let bladeTime = Infinity;
    for (const swing of player.meleeSwings) {
      const progress = clamp(1 - swing.timer / swing.maxTimer, 0, 1);
      const angle = swing.spin ? swing.angle + progress * Math.PI * 2 - 0.9 : swing.angle;
      const span = swing.spin ? 1.1 : 0.85;
      const reach = swing.reach + progress * 12;
      const padding = (incoming.radius || 0) + 10;
      const startX = incoming.x - incoming.vx * dt - player.x;
      const startY = incoming.y - incoming.vy * dt - attackOriginY();
      const travelX = incoming.vx * dt;
      const travelY = incoming.vy * dt;
      const lengthSquared = travelX * travelX + travelY * travelY;
      const withinArc = (t) => {
        const direction = Math.atan2(startY + travelY * t, startX + travelX * t);
        return Math.abs(Math.atan2(Math.sin(direction - angle), Math.cos(direction - angle))) <= span;
      };
      if (Math.abs(Math.hypot(startX, startY) - reach) <= padding && withinArc(0)) bladeTime = 0;
      // The swept shot enters the padded ribbon through a radial boundary or a rounded endpoint.
      if (lengthSquared > 0) {
        const b = startX * travelX + startY * travelY;
        for (const radius of [Math.max(0, reach - padding), reach + padding]) {
          const c = startX * startX + startY * startY - radius * radius;
          const discriminant = b * b - lengthSquared * c;
          if (discriminant < 0) continue;
          const root = Math.sqrt(discriminant);
          for (const t of [(-b - root) / lengthSquared, (-b + root) / lengthSquared]) {
            if (t >= 0 && t <= 1 && withinArc(t)) bladeTime = Math.min(bladeTime, t);
          }
        }
      }
      for (const endpoint of [angle - span, angle + span]) {
        bladeTime = Math.min(bladeTime, contactTime(
          player.x + Math.cos(endpoint) * reach,
          attackOriginY() + Math.sin(endpoint) * reach,
          padding,
        ));
      }
    }
    const bladeContact = bladeTime < Infinity;
    const bodyContact = bodyTime < Infinity && bodyTime <= bladeTime;
    const timeToClosest = velocitySquared > 0 ? (dx * incoming.vx + dy * incoming.vy) / velocitySquared : -1;
    const closestTime = Math.max(0, timeToClosest);
    const closestX = incoming.x + incoming.vx * closestTime;
    const closestY = incoming.y + incoming.vy * closestTime;
    const chargedBurst = player.swordParryTimer > 0 && player.swordParryRadius > 0;
    const parryLeadTime = parryWindowActive ? 0.42 : 0.18;
    const imminentImpact = bodyContact || bladeContact || (chargedBurst
      ? currentDistance <= player.swordParryRadius + (incoming.radius || 0)
      : currentDistance <= contactDistance + 7 ||
        (timeToClosest > 0 && timeToClosest <= parryLeadTime &&
          Math.hypot(closestX - player.x, closestY - player.y) <= contactDistance + 5));
    if (!imminentImpact) continue;
    if (bodyContact) damagePlayer(0.5, incoming);
    const target = enemies
      .filter((enemy) => hasLineOfSight(incoming, enemy))
      .sort((a, b) => distanceBetween(incoming, a) - distanceBetween(incoming, b))[0];
    const baseReturnAngle = chargedBurst
      ? currentDistance > 0 ? Math.atan2(incoming.y - player.y, incoming.x - player.x)
        : Math.atan2(-incoming.vy, -incoming.vx)
      : target ? Math.atan2(target.y - incoming.y, target.x - incoming.x) : parryAngle;
    const returnAngle = baseReturnAngle + (Math.random() * 2 - 1) * (chargedBurst ? 15 : 25) * Math.PI / 180;
    const speed = Math.max(420, Math.hypot(incoming.vx, incoming.vy) * 1.25);
    const parryDamage = Math.round((Math.max(1, parryDamageBase) +
      Math.max(0, incoming.damage || 0)) * branchEffects('melee').parryDamage);
    enemyProjectiles.splice(index, 1);
    deflected = true;
    spawnPlayerProjectile({
      x: incoming.x,
      y: incoming.y,
      vx: Math.cos(returnAngle) * speed,
      vy: Math.sin(returnAngle) * speed,
      radius: incoming.radius || 6,
      size: 1,
      color: incoming.color,
      kind: incoming.kind,
      type: 'reflected',
      damage: parryDamage,
      ttl: 1.4,
      trailTimer: 0,
      parried: true,
    });
    if (confluenceFusionActive('riposte-volley')) looseRiposteVolley(incoming.x, incoming.y, parryDamage);
    addParticles(incoming.x, incoming.y, '#fff2a0', 14, 160);
    playSound('weapons/axe/hit.ogg', 0.25);
    streakCallout.timer = streakCallout.duration;
    streakCallout.x = player.x;
    streakCallout.y = player.y - 96;
    const perfect = !bodyContact && (bladeContact || chargedBurst ||
      (timeToClosest > 0 && timeToClosest <= 0.18));
    streakCallout.text = perfect ? 'PERFECT PARRY!' : 'DEFLECT!';
    if (perfect && !player.swordParryRewarded && player.hp > 0) {
      player.swordParryRewarded = true;
      if (player.hp < player.maxHp && Math.random() < 0.4) {
        player.hp = Math.min(player.maxHp, player.hp + 0.5);
        popOverPlayer({ icon: 'half-heart', color: '#ff7b8e' });
        updateHud();
      }
    }
    if (!chargedBurst) {
      player.swordParryTimer = Math.max(player.swordParryTimer, 0.42);
      parryWindowActive = true;
    }
    player.swordParryFlash = 0.24;
    addParticles(player.x, player.y - 34, '#dffcff', 12, 150);
    triggerHitStop(0.09, 0.08);
    triggerCameraShake('meleeImpact');
  }
  return deflected;
}

function currentAttackStyle() {
  if (combatStyles.has(activeCombatStyle)) return activeCombatStyle;
  return [...combatStyles][0] || 'melee';
}

// Bats and bandits are hit where they are drawn, so their hitboxes come from `monsterSprites[kind].hitbox`.
function enemyAttackTarget(enemy) {
  const sprite = monsterSprites[enemy.kind];
  const hitbox = sprite?.hitbox;
  if (!hitbox) return enemy;
  const scale = mobDrawScale(enemy, sprite);
  return {
    x: enemy.x,
    y: enemy.y + hitbox.y * scale,
    radius: hitbox.radius * scale,
    radiusX: hitbox.radiusX * scale,
    radiusY: hitbox.radiusY * scale,
  };
}

// Where a shot is drawn: ballistic shots arc from 34px up to the ground, so hit tests and shadows share this.
function projectileArcState(projectile) {
  const ballistic = projectile.type && !['reflected', 'charge-beam'].includes(projectile.type);
  const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
  const flown = clamp(1 - projectile.ttl / (projectile.ttl0 || projectile.ttl || 1), 0, 1);
  const fall = ballistic ? Math.pow(flown, projectile.dropCurve || 2.4) : 0;
  const lift = 34 * (1 - fall);
  const y = projectile.y + (ballistic ? 34 * Math.abs(projectile.vx) / speed * fall : 0);
  return { x: projectile.x, y, elevation: ballistic ? lift : 24 };
}

function projectileHitsEnemy(projectile, enemy, dt) {
  const target = enemyAttackTarget(enemy);
  if (target === enemy) return projectileHitsCircle(projectile, enemy, dt);
  const visual = projectileArcState(projectile);
  const startVisual = projectileArcState({
    ...projectile, x: projectile.x - projectile.vx * dt, y: projectile.y - projectile.vy * dt,
    ttl: projectile.ttl + dt,
  });
  const radiusX = (target.radiusX || target.radius) + projectile.radius;
  const radiusY = (target.radiusY || target.radius) + projectile.radius;
  const start = { x: (startVisual.x - target.x) / radiusX, y: (startVisual.y - target.y) / radiusY };
  const end = { x: (visual.x - target.x) / radiusX, y: (visual.y - target.y) / radiusY };
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared ? clamp(-(start.x * dx + start.y * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(start.x + along * dx, start.y + along * dy) <= 1;
}

function projectileHitsCircle(projectile, target, dt = 0) {
  const startX = projectile.previousX ?? projectile.x - (projectile.vx || 0) * dt;
  const startY = projectile.previousY ?? projectile.y - (projectile.vy || 0) * dt;
  const dx = projectile.x - startX, dy = projectile.y - startY;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared ? clamp(((target.x - startX) * dx + (target.y - startY) * dy) / lengthSquared, 0, 1) : 0;
  return (startX + along * dx - target.x) ** 2 + (startY + along * dy - target.y) ** 2 <
    (projectile.radius + target.radius) ** 2;
}

function attackOriginY() {
  return player.y - 34;
}

function nearestTouchTargetAngle() {
  let target = null;
  let targetDistance = Infinity;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0)) continue;
    const distance = distanceBetween(player, enemy);
    if (distance < targetDistance) {
      target = enemy;
      targetDistance = distance;
    }
  }
  const aim = target && enemyAttackTarget(target);
  return aim ? Math.atan2(aim.y - attackOriginY(), aim.x - player.x) : null;
}

function currentAimAngle() {
  if (typeof offhandContext !== 'undefined' && offhandContext) return offhandContext.angle;
  if (lastInputMode === 'controller') {
    const aimX = gamepadInput.aimX;
    const aimY = gamepadInput.aimY;
    return Math.atan2(aimY, aimX);
  }
  if (lastInputMode === 'touch') {
    const targetAngle = nearestTouchTargetAngle();
    if (targetAngle !== null) return targetAngle;
    if (touchInput.aimActive) return Math.atan2(touchInput.aimY, touchInput.aimX);
    return Math.atan2(player.lookY, player.lookX);
  }
  if (lastInputMode === 'keyboard') {
    return Math.atan2(pointer.y + camera.y - attackOriginY(), pointer.x + camera.x - player.x);
  }
  return 0;
}

function updateTouchAimFacing() {
  if (typeof touchInput === 'undefined' || !touchInput.attack) return;
  const angle = currentAimAngle();
  player.lookX = Math.cos(angle);
  player.lookY = Math.sin(angle);
}

function meleeInputHeld() {
  const held = pointer.down || gamepadInput.shoot || touchInput.attack;
  if (attackInputSuppressed && !held) attackInputSuppressed = false;
  return held && !attackInputSuppressed;
}

function meleeChargeTime() {
  return MELEE_CHARGE_TIME / (activeWeaponMod('melee')?.id === 'mod-windup' ? ITEM_TUNING.chargeSpeed : 1) /
    branchEffects('melee').chargeSpeed;
}

function updateMeleeInput(dt) {
  if (currentAttackStyle() !== 'melee') {
    player.meleeCharge = 0;
    player.meleeBuffer = null;
    player.chargeFraction = 0;
    return;
  }
  const canCharge = fireMode('melee') === 'charge';
  const chargeTime = meleeChargeTime();
  if (player.meleeBuffer) {
    player.meleeBuffer.timer -= dt;
    if (player.fireCooldown <= 0) {
      const { charged } = player.meleeBuffer;
      player.meleeBuffer = null;
      performMeleeAttack(charged);
    } else if (player.meleeBuffer.timer <= 0) {
      player.meleeBuffer = null;
    }
  }
  if (meleeInputHeld()) {
    updateTouchAimFacing();
    if (!canCharge) {
      player.meleeCharge = 0;
      if (player.fireCooldown <= 0) performMeleeAttack(false);
    } else {
      const before = player.meleeCharge;
      player.meleeCharge += dt;
      if (before < chargeTime && player.meleeCharge >= chargeTime) {
        playSound('system/click.ogg', 0.25);
        addParticles(player.x, attackOriginY(), elementAccent('#fff2a0'), 12, 120);
      }
    }
  } else if (player.meleeCharge > 0) {
    const charged = player.meleeCharge >= chargeTime;
    player.meleeCharge = 0;
    if (player.fireCooldown > 0) player.meleeBuffer = { charged, timer: 0.18 };
    else performMeleeAttack(charged);
  }
  player.chargeFraction = canCharge ? clamp(player.meleeCharge / chargeTime, 0, 1) : 0;
}

function performMeleeAttack(charged) {
  if (mode !== 'playing' || player.fireCooldown > 0) return;
  const aimAngle = currentAimAngle();
  const baseAngle = aimAngle;
  player.lookX = Math.cos(aimAngle);
  player.lookY = Math.sin(aimAngle);
  player.attackPulse = 0.14;
  player.attackAnimationStyle = 'hand';
  player.attackAnimationTimer = 0.32;
  const flurry = activeWeaponMod('melee')?.id === 'mod-flurry';
  const flurryCooldown = flurry ? FLURRY_COOLDOWN_SCALE : 1;
  const daggerCooldown = meleeWeapons.has('daggers') ? DAGGER_COOLDOWN_SCALE : 1;
  const meleeRate = branchEffects('melee').rate * weaponShape('melee').rate;
  const normalCooldown = Math.max(0.5, (nativeStyle() === 'melee' ? character.fireDelay || 0.3 : 0.3) * FIRE_RATE_SCALE * 2.4) *
    flurryCooldown * daggerCooldown * meleeRate / (characterProfile().meleeRate * (styleSynergy('melee') && flurry ? 1.2 : 1));
  const normalScale = flurry ? 1.0 : MELEE_BASE_SCALE;
  // A charged swing deals the damage of every normal swing it replaces (hold time plus recovery), so DPS stays equal.
  const chargedScale = normalScale * clamp((meleeChargeTime() + normalCooldown * 1.3) / normalCooldown, 1, MAX_CHARGE_SHOTS);
  performMeleeSwing(baseAngle, charged ? chargedScale : normalScale, charged);
  if (charged && !offhandContext) {
    player.swordParryTimer = Math.max(player.swordParryTimer, 0.38);
    player.swordParryRadius = 92 * 1.25;
    player.swordParryFlash = Math.max(player.swordParryFlash, 0.24);
  }
  // Heavy, deliberate swings (Diablo-style); only Flurry Gauntlets speed them up.
  player.fireCooldown = Math.max(0.5, (nativeStyle() === 'melee' ? character.fireDelay || 0.3 : 0.3) * FIRE_RATE_SCALE * 2.4) *
    (charged ? 1.3 : flurryCooldown) * daggerCooldown * meleeRate / (characterProfile().meleeRate * (styleSynergy('melee') && flurry ? 1.2 : 1));
  recordStyleUse('melee', player.fireCooldown);
  if (!offhandContext) recordPlaystyle('melee', charged);
  playSound('weapons/barehands/hit1.ogg', 0.2);
}

function bowChargeTime() {
  return BOW_CHARGE_TIME / (activeWeaponMod('bow')?.id === 'mod-draw' ? ITEM_TUNING.chargeSpeed : 1) /
    branchEffects('bow').chargeSpeed;
}

function updateBowInput(dt) {
  const canDraw = fireMode('bow') === 'charge';
  const drawTime = bowChargeTime();
  if (player.bowBuffer > 0) {
    player.bowBuffer -= dt;
    if (player.fireCooldown <= 0) {
      player.bowBuffer = 0;
      shoot({ quick: true });
    }
  }
  if (meleeInputHeld()) {
    updateTouchAimFacing();
    if (!canDraw) {
      player.bowHold = 0;
      player.chargeFraction = 0;
      if (player.fireCooldown <= 0) shoot({ quick: true });
      return;
    }
    const pressed = !player.bowHold;
    player.bowHold = (player.bowHold || 0) + dt;
    if (pressed) {
      if (player.fireCooldown <= 0) shoot({ quick: true });
      else player.bowBuffer = 0.15;
    }
    player.chargeFraction = clamp((player.bowHold - BOW_TAP_WINDOW) / drawTime, 0, 1);
  } else {
    const charge = canDraw ? clamp(((player.bowHold || 0) - BOW_TAP_WINDOW) / drawTime, 0, 1) : 0;
    if (charge >= 0.3) shoot({ charge });
    player.bowHold = 0;
    player.chargeFraction = 0;
  }
}

function updateMagicInput(dt) {
  updateTouchAimFacing();
  if (fireMode('magic') !== 'charge') {
    player.magicHold = 0;
    player.chargeFraction = 0;
    if (meleeInputHeld()) shoot();
    return;
  }
  const chargeTime = 0.9 / branchEffects('magic').chargeSpeed;
  if (meleeInputHeld()) {
    player.magicHold = (player.magicHold || 0) + dt;
    player.chargeFraction = clamp(player.magicHold / chargeTime, 0, 1);
  } else {
    const charge = clamp((player.magicHold || 0) / chargeTime, 0, 1);
    player.magicHold = 0;
    player.chargeFraction = 0;
    if (charge >= 0.25) shoot({ magicCharge: charge });
  }
}

function updateChargeBeamProjectile(projectile, dt) {
  projectile.ttl -= dt;
  projectile.beamExplosionTimer = Math.max(0, (projectile.beamExplosionTimer || 0) - dt);
  projectile.beamHitTimers ||= new Map();
  for (const [enemy, timer] of projectile.beamHitTimers) {
    const nextTimer = timer - dt;
    if (nextTimer <= 0 || !enemies.includes(enemy)) projectile.beamHitTimers.delete(enemy);
    else projectile.beamHitTimers.set(enemy, nextTimer);
  }

  const start = { x: projectile.originX, y: projectile.originY };
  const dx = projectile.vx;
  const dy = projectile.vy;
  let length = projectile.beamRange;
  if (dx > 0) length = Math.min(length, (ROOM_W - ROOM_WALL_THICKNESS - start.x) / dx);
  else if (dx < 0) length = Math.min(length, (ROOM_WALL_THICKNESS - start.x) / dx);
  if (dy > 0) length = Math.min(length, (ROOM_H - ROOM_WALL_THICKNESS - start.y) / dy);
  else if (dy < 0) length = Math.min(length, (ROOM_WALL_THICKNESS - start.y) / dy);
  length = Math.max(0, length);

  let obstacle = null;
  let obstacleDistance = length;
  for (const candidate of breakables) {
    if (candidate.broken) continue;
    const along = (candidate.x - start.x) * dx + (candidate.y - start.y) * dy;
    if (along <= 0 || along >= obstacleDistance) continue;
    const nearest = { x: start.x + dx * along, y: start.y + dy * along };
    if (distanceBetween(candidate, nearest) <= candidate.radius + projectile.beamWidth * 0.5) {
      obstacle = candidate;
      obstacleDistance = Math.max(0, along - candidate.radius);
    }
  }

  const end = { x: start.x + dx * obstacleDistance, y: start.y + dy * obstacleDistance };
  projectile.beamEndX = end.x;
  projectile.beamEndY = end.y;
  projectile.beamImpact = null;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.manaRift) continue;
    const target = enemyAttackTarget(enemy);
    const along = (target.x - start.x) * dx + (target.y - start.y) * dy;
    if (along <= 0 || along > obstacleDistance) continue;
    const nearest = { x: start.x + dx * along, y: start.y + dy * along };
    if (distanceBetween(target, nearest) > target.radius + projectile.beamWidth * 0.5) continue;
    if (!projectile.beamImpact || along < projectile.beamImpact.distance) {
      projectile.beamImpact = { enemy, distance: along };
    }
  }

  if (projectile.beamImpact) {
    const { enemy, distance } = projectile.beamImpact;
    const impactDistance = Math.max(0, distance - enemy.radius * 0.4);
    projectile.beamEndX = start.x + dx * impactDistance;
    projectile.beamEndY = start.y + dy * impactDistance;
    if (!projectile.explosionTriggered) {
      projectile.explosionTriggered = true;
      projectile.x = enemy.x;
      projectile.y = enemy.y;
      projectile.beamExplosionX = enemy.x;
      projectile.beamExplosionY = enemy.y;
      projectile.beamExplosionTimer = 0.18;
      applyMorphLanding(projectile, enemy);
      addParticles(enemy.x, enemy.y, projectile.color, 22, 160);
    }
  }

  const beamEnd = { x: projectile.beamEndX, y: projectile.beamEndY };
  for (const enemy of [...enemies]) {
    if (enemy.hp <= 0 || enemy.manaRift) continue;
    const target = enemyAttackTarget(enemy);
    if (distanceToSegment(target, start, beamEnd) > target.radius + projectile.beamWidth * 0.5) continue;
    if (projectile.beamHitTimers.has(enemy)) continue;
    const damage = Math.max(1, Math.round(projectile.damage * 0.28));
    damageEnemy(enemy, damage, start.x, start.y, false, true);
    projectile.beamHitTimers.set(enemy, 0.22);
    addParticles(enemy.x, enemy.y, projectile.color, 4, 55);
  }
  if (obstacle && projectile.beamObstacleHit !== obstacle) {
    projectile.beamObstacleHit = obstacle;
    if (obstacle.type !== 'solid') damageObstacle(obstacle, 1, 'projectile');
  }
  return projectile.ttl <= 0;
}

function shoot(options = null) {
  if (mode !== 'playing') return;
  const style = currentAttackStyle();
  // Melee swings are driven by updateMeleeInput so shooting and swinging never overlap.
  if (style === 'melee') return;
  // Bow shots come from updateBowInput: tap for a quick arrow, hold for a charged one.
  if (style === 'bow' && !options) return;
  const learnedStyles = [style];
  const rangedStyles = learnedStyles;
  const attackDelay = weapon.fireDelay * (style === nativeStyle() ? (character.fireDelay || 0.23) / 0.23 : 1);
  const bowCharge = style === 'bow' ? options?.charge || 0 : 0;
  const magicCharge = style === 'magic' ? options?.magicCharge || 0 : 0;
  const tripleBow = style === 'bow' && !bowCharge && (fireMode('bow') === 'triple' || branchEffects('bow').triple);
  if (player.fireCooldown > 0 && (!bowCharge || magicCharge)) return;
  const mod = activeWeaponMod(style);
  const modId = mod?.id;
  const fx = branchEffects(style);
  const shape = weaponShape(style);
  // A charged kunai stays a thrown blade: a stream of kunai one after another instead of the bow's light beam.
  const kunaiStream = style === 'bow' && bowCharge >= 0.3 && shape.variant === 'kunai';
  const chargedBowBeam = style === 'bow' && bowCharge >= 0.3 && !kunaiStream;
  const bowPierce = modId === 'mod-pierce';
  const rapidQuiver = modId === 'mod-quiver';
  const chainCount = (modId === 'mod-chain' || modId === 'mod-storm-arrows' ? 2 : 0) + fx.chain;
  const modExplode = Math.max(modId === 'mod-splash' ? 58 : 0, fx.explode);
  const modDrop = modId === 'mod-lingering' ? 'long' : fx.linger;
  const profile = characterProfile();
  const synergy = styleSynergy(style);
  if (!styleUnlocked(style)) return;
  const styleDamage = (style === 'magic' ? profile.magic : style === 'bow' ? profile.bow : 1) *
    (synergy ? 1.15 : 1) * fx.damage * shape.damage;
  const normalInterval = attackDelay * FIRE_RATE_SCALE / (style === 'bow' ? profile.bowRate * (synergy ? 1.15 : 1) : 1);
  const chargeStrength = bowCharge || magicCharge;
  const holdSeconds = bowCharge ? BOW_TAP_WINDOW + bowCharge * bowChargeTime() : magicCharge * 0.9;
  const chargeMul = bowCharge || magicCharge ? clamp((holdSeconds + normalInterval) / normalInterval, 1, MAX_CHARGE_SHOTS) : 1;
  const chargedImpactBonus = chargeStrength > 0 ? 1 + chargeStrength * 0.75 : 1;
  const bowDamageMul = (style === 'magic' ? (magicCharge ? chargeMul * (1 + magicCharge * 3.5) : 1) : style !== 'bow' ? 1 : bowCharge ? chargeMul : rapidQuiver ? ITEM_TUNING.quiverDamage : 1) *
    chargedImpactBonus * styleDamage *
    (tripleBow ? 0.6 : 1);
  const bowDelayMul = (style !== 'bow' ? 1 : bowCharge ? 1 : rapidQuiver ? 1 / ITEM_TUNING.quiverFireRate : 1) * (tripleBow ? 1.35 : 1) /
    (style === 'bow' ? profile.bowRate * (synergy ? 1.15 : 1) : 1);
  if (style === 'magic' && character?.className === 'Sporeling') {
    player.attackPulse = 0.14;
    player.attackAnimationStyle = 'hand';
    player.attackAnimationTimer = 0.32;
    launchSporePod(currentAimAngle());
    player.fireCooldown = attackDelay * FIRE_RATE_SCALE * 2.4;
    return;
  }
  player.attackPulse = 0.14;
  player.attackAnimationStyle = style === 'bow' && shape.variant !== 'kunai' ? 'bow' : 'hand';
  player.attackAnimationTimer = player.attackAnimationStyle === 'bow' ? 0.4 : 0.32;
  const aimAngle = currentAimAngle();
  const baseAngle = aimAngle;
  const attackOriginY = player.y - 34;
  player.lookX = Math.cos(aimAngle);
  player.lookY = Math.sin(aimAngle);
  const morph = activeAttackMorph();
  const orderedStyles = [...rangedStyles].sort((first, second) =>
    Number(second === activeCombatStyle) - Number(first === activeCombatStyle));
  let volleyBudget = MAX_PLAYER_VOLLEY;
  for (const style of orderedStyles) {
    if (volleyBudget <= 0) break;
    const styleOffset = rangedStyles.length > 1 && style !== activeCombatStyle
      ? style === 'magic' ? -0.08 : 0.08
      : 0;
    // Every weapon carries the run's element; Spellstring adds a burst where arrows land.
    const element = getActiveAttackElement();
    const spellstringBurst = style === 'bow' && Boolean(element) && confluenceFusionActive('spellstring');
    const shotProfile = styleShotProfile(style);
    // Prism fans out by default; only a non-water element fuses a magic fan into one heavy shot.
    const fusedElementalShot = style !== 'bow' && !morph.surround && shotProfile.prism && Boolean(element) &&
      element !== 'bubble';
    const baseShots = (tripleBow ? Math.max(3, shotProfile.count) : shotProfile.count) + fx.shots;
    // Branch shots share the volley's damage: each added shot is worth a bit under half of one.
    const branchShotScale = 1 / (1 + fx.shots * 0.55);
    const shotCount = Math.min(morph.surround ? 4 : fusedElementalShot ? 1 : baseShots, volleyBudget);
    volleyBudget -= shotCount;
    const spread = shotCount === 1 ? 0 : shotCount > 3 ? 0.13 : 0.16;
    for (let shot = 0; shot < shotCount; shot += 1) {
      const angle = morph.surround
        ? baseAngle + styleOffset + shot * Math.PI / 2
        : baseAngle + styleOffset + (shot - (shotCount - 1) / 2) * spread;
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      const damageMultiplier = fusedElementalShot
        ? shotProfile.damage * shotProfile.count * 1.6 / PRISM_TOTAL_DAMAGE
        : shotProfile.damage * (morph.surround ? 1 : branchShotScale);
      const arrowSize = (style === 'bow' ? clamp(Math.sqrt(bowDamageMul), 0.7, 1.4) : 1) * shape.size;
      const launchSpeed = weapon.projectileSpeed * shape.speed;
      const shotProjectile = {
        x: player.x + vx * 18,
        y: attackOriginY + vy * 18,
        vx: vx * launchSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul * (bowCharge ? 1.35 : 1),
        vy: vy * launchSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul * (bowCharge ? 1.35 : 1),
        radius: style === 'magic' && magicCharge >= 0.25
          ? Math.max(6 * weapon.tearSize * morph.sizeMul * shape.size, player.radius * 0.65 * magicCharge)
          : 6 * weapon.tearSize * arrowSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul * (bowCharge ? 1.1 + bowCharge * 0.2 : 1) * (magicCharge ? 1.1 + magicCharge * 0.2 : 1),
        size: weapon.tearSize * arrowSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul *
          (bowCharge ? 1.1 + bowCharge * 0.2 : 1) * (magicCharge ? 1.1 + magicCharge * 0.65 : 1),
        color: element ? magicElementPalette[element] : style !== 'bow' && morph.color ? morph.color
          : style === 'bow' ? '#d8b577' : (shotCount > 1 ? combatPalette.volley : combatPalette.arcane),
        type: style === 'bow' ? 'arrow' : 'elemental',
        charged: bowCharge > 0,
        element,
        magicCluster: style === 'magic' && itemActive('spore-bloom', 'magic'),
        glow: null,
        damage: Math.max(1, Math.round((player.damage + weapon.damageBonus) * damageMultiplier * morph.damageMul * bowDamageMul)),
        ttl: chargedBowBeam ? 0.65 + bowCharge * 0.85 : 0.5 * weapon.rangeMultiplier * (bowCharge ? 1.4 : 1) * shape.range,
        weaponVariant: shape.variant,
        homing: shape.homing || 0,
        dropCurve: bowCharge ? 3.2 : magicCharge ? 3 : undefined,
        piercesWalls: weapon.rangeLevel >= 3,
        fused: fusedElementalShot,
        shape: style === 'bow' ? null : morph.shape,
        pulse: morph.pulse,
        drop: modDrop || morph.drop,
        explode: Math.max(morph.explode, magicCharge >= 0.25 ? 54 : 0, modExplode, spellstringBurst ? 30 : 0),
        slowOnHit: morph.slowOnHit,
        pierce: (style === 'bow' ? (bowPierce ? 9 : bowCharge ? 3 : 0) : magicCharge >= 0.5 ? 3 : 0) + fx.pierce,
        chain: chainCount,
        trailTimer: 0,
      };
      if (chargedBowBeam) {
        shotProjectile.type = 'charge-beam';
        shotProjectile.originX = shotProjectile.x;
        shotProjectile.originY = shotProjectile.y;
        shotProjectile.vx = vx;
        shotProjectile.vy = vy;
        shotProjectile.beamRange = 760 + bowCharge * 400;
        shotProjectile.beamWidth = 9 + bowCharge * 5;
        shotProjectile.beamHitTimers = new Map();
        shotProjectile.explode = Math.max(54, morph.explode, modExplode);
        shotProjectile.piercesWalls = false;
      }
      if (kunaiStream) {
        const count = kunaiStreamCount(bowCharge);
        shotProjectile.damage = Math.max(1, Math.round(shotProjectile.damage * KUNAI_STREAM_DAMAGE / count));
        shotProjectile.pierce = (bowPierce ? 9 : 1) + fx.pierce;
        if (shot === 0) queueKunaiStream(shotProjectile, count - 1, launchSpeed * 1.35);
      }
      spawnPlayerProjectile(style === 'magic' ? prepareWildMagicShot(shotProjectile) : shotProjectile);
    }
  }
  player.fireCooldown = attackDelay * morph.delayMul * FIRE_RATE_SCALE * bowDelayMul * fx.rate * shape.rate;
  recordStyleUse(style, player.fireCooldown);
  if (!offhandContext) recordPlaystyle(style, bowCharge >= 0.3 || magicCharge >= 0.25);
  if (activeCombatStyle === 'bow' && rangedStyles.includes('bow')) {
    playSound('weapons/bow/shoot.ogg', 0.22);
  } else if (activeCombatStyle === 'magic' && rangedStyles.includes('magic')) {
    playSound(Math.random() < 0.5 ? 'weapons/piouslayer/hit1.ogg' : 'weapons/piouslayer/hit2.ogg', 0.1);
  } else {
    playSound('weapons/barehands/hit1.ogg', 0.2);
  }
  fireCompanionsWithPlayer(baseAngle, rangedStyles);
}

function fireCompanionsWithPlayer(angle, styles) {
  for (const companion of companions) {
    if (companion.hp <= 0) continue;
    const colors = { ratto: '#f0c884', croc: '#9ce28f', wisp: '#c8a6ff' };
    for (const style of styles) {
      spawnPlayerProjectile({
        x: companion.x,
        y: companion.y,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        radius: 5,
        size: 0.8,
        color: style === 'bow' ? '#d8b577' : colors[companion.kind] || companion.color || '#9ce28f',
        type: style === 'bow' ? 'arrow' : 'tear',
        damage: Math.max(1, player.damage),
        ttl: 0.47 * weapon.rangeMultiplier,
        trailTimer: 0,
        owner: 'companion',
      });
    }
  }
}

// Swap flips the main and off hand. Without Dual Grip the off hand is simply the sheathed second weapon.
function swapWeaponHands() {
  if (weaponSwapCooldown > 0 || !weaponHands.off || weaponHands.off === weaponHands.main) return false;
  weaponSwapCooldown = WEAPON_SWAP_COOLDOWN;
  applyWeaponHands({ main: weaponHands.off, off: weaponHands.main });
  player.meleeCharge = 0;
  player.bowHold = 0;
  player.chargeFraction = 0;
  updateHud();
  return true;
}

function cycleCombatStyle() {
  swapWeaponHands();
}

// The number keys pick a family: the one in the off hand swaps in; any other has to be set in Build first.
function selectCombatStyle(style) {
  if (style === activeCombatStyle || weaponSwapCooldown > 0) return;
  if (weaponById(weaponHands.off)?.family === style) {
    swapWeaponHands();
    return;
  }
  if (typeof showMessage === 'function') showMessage(`Set a ${BRANCH_STYLE_NAMES[style] || style} weapon in a hand from Build first.`, 2);
}

function addParticles(x, y, color, count = 4, speed = 80) {
  const room = (quality.low ? MAX_PARTICLES_LOW : MAX_PARTICLES) - particles.length;
  count = Math.min(quality.low ? Math.ceil(count / 2) : count, Math.max(0, room));
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * speed;
    particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      color,
      radius: 1.5 + Math.random() * 2.5,
      ttl: 0.2 + Math.random() * 0.25,
      maxTtl: 0.45,
    });
  }
}

function placeBomb() {
  if (mode !== 'playing' || bombsHeld <= 0 ||
    bombs.some((bomb) => bomb.owner !== 'enemy' && bomb.fuse > 0)) return;
  bombsHeld -= 1;
  bombs.push({ owner: 'player', x: player.x, y: player.y, fuse: 1.7, fuseTotal: 1.7, radius: 110 });
  playSound('system/click.ogg', 0.35);
  updateHud();
}

function strikeBombWithProjectile(projectile, dt = 0) {
  const startX = projectile.previousX ?? projectile.x - projectile.vx * dt;
  const startY = projectile.previousY ?? projectile.y - projectile.vy * dt;
  const travelX = projectile.x - startX;
  const travelY = projectile.y - startY;
  const lengthSquared = travelX * travelX + travelY * travelY;
  for (const bomb of bombs) {
    if (bomb.flightTimer > 0 || bomb.fuse <= 0) continue;
    const t = lengthSquared > 0
      ? clamp(((bomb.x - startX) * travelX + (bomb.y - startY) * travelY) / lengthSquared, 0, 1) : 0;
    if (Math.hypot(startX + travelX * t - bomb.x, startY + travelY * t - bomb.y) >
      12 + (projectile.radius || 0)) continue;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    if (speed === 0) continue;
    const impulse = clamp(speed * 0.65, 160, 420);
    bomb.vx = (bomb.vx || 0) + projectile.vx / speed * impulse;
    bomb.vy = (bomb.vy || 0) + projectile.vy / speed * impulse;
    const bombSpeed = Math.hypot(bomb.vx, bomb.vy);
    if (bombSpeed > 520) {
      bomb.vx *= 520 / bombSpeed;
      bomb.vy *= 520 / bombSpeed;
    }
    return true;
  }
  return false;
}

function updateBombMotion(bomb, dt) {
  const radius = 12;
  let vx = bomb.vx || 0;
  let vy = bomb.vy || 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) * dt / 6));
  for (let step = 0; step < steps; step += 1) {
    bomb.x += vx * dt / steps;
    bomb.y += vy * dt / steps;
    const min = ROOM_WALL_THICKNESS + radius;
    if (bomb.x < min || bomb.x > ROOM_W - min) {
      bomb.x = clamp(bomb.x, min, ROOM_W - min);
      vx *= -0.75;
    }
    if (bomb.y < min || bomb.y > ROOM_H - min) {
      bomb.y = clamp(bomb.y, min, ROOM_H - min);
      vy *= -0.75;
    }
    for (const obstacle of breakables) {
      if (obstacle.broken) continue;
      const dx = bomb.x - obstacle.x;
      const dy = bomb.y - obstacle.y;
      const gap = Math.hypot(dx, dy);
      const minimum = radius + obstacle.radius;
      if (gap >= minimum) continue;
      const nx = gap > 0 ? dx / gap : 1;
      const ny = gap > 0 ? dy / gap : 0;
      bomb.x = obstacle.x + nx * minimum;
      bomb.y = obstacle.y + ny * minimum;
      const into = vx * nx + vy * ny;
      if (into < 0) {
        vx -= 1.75 * into * nx;
        vy -= 1.75 * into * ny;
      }
    }
  }
  const friction = Math.exp(-2.2 * dt);
  bomb.vx = Math.abs(vx) < 3 ? 0 : vx * friction;
  bomb.vy = Math.abs(vy) < 3 ? 0 : vy * friction;
}

// A one-shot effect animation (effectart.js) that lives in the particle list, so it moves, fades and clears with
// the room like any particle; `size` is its drawn width in pixels.
function addEffectBurst(x, y, effect, size, ttl, color = null) {
  particles.push({ x, y, vx: 0, vy: 0, effect, size, color, ttl, maxTtl: ttl, radius: 0 });
}

// The stages of a bomb's aftermath `age` seconds after the blast, each 0..1: a short blast flash first, then fire that
// burns out, smoke that thickens then drifts off, and char on the ground that lasts and fades late. Only the fire
// hurts (updateBombScorches).
function bombAftermath(age) {
  const ramp = (start, length) => Math.max(0, Math.min(1, (age - start) / length));
  return {
    flash: age < 0.12 ? 1 - age / 0.12 : 0,
    fire: ramp(0.05, 0.15) * (1 - ramp(1.8, 0.8)),
    smoke: ramp(0.15, 0.5) * (1 - ramp(2.5, 2)),
    char: ramp(0, 0.1) * (1 - ramp(14, 4)),
  };
}

// The fire covers the flattened patch the flames are drawn over (gameui.js drawBombAftermath).
function inBombFire(scorch, target) {
  const dx = (target.x - scorch.x) / (scorch.radius * 0.5 + (target.radius || 0));
  const dy = (target.y - scorch.y) / (scorch.radius * 0.32 + (target.radius || 0));
  return dx * dx + dy * dy <= 1;
}

// While the fire is well alight it burns whoever its blast could hurt: the player always, and enemies when the
// bomb was the player's. Damage matches fire hazards: half a heart every 0.8 s, 1 a tick to enemies with a burn.
function updateBombScorches(dt) {
  for (let index = bombScorches.length - 1; index >= 0; index -= 1) {
    const scorch = bombScorches[index];
    if (!scorch) continue;
    scorch.age += dt;
    scorch.playerBurnCooldown = (scorch.playerBurnCooldown || 0) - dt;
    scorch.enemyBurnCooldown = (scorch.enemyBurnCooldown || 0) - dt;
    if (bombAftermath(scorch.age).fire >= 0.4) {
      if (scorch.playerBurnCooldown <= 0 && inBombFire(scorch, player)) {
        scorch.playerBurnCooldown = 0.8;
        damagePlayer(0.5, scorch);
      }
      if (scorch.owner !== 'enemy' && scorch.enemyBurnCooldown <= 0) {
        scorch.enemyBurnCooldown = 0.5;
        for (const enemy of [...enemies]) {
          if (enemy.hp <= 0 || !inBombFire(scorch, enemy)) continue;
          damageEnemy(enemy, 1, scorch.x, scorch.y, false, false);
          enemy.burnTimer = Math.max(enemy.burnTimer || 0, 1.2);
        }
      }
    }
    if (scorch.age >= 18 && bombScorches[index] === scorch) bombScorches.splice(index, 1);
  }
}

function explodeBomb(bomb) {
  addEffectBurst(bomb.x, bomb.y, 'blast', bomb.radius * 1.6, 0.6);
  if (bombScorches.length >= 6) bombScorches.shift();
  // The blast itself already hit, so the fire waits a beat before its first burn.
  bombScorches.push({ x: bomb.x, y: bomb.y, radius: bomb.radius, owner: bomb.owner, age: 0,
    seed: Math.random() * 1000, playerBurnCooldown: 0.6, enemyBurnCooldown: 0.3 });
  triggerCameraShake('bomb');
  playSound('system/boom.ogg', bomb.owner === 'enemy' ? 0.32 : 0.55);
  const hurtByBlast = (target) => distanceBetween(bomb, target) <= bomb.radius && hasLineOfSight(bomb, target);
  if (hurtByBlast(player)) damagePlayer(0.5, bomb);
  if (bomb.owner !== 'enemy') {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const target = enemies[i];
      if (!hurtByBlast(target)) continue;
      if (target.boss || target.miniBoss) {
        const blast = Math.min(Math.ceil(target.maxHp * 0.08), target.hp - 1);
        if (blast > 0) damageEnemy(target, blast, bomb.x, bomb.y, true);
      } else {
        damageEnemy(target, Math.max(12, (player.damage + weapon.damageBonus) * 4), bomb.x, bomb.y, true);
      }
    }
    triggerSporeBloom(bomb);
  }
  for (let i = breakables.length - 1; i >= 0; i -= 1) {
    if (!breakables[i].broken && distanceBetween(bomb, breakables[i]) <= bomb.radius) {
      damageObstacle(breakables[i], breakables[i].hp, 'bomb');
    }
  }
  updateHud();
  const secret = bomb.owner !== 'enemy' ? currentRoom.secretExit : null;
  if (secret) {
    const direction = directions.find((item) => item.name === secret.direction);
    const wallPoint = {
      x: direction.name === 'left' ? 24 : direction.name === 'right' ? ROOM_W - 24 : bomb.x,
      y: direction.name === 'up' ? 24 : direction.name === 'down' ? ROOM_H - 24 : bomb.y,
    };
    const alongWall = direction.dx === 0
      ? Math.abs(bomb.x - ROOM_W / 2) < 78
      : Math.abs(bomb.y - ROOM_H / 2) < 78;
    if (secret.room.hidden && alongWall && distanceBetween(bomb, wallPoint) < bomb.radius + 60) {
      secret.room.hidden = false;
      recordStory('A hidden passage', 'A crack in the cave wall reveals a concealed chamber. A whispering voice seems to come through, like a wind drafting past.');
      const extraKeyFound = !secret.keyDropped && Math.random() < (secret.room.extraKeyChance || 0);
      if (extraKeyFound) {
        pickups.push({ x: bomb.x, y: bomb.y, kind: 'key' });
        secret.keyDropped = true;
      }
      showMessage(
        extraKeyFound
          ? 'The cracked wall gives way. You found a key beside the hidden passage.'
          : 'The cracked wall gives way, revealing a hidden passage.',
        4,
      );
    }
  }
}

function createCompanion(item) {
  const kind = item.companion;
  const source = createEnemy(kind, player.x, player.y);
  return {
    kind,
    color: source.color,
    x: player.x + (Math.random() - 0.5) * 20,
    y: player.y + 24,
    attackCooldown: 0.5 + Math.random(),
    followAngle: Math.random() * Math.PI * 2,
    hp: 2,
    maxHp: 2,
    respawnTimer: 0,
    hitCooldown: 0,
    enemyCooldowns: new Map(),
  };
}

// Mana Burst keeps pace with enemy health: 8 on floor 1, plus 4 for every later floor (40 on floor 9).
// strongestPlayerSingleHit() deliberately keeps its flat 8, so holding one does not raise miniboss HP.
function manaBurstDamage() {
  return 8 + 4 * Math.max(0, currentFloor - 1);
}

function useConsumable() {
  const available = consumables.filter((item) => item.count > 0);
  if (available.length === 0) {
    showMessage('No consumables ready. Smash scenery to find one.', 1.8);
    return;
  }
  for (const item of available) {
    if (item.id === 'mana-tonic' && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 2);
    } else if (item.id === 'bomb-bundle') {
      bombsHeld += 2;
    } else if (item.id === 'mana-burst' && enemies.length > 0) {
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const enemy = enemies[i];
        addParticles(enemy.x, enemy.y, '#9a7bff', 10, 130);
        damageEnemy(enemy, manaBurstDamage(), player.x, player.y);
      }
    } else {
      continue;
    }
    item.count -= 1;
    updateHud();
    showMessage(`${item.name} used.`, 2.2);
    return;
  }
  showMessage('None of your consumables can help right now.', 2);
}

// Invulnerability granted by a dash and by taking a hit. Enemy timings in ADAPTIVE_AI_TUNING are checked against
// these (see docs/BALANCE.md), so change them here only together with the tuning rules.
const DASH_INVULN_SECONDS = 0.24;
const PLAYER_HIT_INVULN_SECONDS = 0.9;

// Walking speed before temporary slows: what an enemy telegraph has to out-range to require a dash.
function baseGroundSpeed() {
  return player.speed * curioMultiplier('speed') * (character?.className === 'Pilgrim' ? 1.12 : 1) * confluenceSpeedMultiplier();
}

function startDash() {
  if (mode !== 'playing' || dashCooldown > 0 || dashTimer > 0) return;
  if (currentRoom && (currentRoom.type === 'shop' || currentRoom.type === 'bank')) return;
  const dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0) + gamepadInput.moveX + touchInput.moveX;
  const dy = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0) + gamepadInput.moveY + touchInput.moveY;
  const length = Math.hypot(dx, dy);
  dashVector = length > 0.1 ? { x: dx / length, y: dy / length } : { x: player.lookX, y: player.lookY };
  dashTimer = 0.16;
  dashCooldown = character?.className === 'Scout' ? 0.42 : 0.85;
  player.invuln = Math.max(player.invuln, DASH_INVULN_SECONDS);
  player.dashMove = null;
  player.dashHits = null;
  if (confluenceMoveOwned('earthshaker') && meleeInputHeld() && !(player.earthshakerCooldown > 0)) {
    // A short, slower leap that lands as a smash (updateConfluenceDash).
    player.dashMove = 'earthshaker';
    player.earthshakerCooldown = EARTHSHAKER_COOLDOWN;
    dashTimer = 0.3;
    player.invuln = Math.max(player.invuln, 0.42);
    if (typeof suppressHeldAttackInput === 'function') suppressHeldAttackInput();
    player.meleeCharge = 0;
    addParticles(player.x, player.y, '#b08a5a', 10, 110);
    playSound('weapons/axe/hit.ogg', 0.2);
    return;
  }
  if (confluenceMoveOwned('weapon-form')) {
    player.dashMove = 'weapon-form';
    player.dashHits = new Set();
  }
  addParticles(player.x, player.y, '#cfe8ff', 8, 90);
  playSound('weapons/bow/shoot.ogg', 0.12);
}

function useShockwave() {
  if (mode !== 'playing') return;
  if (blanksHeld <= 0) {
    showMessage('No shockwaves left. You earn one each floor.', 1.5);
    return;
  }
  blanksHeld -= 1;
  addEffectBurst(player.x, player.y - 20, 'cast', 440, 0.45, '#ffffff');
  for (const shot of enemyProjectiles) addParticles(shot.x, shot.y, '#ffffff', 4, 70);
  enemyProjectiles.length = 0;
  for (const enemy of enemies) {
    if (distanceBetween(player, enemy) > 220) continue;
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    moveEnemy(enemy, Math.cos(angle) * 40 / 0.1, Math.sin(angle) * 40 / 0.1, 0.1);
  }
  player.invuln = Math.max(player.invuln, 0.5);
  addParticles(player.x, player.y, '#ffffff', 28, 220);
  playSound('special/fanfare.ogg', 0.1);
  showMessage(`SHOCKWAVE! ${blanksHeld} left.`, 1.2);
  updateHud();
}

// ---- Confluence fusions and moves ----
const EARTHSHAKER_RADIUS = 120;
const ELEMENTAL_CALL_KINDS = {
  bubble: ['frog', 'tortuga', 'croc'], fire: ['jacko', 'scorpion'], lightning: ['wisp', 'bee', 'bluepar'],
  gas: ['slime', 'zombie'], spore: ['mouboo', 'snail'], ice: ['snowman', 'yeti', 'fluffy'],
  wind: ['piou', 'bat', 'junglefowl'], earth: ['golem', 'spider', 'ratto'],
};
const elementalSummons = [];
let elementalCallRoom = null;

// Charged kunai: the first kunai flies at once, the rest follow along wherever you aim, KUNAI_STREAM_GAP apart.
// Together they deal about what a charged bow beam would.
const KUNAI_STREAM_GAP = 0.07;
const KUNAI_STREAM_DAMAGE = 1.7;

function kunaiStreamCount(charge) {
  return 3 + Math.round(clamp((charge - 0.3) / 0.7, 0, 1) * 3);
}

function queueKunaiStream(template, remaining, speed) {
  player.kunaiStream = remaining > 0 ? { template: { ...template }, remaining, speed, timer: KUNAI_STREAM_GAP } : null;
}

function updateKunaiStream(dt) {
  const stream = player.kunaiStream;
  if (!stream) return;
  if (mode !== 'playing') return;
  stream.timer -= dt;
  while (stream.timer <= 0 && stream.remaining > 0) {
    const angle = currentAimAngle();
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    spawnPlayerProjectile({ ...stream.template, x: player.x + vx * 18, y: player.y - 34 + vy * 18,
      vx: vx * stream.speed, vy: vy * stream.speed, trailTimer: 0 });
    stream.remaining -= 1;
    stream.timer += KUNAI_STREAM_GAP;
    player.attackPulse = 0.14;
    player.attackAnimationStyle = 'hand';
    player.attackAnimationTimer = 0.32;
    playSound('weapons/bow/shoot.ogg', 0.14);
  }
  if (stream.remaining <= 0) player.kunaiStream = null;
}

// Riposte Volley: a parried shot also looses three arrows (kunai while one is held) at the nearest foes (throttled
// for parry storms).
function looseRiposteVolley(x, y, damage) {
  if (elapsed < (player.riposteVolleyReadyAt || 0)) return;
  player.riposteVolleyReadyAt = elapsed + 0.3;
  const origin = { x, y };
  const targets = enemies.filter((enemy) => enemy.hp > 0 && !enemy.manaRift && hasLineOfSight(origin, enemy))
    .sort((a, b) => distanceBetween(origin, a) - distanceBetween(origin, b)).slice(0, 3);
  const look = Math.atan2(player.lookY || 0, player.lookX || 1);
  const variant = weaponHands.main === 'kunai' || weaponHands.off === 'kunai' ? 'kunai' : null;
  for (let shot = 0; shot < 3; shot += 1) {
    const target = targets[shot % Math.max(1, targets.length)];
    const spread = targets.length >= 3 ? 0 : (shot - 1) * 0.14;
    const angle = (target ? Math.atan2(target.y - y, target.x - x) : look) + spread;
    spawnPlayerProjectile({ x, y, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, radius: 5, size: 0.9,
      color: '#f0d486', type: 'arrow', damage: Math.max(1, Math.round(damage * 0.5)), ttl: 0.8, trailTimer: 0, pierce: 0, chain: 0,
      weaponVariant: variant });
  }
  addParticles(x, y, '#f0d486', 10, 140);
}

// Spellblade: a charged swing throws a fan of five element shots.
function releaseSpellbladeWave(angle, damage) {
  const element = getActiveAttackElement();
  const color = element ? magicElementPalette[element] : combatPalette.arcane;
  const originY = attackOriginY();
  for (let shot = 0; shot < 5; shot += 1) {
    const heading = angle + (shot - 2) * 0.2;
    spawnPlayerProjectile({ x: player.x + Math.cos(heading) * 30, y: originY + Math.sin(heading) * 30,
      vx: Math.cos(heading) * 430, vy: Math.sin(heading) * 430, radius: 9, size: 1.3, color, type: 'elemental', element,
      damage: Math.max(1, Math.round(damage * 0.35)), ttl: 0.5, trailTimer: 0, pierce: 1, chain: 0 });
  }
  addParticles(player.x, originY, color, 14, 160);
}

function weaponFormDamage() {
  const family = weaponById(weaponHands.main)?.family || 'melee';
  return Math.max(1, Math.round((player.damage + weapon.damageBonus) * 1.4 * branchEffects(family).damage));
}

// Runs after the dash moves the player: Weapon Form hits each foe it passes once; Earthshaker smashes on landing.
function updateConfluenceDash(dt) {
  player.earthshakerCooldown = Math.max(0, (player.earthshakerCooldown || 0) - dt);
  player.earthshakerFlash = Math.max(0, (player.earthshakerFlash || 0) - dt);
  if (player.dashMove === 'weapon-form' && player.dashHits) {
    const element = getActiveAttackElement();
    for (const enemy of [...enemies]) {
      if (!(enemy.hp > 0) || enemy.manaRift || player.dashHits.has(enemy)) continue;
      if (distanceBetween(player, enemy) > enemy.radius + player.radius + 16) continue;
      player.dashHits.add(enemy);
      const damage = weaponFormDamage();
      if (element) {
        resolveElementalImpact({ x: enemy.x, y: enemy.y, vx: dashVector.x, vy: dashVector.y, damage, element, type: 'melee' }, enemy);
      } else damageEnemy(enemy, damage, player.x, player.y);
      addParticles(enemy.x, enemy.y, elementAccent('#fff2a0'), 8, 140);
    }
  }
  if (dashTimer > 0 || !player.dashMove) return;
  if (player.dashMove === 'earthshaker') earthshakerSmash();
  player.dashMove = null;
  player.dashHits = null;
}

function earthshakerSmash() {
  const damage = Math.max(2, Math.round((player.damage + weapon.damageBonus) * 2.4 * branchEffects('melee').damage));
  for (const enemy of [...enemies]) {
    if (!(enemy.hp > 0) || enemy.manaRift || distanceBetween(player, enemy) > EARTHSHAKER_RADIUS + enemy.radius) continue;
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    damageEnemy(enemy, damage, player.x, player.y, false, false);
    if (enemy.hp > 0) applyWeaponImpact(enemy, { knockback: 3, stun: 0.9 }, angle);
  }
  for (const obstacle of [...breakables]) {
    if (!obstacle.broken && distanceBetween(player, obstacle) <= EARTHSHAKER_RADIUS + obstacle.radius) damageObstacle(obstacle, 2, 'melee');
  }
  addEffectBurst(player.x, player.y, 'cast', EARTHSHAKER_RADIUS * 2.2, 0.4, '#c8a070');
  addParticles(player.x, player.y, '#8a6a43', 26, 220);
  addParticles(player.x, player.y, elementAccent('#d8c49a'), 12, 160);
  player.earthshakerFlash = 0.45;
  triggerHitStop(0.1);
  triggerCameraShake('groundPound');
  playSound('weapons/axe/hit.ogg', 0.4);
}

function elementalSummonDamage() {
  return Math.max(2, Math.round((player.damage + weapon.damageBonus) * 0.7));
}

function summonElementalAllies(element) {
  const pool = (ELEMENTAL_CALL_KINDS[element] || [])
    .filter((kind) => typeof monsterSprites === 'undefined' || monsterSprites[kind]);
  if (!pool.length) return;
  const color = magicElementPalette[element] || '#ffffff';
  for (let index = 0; index < 2; index += 1) {
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const angle = index * Math.PI + Math.random();
    const x = clamp(player.x + Math.cos(angle) * 44, 40, ROOM_W - 40);
    const y = clamp(player.y + Math.sin(angle) * 34, 40, ROOM_H - 40);
    elementalSummons.push({ kind, element, color, x, y, hp: 1, maxHp: 1, ttl: 18, attackCooldown: 0.5 });
    addParticles(x, y, color, 16, 120);
  }
  showMessage(`Elemental Call: ${magicElementName(element)} answers.`, 1.6);
}

// Elemental Call: two creatures of the run's element join each fight, chase the nearest foe and fade once it is won.
function updateElementalCall(dt) {
  if (elementalCallRoom !== currentRoom) {
    elementalSummons.length = 0;
    elementalCallRoom = currentRoom;
  }
  const foes = enemies.filter((enemy) => enemy.hp > 0 && !enemy.manaRift);
  if (!foes.length) {
    for (const summon of elementalSummons) addParticles(summon.x, summon.y, summon.color, 10, 90);
    elementalSummons.length = 0;
    return;
  }
  const element = getActiveAttackElement();
  if (currentRoom && !currentRoom.elementalCalled && element && confluenceMoveOwned('elemental-call')) {
    currentRoom.elementalCalled = true;
    summonElementalAllies(element);
  }
  for (let index = elementalSummons.length - 1; index >= 0; index -= 1) {
    const summon = elementalSummons[index];
    summon.ttl -= dt;
    if (summon.ttl <= 0) {
      addParticles(summon.x, summon.y, summon.color, 10, 90);
      elementalSummons.splice(index, 1);
      continue;
    }
    let target = foes[0];
    for (const foe of foes) if (distanceBetween(summon, foe) < distanceBetween(summon, target)) target = foe;
    const dx = target.x - summon.x;
    const dy = target.y - summon.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > target.radius + 12) {
      summon.x = clamp(summon.x + dx / distance * 150 * dt, 30, ROOM_W - 30);
      summon.y = clamp(summon.y + dy / distance * 150 * dt, 30, ROOM_H - 30);
    }
    summon.attackCooldown -= dt;
    if (distance <= target.radius + 20 && summon.attackCooldown <= 0) {
      summon.attackCooldown = 0.7;
      resolveElementalImpact({ x: target.x, y: target.y, vx: dx / distance, vy: dy / distance,
        damage: elementalSummonDamage(), element: summon.element, type: 'melee' }, target);
      addParticles(target.x, target.y, summon.color, 6, 100);
    }
  }
}

// Level-ups queue a pick-1-of-3 boon, offered once the room is clear so a fight is never interrupted.
const levelBoons = [
  { id: 'swift', name: 'Swift', icon: '»', text: '+5% move speed', apply: () => { player.speed *= 1.05; } },
  { id: 'might', name: 'Might', icon: '⚔', text: '+1 damage', apply: () => { player.damage += 1; } },
  { id: 'frenzy', name: 'Frenzy', icon: '≋', text: '7% faster attacks', apply: () => { weapon.fireDelay = Math.max(0.12, weapon.fireDelay * 0.93); } },
  { id: 'vigor', name: 'Vigor', icon: '♥', text: 'Heal 1 heart', apply: () => { player.hp = Math.min(player.maxHp, player.hp + 1); } },
  { id: 'reach', name: 'Reach', icon: '↔', text: '+6% range', apply: () => { weapon.rangeMultiplier *= 1.06; } },
  { id: 'ward', name: 'Ward', icon: '◎', text: '+1 Shockwave', apply: () => { blanksHeld += 1; } },
];
let pendingBoonPicks = 0;
let boonChoices = null;
let boonFocus = 0;
let boonInputGuardUntil = 0;

function gainXp(amount) {
  if (character?.className === 'Scholar') amount *= 1.3;
  xpPoints += amount;
  addBranchXp(amount);
  while (xpPoints >= XP_PER_LEVEL(xpLevel)) {
    xpPoints -= XP_PER_LEVEL(xpLevel);
    xpLevel += 1;
    pendingBoonPicks += 1;
    streakCallout.timer = streakCallout.duration;
    streakCallout.x = player.x;
    streakCallout.y = player.y - 70;
    streakCallout.text = `LEVEL ${xpLevel}! Choose a boon`;
    addParticles(player.x, player.y, '#7ee8ff', 16, 140);
    playSound('som:alteration/levelup.ogg', 0.3);
  }
  updateHud();
}

function boonChoiceReady() {
  return pendingBoonPicks > 0 && !boonChoices && mode === 'playing' && deathTimer <= 0 && !showMap &&
    !showStoryJournal && enemies.length === 0;
}

function openBoonChoice() {
  const pool = [...levelBoons].filter((boon) => boon.id !== 'vigor' || player.hp < player.maxHp);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  boonChoices = pool.slice(0, 3);
  boonFocus = 1;
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  boonInputGuardUntil = performance.now() + 350;
  mode = 'boon';
}

function chooseBoon(index) {
  const boon = boonChoices?.[index];
  if (!boon) return false;
  boon.apply();
  pendingBoonPicks = Math.max(0, pendingBoonPicks - 1);
  boonChoices = null;
  mode = 'playing';
  suppressHeldAttackInput();
  showMessage(`${boon.name} Boon: ${boon.text}.`, 2.5);
  addParticles(player.x, player.y, '#7ee8ff', 20, 160);
  playSound('som:alteration/skillup.ogg', 0.3);
  updateHud();
  return true;
}

function fireLaserBeam(angle, damage) {
  const originX = player.x;
  const originY = player.y - 34;
  const length = 720;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (const enemy of [...enemies]) {
    const along = (enemy.x - originX) * dx + (enemy.y - 20 - originY) * dy;
    if (along < 0 || along > length) continue;
    const off = Math.abs((enemy.x - originX) * dy - (enemy.y - 20 - originY) * dx);
    if (off <= (enemy.radius || 18) + 10) damageEnemy(enemy, damage, enemy.x, enemy.y, true);
  }
  laserBeams.push({ x: originX, y: originY, dx, dy, length, timer: 0.22 });
  playSound('weapons/bow/shoot.ogg', 0.25);
}

function updateClassSignature(dt) {
  for (let i = laserBeams.length - 1; i >= 0; i -= 1) {
    laserBeams[i].timer -= dt;
    if (laserBeams[i].timer <= 0) laserBeams.splice(i, 1);
  }
  if (player.signatureCooldown > 0) player.signatureCooldown = Math.max(0, player.signatureCooldown - dt);
  for (let i = sporePods.length - 1; i >= 0; i -= 1) {
    const pod = sporePods[i];
    updateWildMagicFlight(pod, dt);
    pod.x += pod.vx * dt;
    pod.y += pod.vy * dt;
    pod.ttl -= dt;
    pod.fuse -= dt;
    const target = enemies.find((enemy) => enemy.hp > 0 && !enemy.manaRift &&
      distanceBetween(enemy, pod) < enemy.radius + pod.radius);
    const obstacle = breakables.find((rock) => !rock.broken &&
      distanceBetween(rock, pod) < rock.radius + pod.radius);
    if (target || obstacle) triggerWildMagicImpact(pod, target);
    if (target || obstacle || strikeBombWithProjectile(pod, dt) || pod.fuse <= 0 || pod.ttl <= 0) {
      burstClusterOrb(pod, 'player');
      sporePods.splice(i, 1);
    }
  }
}

function useClassSignature() {
  if (mode !== 'playing' || deathTimer > 0) return;
  const sig = classSignature();
  if (!sig?.active) return;
  if (player.signatureCooldown > 0) {
    showMessage(`${sig.label} recharging: ${Math.ceil(player.signatureCooldown)}s.`, 1);
    return;
  }
  const cls = character.className;
  const angle = currentAimAngle();
  if (cls === 'Sapper') {
    if (bombs.some((bomb) => bomb.owner !== 'enemy' && bomb.fuse > 0)) return;
    bombsHeld += 1;
    placeBomb();
  } else if (cls === 'Scribe') {
    fireLaserBeam(angle, 3 * player.damage * characterProfile().bow);
  } else if (cls === 'Keeper') {
    addParticles(player.x, player.y, '#b9ffd8', 24, 200);
    for (const other of [...enemies]) {
      if (distanceBetween(player, other) < 230) damageEnemy(other, 4, player.x, player.y);
    }
  } else if (cls === 'Sporeling') {
    launchSporePod(angle);
  }
  player.signatureCooldown = sig.cooldown;
  showMessage(`${sig.label}!`, 1);
}

function launchSporePod(angle) {
  playSound('monsters/mushroom/spawn1.ogg', 0.22);
  sporePods.push(prepareWildMagicShot({
    x: player.x, y: attackOriginY(),
    vx: Math.cos(angle) * 96, vy: Math.sin(angle) * 96,
    radius: 13, size: 1, damage: Math.max(1, player.damage * characterProfile().magic),
    color: '#d78be7', ttl: 1.65, fuse: 1.05,
  }));
  addParticles(player.x, attackOriginY(), '#d490e9', 8, 32);
}

function drawSporePods() {
  for (const pod of sporePods) {
    // TMW bubble particle inside a SoM glow, both tinted spore purple.
    const pulse = 1 + Math.sin(pod.fuse * 18) * 0.12;
    drawEffect('orbGlow', 0, pod.x, pod.y, { width: pod.radius * 3.4 * pulse, tint: '#c878df', smooth: true });
    drawEffect('sporeBubble', effectFrameAt('sporeBubble', elapsed, 10), pod.x, pod.y,
      { width: pod.radius * 2.2 * pulse, tint: '#f1c9fa' });
  }
}

function onClassKill(enemy) {
  const cls = character?.className;
  player.classKills = (player.classKills || 0) + 1;
  if (cls === 'Delver') player.fireCooldown = 0;
  if (cls === 'Herbalist') {
    for (const other of enemies) {
      if (other !== enemy && !other.boss && distanceBetween(enemy, other) < 140) {
        other.freezeTimer = Math.max(other.freezeTimer || 0, 1.2);
        addParticles(other.x, other.y, '#67d9ff', 6, 80);
      }
    }
  }
}

function drawLaserBeams() {
  for (const beam of laserBeams) {
    // A TMW glow stretched along the beam, tinted, with an untinted core.
    const fade = Math.max(0, beam.timer / 0.22);
    const endX = beam.x + beam.dx * beam.length;
    const endY = beam.y + beam.dy * beam.length;
    drawEffectBetween('glow', 0, beam.x, beam.y, endX, endY, 30 * fade + 6,
      { tint: '#ff7a9c', alpha: fade, composite: 'lighter', smooth: true });
    drawEffectBetween('glow', 0, beam.x, beam.y, endX, endY, 10 * fade + 3,
      { alpha: fade, composite: 'lighter', smooth: true });
  }
}

function castFrostNova() {
  const radius = 250;
  let affected = 0;
  for (const enemy of enemies) {
    if (distanceBetween(player, enemy) > radius) continue;
    if (enemy.boss) enemy.slowTimer = Math.max(enemy.slowTimer || 0, 3);
    else enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, 2.4);
    addParticles(enemy.x, enemy.y, '#67d9ff', 12, 110);
    affected += 1;
  }
  frostNovaCooldown = 12;
  addEffectBurst(player.x, player.y - 20, 'puff', 200, 0.5);
  addParticles(player.x, player.y, '#7be6ff', 20, 170);
  showMessage(affected ? 'Frost pulse! Nearby foes are frozen; bosses are slowed.' : 'Frost pulsed, but no foes were in range.', 2);
  saveRunState();
}

function updateAutoFrost() {
  if (mode !== 'playing' || !frostActive || !ownedItems.has('frost-rune') || frostNovaCooldown > 0) return;
  if (!enemies.some((enemy) => distanceBetween(player, enemy) < 150)) return;
  castFrostNova();
}

function triggerSporeBloom(bomb) {
  if (bomb.owner === 'enemy' || !itemActive('spore-bloom', 'magic')) return;
  burstClusterOrb({ x: bomb.x, y: bomb.y }, 'player');
}

function vibrateController(damageAmount) {
  if (typeof navigator.getGamepads !== 'function') return;
  const gamepad = Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected);
  if (!gamepad) return;
  const duration = damageAmount > 1 ? 180 : 90;
  const magnitude = damageAmount > 1 ? 0.85 : 0.48;
  try {
    if (gamepad.vibrationActuator?.playEffect) {
      gamepad.vibrationActuator.playEffect('dual-rumble', {
        duration,
        strongMagnitude: magnitude,
        weakMagnitude: magnitude * 0.65,
      }).catch(() => {});
    } else if (gamepad.hapticActuators?.[0]?.pulse) {
      gamepad.hapticActuators[0].pulse(magnitude, duration);
    }
  } catch (error) {
    return;
  }
}

// Counts down the slow-motion beat between the killing blow and the game-over screen.
let deathTimer = 0;

// Tallies for the end-of-run summary; saved with the run.
const runStats = { seconds: 0, kills: 0, guardians: 0, zenyFound: 0, lastHitBy: '', unlocked: [] };

const DEATH_SLOWDOWN_SECONDS = 1.1;

function damageSourceName(origin) {
  if (!origin) return 'a hazard';
  if (origin.fuse !== undefined) return 'a bomb';
  if (origin.title) return origin.title;
  const kind = origin.ownerKind || origin.kind;
  return monsterSprites[kind] ? monsterDisplayName(kind) : 'an enemy attack';
}

function knockPlayerBack(source, incomingDamage) {
  let awayX = 0;
  let awayY = 0;
  if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) {
    awayX = player.x - source.x;
    awayY = player.y - source.y;
    if (Math.hypot(awayX, awayY) < 1 && (source.vx || source.vy)) {
      awayX = source.vx;
      awayY = source.vy;
    }
  }
  if (Math.hypot(awayX, awayY) < 1) {
    awayX = -player.lookX;
    awayY = -player.lookY;
  }
  const length = Math.hypot(awayX, awayY) || 1;
  const heavy = source?.boss || incomingDamage > 1;
  const speed = heavy ? 720 : 520;
  player.knockback = { vx: (awayX / length) * speed, vy: (awayY / length) * speed, timer: 0.18, duration: 0.18 };
  // Cancel an in-progress dash so the shove isn't swallowed by dash movement.
  dashTimer = 0;
}

function damagePlayer(damageAmount = 1, source) {
  if (player.invuln > 0 || mode !== 'playing' || deathTimer > 0) return;
  if (source === undefined) {
    // No explicit source: assume the closest enemy or enemy shot did it.
    source = [...enemies, ...enemyProjectiles]
      .filter((candidate) => distanceBetween(candidate, player) < 220)
      .sort((first, second) => distanceBetween(first, player) - distanceBetween(second, player))[0] || null;
  }
  if (ownedItems.has('bonded-aegis') && player.aegisCharges > 0) {
    player.aegisCharges -= 1;
    player.invuln = 0.45;
    addParticles(player.x, player.y, '#d3e2ff', 12, 95);
    showMessage(`Bonded Aegis absorbed the hit. ${player.aegisCharges} charge${player.aegisCharges === 1 ? '' : 's'} remain.`, 1.6);
    saveRunState();
    updateHud();
    return;
  }
  if (consumeOrbitGuard(source)) {
    player.invuln = 0.45;
    saveRunState();
    updateHud();
    return;
  }
  const incomingDamage = Math.max(0.5, Math.round(damageAmount * 2) / 2);
  player.damageFlashTimer = 0.28;
  hurtVignetteTimer = HURT_VIGNETTE_DURATION;
  hurtVignetteStrength = Math.min(1, 0.7 + incomingDamage * 0.15);
  if (source !== null) knockPlayerBack(source, incomingDamage);
  vibrateController(incomingDamage);
  let remainingDamage = incomingDamage;
  if (player.armor > 0) {
    player.armor -= 1;
    remainingDamage -= 1;
    showMessage('Your clothing absorbs the hit.', 1.4);
  }
  if (remainingDamage > 0) player.hp -= remainingDamage;
  if (incomingDamage > 1) triggerCameraShake('playerHeavyHit');
  else triggerCameraShake('playerHurt');
  playSound('punch.ogg', 0.32);
  runStats.lastHitBy = damageSourceName(source);
  player.invuln = PLAYER_HIT_INVULN_SECONDS;
  if (player.hp <= 0) {
    // The run is lost now; a short slow-motion beat plays before the game-over screen.
    deathTimer = DEATH_SLOWDOWN_SECONDS;
    player.invuln = DEATH_SLOWDOWN_SECONDS + 1;
    player.knockback = null;
    player.hook = null;
    dashTimer = 0;
    clearSavedRun();
    playSound('system/event-fail.ogg', 0.5);
  }
  updateHud();
}

function shieldWithCompanion(projectile) {
  if (consumeOrbitGuard(projectile)) return true;
  const companion = companions
    .filter((candidate) => candidate.hp > 0 && candidate.hitCooldown <= 0)
    .sort((first, second) => distanceBetween(first, projectile) - distanceBetween(second, projectile))
    .find((candidate) => distanceBetween(candidate, projectile) < 19 + projectile.radius);
  if (!companion) return false;
  companion.hp -= 1;
  companion.hitCooldown = 0.8;
  addParticles(companion.x, companion.y, '#bcf0a3', 9, 100);
  if (companion.hp <= 0) {
    companion.respawnTimer = 10;
    showMessage(`${monsterDisplayName(companion.kind)} familiar was knocked out and will return in 10 seconds.`, 2.5);
  }
  return true;
}

function consumeOrbitGuard(target) {
  if (typeof orbitGuards === 'undefined' || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return false;
  for (let index = orbitGuards.length - 1; index >= 0; index -= 1) {
    const guard = orbitGuards[index];
    if (distanceBetween(guard, target) >= (guard.radius || 11) + (target.radius || 0)) continue;
    orbitGuards.splice(index, 1);
    addParticles(guard.x, guard.y, guard.color, 9, 100);
    return true;
  }
  return false;
}

function orbitGuardStyle() {
  const style = currentAttackStyle();
  const kind = style === 'bow' ? 'arrow' : style === 'melee' ? 'sword' : 'mana';
  return {
    kind,
    color: kind === 'arrow' ? '#d8b577'
      : kind === 'sword' ? '#c4e8ff' : magicElementPalette[activeMagicElement] || '#62d9ee',
  };
}

function updateOrbitGuards(dt) {
  const style = orbitGuardStyle();
  for (let index = orbitGuards.length - 1; index >= 0; index -= 1) {
    const guard = orbitGuards[index];
    guard.kind = style.kind;
    guard.color = style.color;
    const previousPosition = { x: guard.x, y: guard.y };
    guard.angle = (guard.angle + dt * 2.8) % (Math.PI * 2);
    guard.x = player.x + Math.cos(guard.angle) * 32;
    guard.y = player.y - 20 + Math.sin(guard.angle) * 32;
    const enemy = enemies.find((candidate) => candidate.hp > 0 &&
      distanceToSegment(candidate, previousPosition, guard) < (candidate.radius || 12) + (guard.radius || 11));
    if (!enemy) continue;
    damageEnemy(enemy, 2, guard.x, guard.y);
    addParticles(guard.x, guard.y, guard.color, 8, 95);
    orbitGuards.splice(index, 1);
  }
}

function distanceToSegment(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return distanceBetween(point, start);
  const projection = clamp(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(point.x - start.x - projection * deltaX, point.y - start.y - projection * deltaY);
}

function updateCompanions(dt) {
  companions.forEach((companion, index) => {
    if (companion.hp <= 0) {
      companion.respawnTimer -= dt;
      if (companion.respawnTimer <= 0) {
        companion.hp = companion.maxHp;
        companion.hitCooldown = 0;
        companion.enemyCooldowns.clear();
        showMessage(`${monsterDisplayName(companion.kind)} familiar has returned.`, 1.5);
      }
      companion.hp = Math.min(companion.maxHp, companion.hp);
      return;
    }
    companion.hitCooldown = Math.max(0, companion.hitCooldown - dt);
    for (const [enemy, cooldown] of companion.enemyCooldowns) {
      const nextCooldown = cooldown - dt;
      if (nextCooldown <= 0 || !enemies.includes(enemy)) companion.enemyCooldowns.delete(enemy);
      else companion.enemyCooldowns.set(enemy, nextCooldown);
    }
    const orbit = elapsed * 0.9 + companion.followAngle + index * (Math.PI * 2 / Math.max(1, companions.length));
    const targetX = player.x + Math.cos(orbit) * 52;
    const targetY = player.y + Math.sin(orbit) * 42;
    companion.x += (targetX - companion.x) * Math.min(1, dt * 5);
    companion.y += (targetY - companion.y) * Math.min(1, dt * 5);
    for (const enemy of [...enemies]) {
      if (distanceBetween(companion, enemy) < enemy.radius + 13 && !companion.enemyCooldowns.has(enemy)) {
        companion.enemyCooldowns.set(enemy, 0.65);
        damageEnemy(enemy, 2, companion.x, companion.y);
        addParticles(enemy.x, enemy.y, '#bde8a0', 7, 90);
      }
    }
    companion.attackCooldown -= dt;
    if (companion.attackCooldown > 0) return;
    const target = enemies
      .filter((enemy) => distanceBetween(companion, enemy) < 420 && hasLineOfSight(companion, enemy))
      .sort((first, second) => distanceBetween(companion, first) - distanceBetween(companion, second))[0];
    if (!target) return;
    const angle = Math.atan2(target.y - companion.y, target.x - companion.x);
    const speed = 400;
    const colors = { ratto: '#f0c884', croc: '#9ce28f', wisp: '#c8a6ff' };
    projectiles.push({
      x: companion.x,
      y: companion.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 5,
      size: 0.8,
      color: colors[companion.kind] || companion.color || '#9ce28f',
      damage: 1,
      ttl: 1.2,
      trailTimer: 0,
      owner: 'companion',
    });
    addParticles(companion.x, companion.y, colors[companion.kind], 2, 25);
    companion.attackCooldown = 1.25;
  });
}

function drawHurtVignette(shake) {
  const progress = hurtVignetteTimer / HURT_VIGNETTE_DURATION;
  // Snap in quickly, then ease out slowly.
  const intensity = hurtVignetteStrength * (progress > 0.85 ? (1 - progress) / 0.15 : Math.pow(progress / 0.85, 1.6));
  if (intensity <= 0.01) return;
  const centerX = clamp(player.x - camera.x + shake.x, 0, VIEW_W);
  const centerY = clamp(player.y - 28 - camera.y + shake.y, 0, VIEW_H);
  const farthest = Math.max(
    Math.hypot(centerX, centerY), Math.hypot(VIEW_W - centerX, centerY),
    Math.hypot(centerX, VIEW_H - centerY), Math.hypot(VIEW_W - centerX, VIEW_H - centerY),
  );
  // TMW spotlight overlay (dark edges, clear centre) on the delver; it tightens as the hit gets stronger.
  // The overlay is at least twice the farthest corner distance, so it always covers the view.
  drawEffect('vignette', 0, centerX, centerY, { width: farthest * (3.6 - 0.8 * intensity),
    alpha: Math.min(1, intensity * 1.6), smooth: true });
}
