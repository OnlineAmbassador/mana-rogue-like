const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, source, peek } = require('./helpers/combat');
const { loadFunctions, sliceText } = require('./helpers/load');

function brawlerContext({ strict = false } = {}) {
  const c = combat({ skillPrerequisitesOpen: !strict });
  c.character = { id: 'brawler', className: 'Brawler', raceHead: 'humanMale', startingStyle: 'brawl', fireDelay: 0.26 };
  c.keys = {};
  c.gamepadInput = { moveX: 0, moveY: 0 };
  Object.assign(c.touchInput, { moveX: 0, moveY: 0 });
  c.attackInputSuppressed = false;
  c.dashVector = { x: 1, y: 0 };
  Object.assign(c.player, { hp: 5, maxHp: 5, armor: 0, fireCooldown: 0, meleeSwings: [], swordParryTimer: 0 });
  Object.assign(c.weapon, { tearSize: 1, rangeMultiplier: 1, projectileSpeed: 480 });
  c.persistBranchState = () => {};
  c.suppressHeldAttackInput = c.saveRunState = () => {};
  c.applyWeaponHands({ main: 'fists', off: 'blade' });
  return c;
}

test('Brawler is available initially and fists and glove mods are a separate family', () => {
  const c = brawlerContext();
  vm.runInContext(sliceText(source('game.js'), 'const characterRoster =', 'const rosterPageSize ='), c);
  loadFunctions(c, 'dbmanager.js', ['isCharacterUnlocked']);
  const entry = peek(c, 'characterRoster.find(entry => entry.id === "brawler")');
  assert.equal(c.isCharacterUnlocked(entry), true);
  assert.equal(entry.startingStyle, 'brawl');
  assert.equal(c.weaponById('fists').family, 'brawl');
  for (const id of ['leather-gloves', 'iron-gauntlets']) assert.equal(c.weaponById(id).family, 'brawl');
  for (const id of ['mod-flurry', 'mod-windup']) {
    assert.ok(c.branchesForItem(id).every(branch => branch.style === 'brawl'));
  }
  assert.equal(c.weaponLearned('fists'), true);
  assert.equal(c.characterProfile().brawlRate > c.characterProfile().meleeRate, true);
});

test('swords alternate hack-and-slash cuts while fist charges twist without parrying', () => {
  const c = brawlerContext();
  c.performMeleeAttack(true);
  assert.ok(c.player.meleeSwings.every(swing => swing.weapon === 'hands' && swing.spin));
  assert.equal(c.player.swordParryTimer, 0);
  assert.equal(c.player.attackAnimationStyle, 'hand');
  c.player.spin = null;
  c.player.meleeSwings.length = 0;
  c.applyWeaponHands({ main: 'blade', off: 'fists' });
  c.player.fireCooldown = 0;
  c.performMeleeAttack(true);
  assert.ok(c.player.meleeSwings.every(swing => swing.weapon === 'sword' && !swing.spin));
  assert.equal(c.player.spin, null);
  assert.equal(c.player.attackAnimationStyle, 'sword');
  const first = c.player.meleeSwings[0].slashSign;
  c.player.fireCooldown = 0;
  c.performMeleeAttack(false);
  assert.equal(c.player.meleeSwings.at(-1).slashSign, -first);
  assert.ok(c.player.swordParryTimer > 0);
});

test('fist swoops use the swipe sheet and never render detached glove icons', () => {
  const c = brawlerContext();
  const effects = [];
  c.drawEffect = (...args) => effects.push(args);
  loadFunctions(c, 'gameui.js', ['drawBrawlerSwing']);
  for (const spin of [false, true]) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      c.drawBrawlerSwing({ angle: 0, spin, arc: 0.8, reach: 60, maxTimer: 1, timer: 1 - progress });
      const [sheet, frame, x, y, options] = effects.at(-1);
      assert.equal(sheet, 'swipe');
      assert.ok(frame >= 0 && frame <= 5);
      assert.ok(Math.hypot(x - c.player.x, y - (c.player.y - 34)) <= 24.00001);
      assert.equal(options.rotation, spin ? progress * Math.PI * 2 : (progress - 0.5) * 1.6);
      assert.ok(options.alpha >= 0 && options.alpha <= 0.9);
    }
  }
});

