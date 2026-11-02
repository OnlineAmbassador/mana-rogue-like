const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { combat, source, peek } = require('./helpers/combat');
const { sliceText } = require('./helpers/load');

function matrixContext() {
  const c = combat();
  const game = source('game.js');
  c.loadAsset = c.loadDeferredAsset = () => ({ complete: true, naturalWidth: 1024, naturalHeight: 1024 });
  c.monsterSprites = vm.runInContext(`(() => {
    ${sliceText(game, 'const monsterSprites =', 'const ', 'game')}
    return monsterSprites;
  })()`, c);
  c.desertObstacleTiles = c.loadAsset();
  c.obstacleSprites = vm.runInContext(`(() => {
    ${sliceText(game, 'const obstacleSprites =', 'const obstacleSpritesByRegion =', 'game')}
    return obstacleSprites;
  })()`, c);
  c.roster = vm.runInContext(`(() => {
    ${sliceText(game, 'const characterRoster =', 'const rosterPageSize =', 'game')}
    return characterRoster;
  })()`, c).filter((entry) => !entry.random);
  c.shopItemCatalog = vm.runInContext(`(() => {
    ${sliceText(game, 'const shopItemCatalog =', 'const characterRoster =', 'game')}
    return shopItemCatalog;
  })()`, c);
  c.runProgressionSnapshot = { enemyIds: new Set(Object.keys(c.monsterSprites)), itemIds: new Set(c.shopItemCatalog.map((item) => item.id)) };
  c.persistBranchState = c.saveRunState = c.spawnCoin = () => {};
  c.suppressHeldAttackInput = () => {};
  c.triggerHitStop = () => {};
  c.lightningArcs = [];
  c.mapOrder = ['tulimshar'];
  c.DOORWAY_HALF_WIDTH = 64;
  c.Math.random = () => 0.9;
  Object.assign(c.player, { hp: 4, maxHp: 4, swordParryTimer: 0, meleeSwings: [], offhand: { cooldown: 0, charge: 0 } });
  Object.assign(c.weapon, { projectileSpeed: 480, rangeMultiplier: 1, tearSize: 1 });
  return c;
}

test('every character, weapon family and pair of highlighted branches emits finite bounded attacks at both tier limits', () => {
  const c = matrixContext();
  const branches = peek(c, 'skillBranches');
  let cases = 0;
  for (const character of c.roster) {
    c.character = character;
    c.player.damage = character.damage;
    for (const style of ['melee', 'bow', 'magic', 'brawl']) {
      c.activeCombatStyle = style;
      c.applyWeaponHands(c.defaultWeaponHands({ startingStyle: style }));
      c.activeCombatStyle = style;
      const family = branches.filter((branch) => branch.style === style);
      for (let first = 0; first < family.length; first++) {
        for (let second = first; second < family.length; second++) {
          for (const tier of [1, 3]) {
            const pair = [...new Set([family[first], family[second]])];
            c.save.branches = { xp: 10000, unlocks: Object.fromEntries(pair.map((branch) => [branch.id, tier])),
              loadouts: { melee: [], bow: [], magic: [], [style]: pair.map((branch) => branch.id) } };
            c.ownedItems.clear();
            for (const id of pair.flatMap((branch) => branch.items)) c.ownedItems.add(id);
            c.player.fireCooldown = 0;
            c.player.meleeSwings.length = c.projectiles.length = c.sporePods.length = c.groundHazards.length = 0;
            if (c.isCloseCombatStyle(style)) c.performMeleeSwing(0, 1, tier === 3);
            else c.shoot(style === 'bow' ? (tier === 3 ? { charge: 1 } : { quick: true })
              : tier === 3 ? { magicCharge: 1 } : null);
            const attacks = c.isCloseCombatStyle(style) ? c.player.meleeSwings
              : character.className === 'Sporeling' && style === 'magic' ? c.sporePods : c.projectiles;
            const label = `${character.name}/${style}/${pair.map((branch) => branch.id)}/${tier}`;
            assert.ok(attacks.length > 0, label);
            assert.ok(c.projectiles.length <= c.MAX_PLAYER_PROJECTILES, label);
            for (const attack of attacks) assert.ok(Number.isFinite(attack.damage) && attack.damage > 0, label);
            assert.equal(c.activeMagicElement, 'bubble', `${label}: an ability cannot unlock another element`);
            cases++;
          }
        }
      }
    }
  }
  assert.ok(cases > 1500, `expected a broad branch matrix, got ${cases}`);
});