test('worn glove sheets track both body types and every directional walk/punch frame', () => {
  const c = brawlerContext();
  vm.runInContext(sliceText(source('game.js'), 'const clothingSprites =', '// `hitbox`'), Object.assign(c, {
    loadAsset: name => ({ name, complete: true, naturalWidth: 1024 }),
  }));
  const draws = [];
  c.drawSpriteImage = (...args) => draws.push(args);
  c.drawSpriteImage.effect = { filter: 'brightness(2)', lift: 0.3 };
  c.humanoidSprites = { male: { framesPerDirection: 16 }, female: { framesPerDirection: 16 } };
  loadFunctions(c, 'gameui.js', ['drawClothing']);
  for (const body of ['male', 'female']) {
    c.character.sprite = body;
    for (const sprite of ['leatherGloves', 'ironGauntlets', 'flurryGloves']) {
      for (let direction = 0; direction < 4; direction++) {
        for (let frame = 0; frame < 16; frame++) {
          c.drawClothing({ sprite }, direction * 16 + frame, 0, 0, 1.45);
          const [image, sx, sy, sw, sh, dx, dy, dw, dh, effect] = draws.at(-1);
          const expected = direction * 16 + frame;
          const columns = image.naturalWidth / 64;
          assert.equal(sx, expected % columns * 64);
          assert.equal(sy, Math.floor(expected / columns) * 64);
          assert.equal(image.name.includes('female'), body === 'female');
          assert.deepEqual([sw, sh, dx, dy, dw, dh], [64, 64, -46.4, -86.8, 92.8, 92.8]);
          assert.equal(effect.lift, 0.3);
          assert.ok(effect.filter.includes('brightness(2)'));
        }
      }
    }
  }
});

test('fists alone never reflect hostile projectiles, even during a twisting attack', () => {
  const c = brawlerContext();
  c.performMeleeAttack(true);
  c.enemyProjectiles.push({ x: 325, y: 300, vx: -200, vy: 0, radius: 4, damage: 2 });
  c.updateMeleeProjectileParry();
  assert.equal(c.enemyProjectiles.length, 1);
  assert.equal(c.projectiles.length, 0);
  assert.equal(c.player.hp, 5);
});

test('rush uses the standard dash cooldown and invulnerability, sweeps targets once and respects scenery immunity', () => {
  const c = brawlerContext();
  const hits = [];
  c.damageEnemy = (enemy, damage) => { hits.push({ enemy, damage }); };
  const enemy = { x: 345, y: 300, radius: 10, hp: 100 };
  c.enemies.push(enemy);
  for (const type of ['breakable', 'solid', 'bomb-only', 'regenerating']) {
    c.breakables.push({ x: 345, y: 300, radius: 10, hp: 3, maxHp: 3, type });
  }
  c.startDash();
  assert.equal(c.player.dashMove, 'brawler-rush');
  assert.equal(c.dashTimer, 0.16);
  assert.equal(c.dashCooldown, 0.85);
  assert.equal(c.player.invuln, peek(c, 'DASH_INVULN_SECONDS'));
  c.player.x = 400;
  c.updateConfluenceDash(0.016);
  c.updateConfluenceDash(0.016);
  assert.equal(hits.length, 1, 'a crossed target cannot be skipped or hit twice');
  assert.ok(Number.isFinite(hits[0].damage) && hits[0].damage > 0);
  assert.deepEqual(c.breakables.map(rock => rock.hp), [2, 3, 3, 2]);
  c.dashTimer = 0;
  c.updateConfluenceDash(0.016);
  assert.equal(c.player.dashMove, null);
  assert.equal(c.player.dashHits, null);
  assert.equal(c.player.brawlerBraceUntil, c.elapsed + 0.18);
  assert.equal(c.player.brawlerBraceReadyAt, c.elapsed + 3);
  const end = c.player.brawlerBraceUntil;
  c.elapsed += 0.9;
  c.dashCooldown = 0;
  c.startDash();
  c.dashTimer = 0;
  c.updateConfluenceDash(0.016);
  assert.equal(c.player.brawlerBraceUntil, end, 'repeated dashes cannot keep the guard permanently active');
});

test('all four families retain the same bounded dash invulnerability', () => {
  for (const style of ['melee', 'bow', 'magic', 'brawl']) {
    const c = brawlerContext();
    c.applyWeaponHands(c.defaultWeaponHands({ startingStyle: style }));
    c.startDash();
    assert.equal(c.player.invuln, 0.24, style);
    assert.equal(c.dashCooldown, 0.85, style);
    assert.equal(c.player.dashMove === 'brawler-rush', style === 'brawl');
    c.currentRoom.type = 'shop';
    c.dashTimer = c.dashCooldown = 0;
    c.startDash();
    assert.equal(c.dashTimer, 0, 'safe shops do not permit rush attacks');
  }
});

test('other characters earn the damaging fist dash through the stat-gated Brawler tree', () => {
  const c = brawlerContext({ strict: true });
  c.character.className = 'Mage';
  c.startDash();
  assert.equal(c.player.dashMove, null);
  assert.equal(c.toggleBranch('brawl-rush'), 'locked');
  const stat = c.skillStatNodes().find(node => node.target.id === 'brawl-rush' && node.tier === 1);
  c.skillStatState().push(stat.id);
  assert.equal(c.toggleBranch('brawl-rush'), 'on');
  c.dashTimer = c.dashCooldown = 0;
  c.startDash();
  assert.equal(c.player.dashMove, 'brawler-rush');
  for (const branch of peek(c, 'skillBranches').filter(branch => branch.style === 'brawl')) {
    for (const tier of [2, 3]) {
      assert.ok(c.skillStatNodes().some(node => node.target.id === branch.id && node.tier === tier));
    }
  }
  assert.deepEqual([...peek(c, 'SKILL_ROUTE_STATS.brawl').map(stat => Object.keys(stat.fx)[0])], ['rate', 'damage']);
});