test('every character and all eight elements damage every mob and regional boss with each attack family', () => {
  const c = matrixContext();
  const elements = Object.keys(peek(c, 'magicElementPalette'));
  let cases = 0;
  for (const character of c.roster) {
    c.character = character;
    for (const kind of Object.keys(c.monsterSprites)) {
      for (const element of elements) {
        for (const type of ['tear', 'arrow', 'melee', 'brawl']) {
          const enemy = c.createEnemy(kind, 400, 300, peek(c, 'bossPhaseAttackSets')[kind] !== undefined);
          Object.assign(enemy, { hp: 100000, maxHp: 100001, phase: 1 });
          c.enemies.length = c.groundHazards.length = c.lightningArcs.length = c.moves.length = 0;
          c.enemies.push(enemy);
          c.resolveElementalImpact({ x: 400, y: 300, vx: 480, vy: 0, damage: 4, radius: 6, element, type }, enemy);
          assert.ok(Number.isFinite(enemy.hp) && enemy.hp < 100000, `${character.name}/${kind}/${element}/${type}`);
          assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
          cases++;
        }
      }
    }
  }
  assert.ok(cases > 15000, `expected all character/mob/element/family combinations, got ${cases}`);
});

test('all scenery types enforce projectile, sword, charged-sword and bomb destruction rules for every element', () => {
  const c = matrixContext();
  for (const element of Object.keys(peek(c, 'magicElementPalette'))) {
    c.activeMagicElement = element;
    for (const type of ['breakable', 'solid', 'bomb-only', 'regenerating']) {
      for (const [source, damage] of [['projectile', 1], ['melee', 1], ['melee', 2], ['bomb', 3]]) {
        const rock = { x: 400, y: 300, radius: 20, hp: 3, maxHp: 3, type, regenTimer: 0,
          regenCyclesRemaining: type === 'regenerating' ? 1 : 0, regenDelay: 1, regenSteps: 3 };
        c.breakables.length = 0;
        c.breakables.push(rock);
        c.damageObstacle(rock, damage, source);
        const immune = type === 'solid' || (type === 'bomb-only' && source !== 'bomb');
        assert.equal(rock.hp, immune ? 3 : 3 - damage, `${element}/${type}/${source}/${damage}`);
        if (!immune && damage === 3) {
          assert.equal(c.breakables.includes(rock), type === 'regenerating');
          if (type === 'regenerating') {
            assert.equal(rock.broken, true);
            c.updateBreakables(2);
            assert.ok(rock.hp > 0 && rock.hp <= rock.maxHp);
          }
        }
      }
    }
  }
});

test('ancestry bonuses compose with class strengths and never depend on gender', () => {
  const c = matrixContext();
  const races = peek(c, 'raceProfiles');
  for (const character of c.roster) {
    const profile = c.characterProfile(character);
    const base = c.characterProfile({ className: character.className });
    const race = races[character.raceHead];
    assert.ok(race.name && race.trait, character.name);
    for (const key of ['melee', 'meleeRate', 'bow', 'bowRate', 'magic', 'brawl', 'brawlRate']) {
      assert.equal(profile[key], base[key] * (race[key] ?? 1), `${character.name}/${key}`);
    }
  }
  for (const [male, female] of [['humanMale', 'humanFemale'], ['elfMale', 'elfFemale']]) {
    assert.deepEqual({ ...c.characterProfile({ raceHead: male }) }, { ...c.characterProfile({ raceHead: female }) });
  }
});

test('every generic boss phase signature resolves with finite attacks against every character and weapon family', () => {
  const c = matrixContext();
  c.findEnemySpawnPosition = () => ({ x: 600, y: 350 });
  const rotations = peek(c, 'bossPhaseAttackSets');
  let cases = 0;
  for (const character of c.roster) {
    c.character = character;
    for (const style of ['melee', 'bow', 'magic', 'brawl']) {
      c.activeCombatStyle = style;
      for (const [kind, phases] of Object.entries(rotations)) {
        if (['jacko', 'golem', 'spider-queen'].includes(kind)) continue;
        for (const [phase, signatures] of phases.entries()) {
          for (const signature of signatures) {
            c.enemies.length = c.enemyProjectiles.length = c.groundHazards.length = c.bombs.length = c.moves.length = c.breakables.length = 0;
            const enemy = c.createEnemy(kind, 500, 300, true);
            Object.assign(enemy, { phase: phase + 1, signature, signatureTarget: { x: 300, y: 300 } });
            c.enemies.push(enemy);
            c.resolveUniqueBossAttack(enemy, phase > 0);
            for (const shot of c.enemyProjectiles) {
              for (const key of ['x', 'y', 'vx', 'vy', 'radius', 'ttl']) {
                assert.ok(Number.isFinite(shot[key]), `${character.name}/${style}/${kind}/${phase}/${signature}/${key}`);
              }
            }
            assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
            assert.ok(c.enemyProjectiles.length < 100, signature);
            cases++;
          }
        }
      }
    }
  }
  assert.ok(cases > 5000, `expected all phase rotations across player classes/styles, got ${cases}`);
});

test('Jacko, Golem and Spider Queen execute every phase rotation against each character and attack family', () => {
  const c = matrixContext();
  const controllers = { jacko: c.updateArenaBoss, golem: c.updateGolemBoss, 'spider-queen': c.updateSpiderQueen };
  const rotations = peek(c, 'bossPhaseAttackSets');
  for (const character of c.roster) {
    c.character = character;
    for (const style of ['melee', 'bow', 'magic']) {
      c.activeCombatStyle = style;
      for (const [kind, update] of Object.entries(controllers)) {
        for (const [phase, attacks] of rotations[kind].entries()) {
          for (let index = 0; index < attacks.length; index++) {
            c.enemies.length = c.enemyProjectiles.length = c.bossStrikes.length = c.bombs.length = c.moves.length =
              c.breakables.length = c.groundHazards.length = 0;
            const enemy = c.createEnemy(kind, 500, 300, true);
            Object.assign(enemy, { phase: phase + 1, attackCooldown: 0, summonCooldown: 999,
              bossAttackIndex: index, golemAttackIndex: index, spiderAttackIndex: index });
            c.enemies.push(enemy);
            for (let frame = 0; frame < 100; frame++) {
              enemy.stateTimer -= 1 / 30;
              enemy.attackCooldown -= 1 / 30;
              update(enemy, 1 / 30, -1, 0, 200, true);
              assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y) && Number.isFinite(enemy.stateTimer),
                `${character.name}/${style}/${kind}/${phase}/${attacks[index]}`);
            }
            assert.ok(c.enemyProjectiles.every((shot) => Number.isFinite(shot.vx) && Number.isFinite(shot.vy)));
            assert.ok(c.bossStrikes.every((strike) => Number.isFinite(strike.radius) && strike.radius > 0));
          }
        }
      }
    }
  }
});

test('fast arrows, magic and elemental shards hit crossed scenery and ordinary mobs without endpoint tunneling', () => {
  const c = matrixContext();
  const target = { kind: 'slime', x: 200, y: 200, radius: 10 };
  for (const type of ['tear', 'arrow', 'elemental']) {
    const projectile = { type, x: 250, y: 200, previousX: 150, previousY: 200, vx: 3000, vy: 0, radius: 4 };
    assert.equal(c.projectileHitsCircle(projectile, target, 1 / 30), true, type);
    assert.equal(c.projectileHitsEnemy(projectile, target, 1 / 30), true, type);
    assert.equal(c.projectileHitsCircle({ ...projectile, y: 220, previousY: 220 }, target, 1 / 30), false, type);
  }
});

test('optimized chain targeting stays nearest-first, respects visibility and visits each live foe at most once', () => {
  const c = matrixContext();
  const origin = { x: 300, y: 300 };
  const targets = [80, 10, 50, 30].map((dx) => ({ x: 300 + dx, y: 300, hp: 20 }));
  c.enemies.push(...targets, { x: 305, y: 300, hp: 20, manaRift: {} }, { x: 302, y: 300, hp: 0 });
  c.hasLineOfSight = (from, to) => to !== targets[1];
  const hits = [];
  c.damageEnemy = (target) => hits.push(target);
  c.enemies.filter = c.enemies.sort = () => { throw new Error('chain targeting must not allocate temporary sorting arrays'); };
  c.chainLightningFrom(origin, 4, 10);
  assert.deepEqual(hits, [targets[3], targets[2], targets[0]]);
  assert.equal(new Set(hits).size, hits.length);
});