test('the fourth family is selectable by keyboard, touch cycle and controller cycle', () => {
  const c = brawlerContext();
  c.applyWeaponHands({ main: 'magic', off: 'blade' });
  c.cycleCombatStyle();
  assert.equal(c.activeCombatStyle, 'brawl');
  c.mode = 'playing';
  c.keys = {};
  c.updateHud = () => {};
  c.openStartingWeaponChoice();
  assert.equal(c.chooseStartingWeapon(3), true);
  assert.equal(c.activeCombatStyle, 'brawl');
  const actions = sliceText(source('game.js'), 'const bindingActions =', 'const reservedKeys =');
  assert.match(actions, /id: 'weapon4'.*key: '4'/);
  assert.match(actions, /id: 'ability'.*key: '5'/);
  assert.match(actions, /id: 'nextWeapon'.*pad: 4/);
  assert.match(source('game.js'), /case 'weapon4': selectCombatStyle\('brawl'\)/);
});

test('legacy key 4 class signatures migrate to 5 without losing the new fist shortcut', () => {
  const c = brawlerContext();
  vm.runInContext(sliceText(source('game.js'), 'const bindingActions =', 'loadBindings();'), c);
  c.CONTROLS_STORAGE_KEY = 'controls';
  c.localStorage = { getItem: () => JSON.stringify({ key: { ability: '4' } }) };
  loadFunctions(c, 'dbmanager.js', ['resetBindings', 'loadBindings']);
  c.loadBindings();
  assert.equal(peek(c, 'bindings.key.ability'), '5');
  assert.equal(peek(c, 'bindings.key.weapon4'), '4');
});

test('legacy migration preserves custom bindings when signature key 5 or fist key 4 is occupied', () => {
  for (const [stored, expectedAbility, expectedFists] of [
    [{ ability: '4', bomb: '5' }, '6', '4'],
    [{ ability: 'x', bomb: '4' }, 'x', '5'],
    [{ ability: '4', bomb: '5', item: '6', shock: '7', interact: '8', map: '9', journal: '0' }, 'v', '4'],
  ]) {
    const c = brawlerContext();
    vm.runInContext(sliceText(source('game.js'), 'const bindingActions =', 'loadBindings();'), c);
    c.CONTROLS_STORAGE_KEY = 'controls';
    c.localStorage = { getItem: () => JSON.stringify({ key: stored }) };
    loadFunctions(c, 'dbmanager.js', ['resetBindings', 'loadBindings']);
    c.loadBindings();
    const keys = peek(c, 'bindings.key');
    assert.equal(keys.ability, expectedAbility);
    assert.equal(keys.weapon4, expectedFists);
    for (const [action, key] of Object.entries(stored)) {
      if (action !== 'ability') assert.equal(keys[action], key, action);
    }
    assert.equal(Object.values(keys).filter(key => key === keys.ability).length, 1);
    assert.equal(Object.values(keys).filter(key => key === keys.weapon4).length, 1);
  }
});

test('Brawler saves preserve existing tree progress and sanitize glove and fist loadouts', () => {
  const c = brawlerContext();
  loadFunctions(c, 'dbmanager.js', ['sanitizeBranchSave', 'sanitizeWeaponSave', 'sanitizePlaySave', 'sanitizeConfluenceSave']);
  const clean = c.sanitizeBranchSave({
    gridVersion: 1, xp: 500, unlocks: { cleave: 3, 'brawl-power': 2 },
    loadouts: { melee: ['cleave'], brawl: ['brawl-power', 'riposte'] },
    weapons: { found: ['iron-gauntlets'], learned: ['iron-gauntlets'], hands: { Brawler: { main: 'iron-gauntlets', off: 'blade' } } },
  });
  assert.equal(clean.unlocks.cleave, 3);
  assert.equal(clean.unlocks['brawl-power'], 2);
  assert.deepEqual([...clean.loadouts.brawl], ['brawl-power']);
  assert.deepEqual([...clean.weapons.learned], ['iron-gauntlets']);
  assert.equal(clean.weapons.hands.Brawler.main, 'iron-gauntlets');
});

test('fist AI has a short-range counter without extra attackers or endless kiting', () => {
  const c = brawlerContext();
  vm.runInContext("dominantAIStyle = 'brawl';", c);
  const profile = c.aiStyleProfile();
  assert.equal(profile.tokenBonus, 0);
  assert.equal(profile.dodgeAll, false);
  assert.equal(profile.punishRecovery, false);
  assert.ok(profile.ringScale <= 1.1);
  assert.ok(Number.isFinite(c.estimatedPlayerDps()));
  assert.equal(c.orbitGuardStyle().kind, 'fists');
});
