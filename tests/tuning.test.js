// Enforces the balance rules recorded in BALANCE.md. Tests are named by rule ID (R1-R10, T1-T2); the last test fails
// when BALANCE.md and this file disagree about which rules exist, so changing a number means updating both.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { combat, source, peek } = require('./helpers/combat');
const { loadBetween, loadFunctions } = require('./helpers/load');

const INPUTS = ['touch', 'keyboard', 'controller'];
const tuning = (c) => peek(c, 'ADAPTIVE_AI_TUNING');

function adopt(c, input, floor = 3) {
  c.currentFloor = floor;
  c.lastInputMode = input;
  c.updateInputAI(0.016);
  return c;
}

// Runs the real updateEnemy transition into a ranged windup and returns the enemy it prepared.
function windupEnemy(c, distance, kind = 'bandit') {
  vm.runInContext('updateEnemyBehavior = (enemy) => { enemy.behavior = "shoot-windup"; };', c);
  const enemy = { x: c.player.x + distance, y: c.player.y, hp: 5, kind, behavior: 'hover', arrowShot: true };
  c.enemies.push(enemy);
  c.updateEnemy(enemy, 0.016);
  return enemy;
}

test('R1: the wide pulse is too wide to walk out of during its warning, for every class speed and input', () => {
  for (const [className, speed] of [['Delver', 180], ['Sporeling', 205], ['Mage', 235], ['Pilgrim', 235]]) {
    for (const input of INPUTS) {
      const c = adopt(combat(), input);
      Object.assign(c.player, { speed });
      c.character.className = className;
      const ground = speed * (className === 'Pilgrim' ? 1.12 : 1);
      const warning = c.aiInputProfile().warning;
      const radius = c.dashPulseRadius();
      assert.ok(radius > ground * warning, `${className} ${input}: ${radius} px vs ${ground * warning} px walked`);
      assert.ok(radius >= tuning(c).pulse.radiusMin && radius <= tuning(c).pulse.radiusMax);
    }
  }
  const c = adopt(combat(), 'touch');
  assert.equal(c.dashPulseRadius(), 297, 'the base class keeps the radius the pulse shipped with, near 300');
});

test('R2: the DASH NOW cue fits inside the dash invulnerability and every warning leaves time to anticipate', () => {
  const c = combat();
  const { pulse, profiles } = tuning(c);
  assert.ok(pulse.dashCueSeconds <= peek(c, 'DASH_INVULN_SECONDS'), 'an earlier dash would be punished');
  for (const [name, profile] of Object.entries(profiles)) {
    assert.ok(profile.warning - pulse.dashCueSeconds >= 0.5, `${name} warning leaves under half a second before the cue`);
  }
  assert.match(source('playermanager.js'), /player\.invuln = Math\.max\(player\.invuln, DASH_INVULN_SECONDS\)/);
});

test('R3: a pulse leaves its caster quiet for longer than the invulnerability a hit grants', () => {
  for (const input of INPUTS) {
    const c = adopt(combat(), input, 2);
    c.updateInputAI(6);
    const enemy = { x: 500, y: 300, hp: 6, radius: 15, behavior: 'hover', attackCooldown: 0, phase: 1 };
    c.enemies.push(enemy);
    assert.equal(c.tryDashPressure(enemy), true, input);
    const warning = c.aiInputProfile().warning;
    assert.ok(enemy.attackCooldown >= warning + peek(c, 'PLAYER_HIT_INVULN_SECONDS'), input);
  }
  assert.match(source('playermanager.js'), /player\.invuln = PLAYER_HIT_INVULN_SECONDS;/);
});

test('R4: input tempo is measured in floors of the existing per-floor cooldown scaling', () => {
  const c = combat();
  const { tempoPerFloor, profiles } = tuning(c);
  assert.match(source('mobmanager.js'), new RegExp(`: 1 \\+ Math\\.max\\(0, currentFloor - 1\\) \\* ${tempoPerFloor}\\)`),
    'tempoPerFloor must equal the ordinary-enemy cooldown scaling per floor');
  assert.equal(c.aiInputProfile().tempo, 1, 'no input learned yet');
  for (const input of INPUTS) {
    const profile = adopt(combat(), input, 2).aiInputProfile();
    assert.ok(Math.abs(profile.tempo - (1 + tempoPerFloor * profiles[input].tempoFloors)) < 1e-12, input);
  }
});

test('R5: floor one applies half of an input profile and the wide pulse waits for floor two', () => {
  const ramp = tuning(combat()).floorOneRamp;
  assert.equal(ramp, 0.5);
  for (const input of INPUTS) {
    const full = adopt(combat(), input, 2).aiInputProfile();
    const first = adopt(combat(), input, 1).aiInputProfile();
    for (const axis of ['strafe', 'flankLead', 'dodgeBonus', 'nearDodgeBonus', 'shotShare']) {
      assert.ok(Math.abs(first[axis] - full[axis] * ramp) < 1e-12, `${input} ${axis}`);
    }
    assert.ok(Math.abs((first.tempo - 1) - (full.tempo - 1) * ramp) < 1e-12, `${input} tempo`);
    assert.equal(first.attackSlots, 0, 'extra attack slots only from floor two');
  }
  const c = adopt(combat(), 'keyboard', 1);
  c.updateInputAI(6);
  const enemy = { x: 500, y: 300, hp: 6, radius: 15, behavior: 'hover', attackCooldown: 0, phase: 1 };
  c.enemies.push(enemy);
  assert.equal(c.dashPressureBlocker(enemy), 'floor-too-low');
  c.currentFloor = 2;
  assert.equal(c.dashPressureBlocker(enemy), null);
});

test('R6: no profile starts ordinary attacks closer together than the reaction-time floor', () => {
  const MIN_GAP = 0.25; // the rule's value, not read from the table it constrains
  assert.ok(tuning(combat()).minAttackGap >= MIN_GAP);
  for (const input of [null, ...INPUTS]) {
    for (let floor = 1; floor <= 10; floor += 1) {
      const c = combat();
      if (input) adopt(c, input, floor);
      c.currentFloor = floor;
      const enemy = windupEnemy(c, 200);
      assert.ok(enemy.attackSpacingTimer >= MIN_GAP - 1e-12, `${input} floor ${floor}`);
    }
  }
});

test('R7: melee attack tokens never exceed the cap, even when weapon style and input both add a slot', () => {
  const c = combat();
  const cap = tuning(c).maxMeleeAttackers;
  assert.ok(cap <= 4, 'the rule allows the base cap of 3 plus one adaptation slot');
  for (let floor = 1; floor <= 10; floor += 1) {
    c.currentFloor = floor;
    for (const bonus of [0, 1]) {
      for (const slots of [0, 1]) {
        assert.ok(c.meleeAttackerLimit(bonus, slots) <= cap, `floor ${floor} bonus ${bonus} slots ${slots}`);
      }
    }
    assert.equal(c.meleeAttackerLimit(0, 0), Math.min(3, 1 + Math.floor(floor / 2)), 'base limit is unchanged');
  }
  assert.equal(c.meleeAttackerLimit(1, 1), cap, 'bow style plus controller reaches the cap, not past it');
});

test('R8: flanking never makes a calm enemy faster than an enraged one', () => {
  const c0 = combat();
  const cap = peek(c0, 'TACTICAL_LATERAL_CAP');
  assert.ok(tuning(c0).maxTacticalSpeed <= 1.25, 'the rule is the enrage multiplier');
  assert.ok(Math.hypot(1, cap) <= 1.25 + 1e-12);
  let reachedCap = false;
  for (const input of INPUTS) {
    for (const distance of [50, 90, 150, 230, 330, 420]) {
      const c = adopt(combat(), input);
      const enemy = { x: c.player.x + distance, y: c.player.y, radius: 12, speed: 100, hp: 10, maxHp: 10,
        behavior: 'hover', archetype: 'charger', attackCooldown: 2, dodgeCooldown: 9, tacticTimer: 5, strafeDirection: 1 };
      c.enemies.push(enemy);
      c.moves.length = 0;
      c.applyMobTactics(enemy, 0.016, -1, 0, distance);
      assert.equal(c.moves.length, 1, `${input} ${distance}px flanks once`);
      const lateral = Math.hypot(c.moves[0].vx, c.moves[0].vy) / enemy.speed;
      assert.ok(lateral <= cap + 1e-9, `${input} ${distance}px lateral ${lateral}`);
      if (Math.abs(lateral - cap) < 1e-9) reachedCap = true;
    }
  }
  assert.ok(reachedCap, 'the strongest flanker is held to the cap');
  // A profile tuned past the cap is clamped rather than trusted.
  for (const strafe of [1, 3]) {
    const c = adopt(combat(), 'controller');
    peek(c, `ADAPTIVE_AI_TUNING.profiles.controller.strafe = ${strafe}; inputProfileCache.name = null;`);
    const enemy = { x: c.player.x + 150, y: c.player.y, radius: 12, speed: 100, hp: 10, maxHp: 10,
      behavior: 'hover', archetype: 'charger', attackCooldown: 2, dodgeCooldown: 9, tacticTimer: 5, strafeDirection: 1 };
    c.enemies.push(enemy);
    c.moves.length = 0;
    c.applyMobTactics(enemy, 0.016, -1, 0, 150);
    const lateral = Math.hypot(c.moves[0].vx, c.moves[0].vy) / enemy.speed;
    assert.ok(Math.abs(lateral - cap) < 1e-9, `strafe ${strafe} gives lateral ${lateral}`);
  }
  assert.match(source('mobmanager.js'), /enemy\.speed \*= 1\.25;/, 'the cap equals the enrage multiplier');
});

test('R9: input prediction stays distinct and short of perfect aim on every floor', () => {
  for (let floor = 1; floor <= 10; floor += 1) {
    for (const distance of [150, 250, 350]) {
      const leads = {};
      for (const input of [null, 'touch', 'controller', 'keyboard']) {
        const c = combat();
        if (input) adopt(c, input, floor);
        c.currentFloor = floor;
        c.playerVelocity = { x: 100, y: 0 };
        const enemy = windupEnemy(c, distance);
        leads[input] = (enemy.shotTarget.x - c.player.x) / 100;
        const flight = distance / c.ordinaryShotSpeed(enemy);
        assert.ok(leads[input] < flight, `floor ${floor} ${distance}px ${input}: lead ${leads[input]} vs flight ${flight}`);
      }
      assert.ok(leads.keyboard > leads.controller && leads.controller > leads.touch && leads.touch > leads.null,
        `floor ${floor} ${distance}px: ${JSON.stringify(leads)}`);
    }
  }
});

test('R10: controller >= keyboard/mouse >= touch on every threat axis, and every input exceeds neutral', () => {
  const { profiles } = tuning(combat());
  const { touch, keyboard, controller, neutral } = profiles;
  const harder = { attackSlots: 1, tempoFloors: 1, dodgeBonus: 1, flankLead: 1, beatScale: -1, warning: -1 };
  for (const [axis, direction] of Object.entries(harder)) {
    assert.ok(direction * (controller[axis] - keyboard[axis]) >= 0, `controller vs keyboard on ${axis}`);
    assert.ok(direction * (keyboard[axis] - touch[axis]) >= 0, `keyboard vs touch on ${axis}`);
    assert.ok(direction * (touch[axis] - neutral[axis]) >= 0, `touch vs neutral on ${axis}`);
  }
});

test('T1: with Adaptive enemies off, combat matches the behavior from before input adaptation', () => {
  const c = adopt(combat(), 'controller', 3);
  c.updateInputAI(6);
  c.gameSettings = { adaptiveEnemies: false };
  const profile = c.aiInputProfile();
  assert.deepEqual({ ...profile }, { strafe: 0, flankLead: 0, dodgeBonus: 0, nearDodgeBonus: 0, shotShare: 0,
    beatScale: 1, tempo: 1, attackSlots: 0, warning: 1.1 });
  const enemy = { x: 500, y: 300, hp: 6, radius: 15, behavior: 'hover', attackCooldown: 0, phase: 1 };
  c.enemies.push(enemy);
  assert.equal(c.dashPressureBlocker(enemy), 'adaptive-off');
  assert.equal(c.tryDashPressure(enemy), false);
  const windup = windupEnemy(c, 200);
  assert.equal(windup.attackSpacingTimer, 0.55, 'floor-three spacing is unchanged');
  assert.equal(windup.shotTarget.x, c.player.x, 'a still player is aimed at directly');
  c.playerVelocity = { x: 100, y: 0 };
  const moving = windupEnemy(c, 200);
  assert.ok(Math.abs((moving.shotTarget.x - c.player.x) / 100 - 0.2) < 1e-9, 'floor lead alone: (3 - 1) * 0.1 seconds');
  const boss = { x: 700, y: 300, hp: 100, boss: true, phase: 1, radius: 40,
    behavior: 'jacko-idle', pressureCooldown: 0, smackCooldown: 10, speed: 150 };
  c.enemies.push(boss);
  c.applyBossPressure(boss, 0.016, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 0, 'major bosses go back to skipping path-marker pressure');
  const mini = { ...boss, boss: false, miniBoss: true };
  c.enemies.push(mini);
  c.applyBossPressure(mini, 0.016, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 1, 'minibosses always used it');
  c.gameSettings = { adaptiveEnemies: true };
  c.bossStrikes.length = 0;
  boss.pressureCooldown = 0;
  c.applyBossPressure(boss, 0.016, -1, 0, 400);
  assert.equal(c.bossStrikes.length, 1, 'switching it back on restores the new boss pressure');
});

test('T2: the Adaptive enemies setting defaults on and survives a missing or broken store', () => {
  const run = (stored) => {
    const context = vm.createContext({ localStorage: { getItem: () => stored }, console });
    loadBetween(context, 'game.js', 'const SETTINGS_STORAGE_KEY', 'const AUDIO_STORAGE_KEY');
    return vm.runInContext('gameSettings', context);
  };
  assert.equal(run(null).adaptiveEnemies, true);
  assert.equal(run('{}').adaptiveEnemies, true);
  assert.equal(run('{"adaptiveEnemies":false}').adaptiveEnemies, false);
  assert.equal(run('{"adaptiveEnemies":"no"}').adaptiveEnemies, true);
  assert.equal(run('not json').adaptiveEnemies, true);
});

test('wide-pulse blockers are named, independent and evaluated in a fixed order', () => {
  const setup = (floor = 2) => {
    const c = adopt(combat(), 'keyboard', floor);
    c.updateInputAI(6);
    const enemy = { x: 500, y: 300, hp: 6, radius: 15, behavior: 'hover', attackCooldown: 0, phase: 1 };
    c.enemies.push(enemy);
    return { c, enemy };
  };
  const cases = [
    ['floor-too-low', ({ c }) => { c.currentFloor = 1; }],
    ['cooldown', ({ c }) => { c.currentRoom = { cleared: true }; }],
    ['player-cannot-dash', ({ c }) => { c.dashCooldown = 0.2; }],
    ['strike-active', ({ c }) => { c.bossStrikes.push({}); }],
    ['out-of-reach', ({ enemy }) => { enemy.x = 990; }],
    ['boss-phase', ({ enemy }) => { enemy.boss = true; }],
    ['attack-in-progress', ({ enemy }) => { enemy.burstRemaining = 1; }],
    ['hostile-threats', ({ c }) => { c.enemyProjectiles.push({ x: 0, y: 0 }); }],
  ];
  for (const [reason, arrange] of cases) {
    const ctx = setup();
    arrange(ctx);
    assert.equal(ctx.c.dashPressureBlocker(ctx.enemy), reason);
    assert.equal(ctx.c.tryDashPressure(ctx.enemy), false, reason);
  }
  const clear = setup();
  assert.equal(clear.c.dashPressureBlocker(clear.enemy), null);
  assert.equal(clear.c.dashPressureActive(), false);
  assert.equal(clear.c.tryDashPressure(clear.enemy), true);
  assert.equal(clear.c.dashPressureActive(), true);
  assert.equal(clear.c.dashPressureBlocker(clear.enemy), 'cooldown', 'a pulse starts its own cooldown');
});

test('input adaptation steps are pure: the same state and input always give the same result', () => {
  const c = combat();
  const room = {};
  const start = c.makeInputAIState();
  const frozen = JSON.stringify(start);
  const first = c.stepInputAI(start, 'touch', 0.5, room);
  assert.equal(JSON.stringify(start), frozen, 'the input state is not mutated');
  assert.deepEqual({ ...c.stepInputAI(start, 'touch', 0.5, room) }, { ...first });
  assert.equal(first.mode, 'touch');
  let state = first;
  for (let i = 0; i < 4; i += 1) state = c.stepInputAI(state, 'controller', 0.5, room);
  assert.equal(state.mode, 'touch', 'two seconds is not enough');
  state = c.stepInputAI(state, 'controller', 0.5, room);
  assert.equal(state.mode, 'controller', 'adopted after 2.5 seconds of stable play');
  assert.equal(c.stepInputAI(state, 'controller', 0, {}).pressureCooldown, tuning(c).roomGraceSeconds);
});

test('obstacle steering returns the same headings as the unfiltered reference over a grid of layouts', () => {
  const reference = (c, enemy, vx, vy) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return { x: vx, y: vy };
    const clearance = c.ROOM_WALL_THICKNESS + enemy.radius + c.WALL_COLLISION_PADDING;
    const lookahead = Math.max(40, speed * 0.4);
    const dx = vx / speed;
    const dy = vy / speed;
    const free = (x, y) => {
      const end = { x: enemy.x + x * lookahead, y: enemy.y + y * lookahead };
      if (end.x < clearance || end.x > c.ROOM_W - clearance || end.y < clearance || end.y > c.ROOM_H - clearance) return false;
      return !c.breakables.some((obstacle) => {
        if (obstacle.broken) return false;
        const projection = c.clamp(((obstacle.x - enemy.x) * x + (obstacle.y - enemy.y) * y) / lookahead, 0, 1);
        const gap = Math.hypot(obstacle.x - enemy.x - x * lookahead * projection,
          obstacle.y - enemy.y - y * lookahead * projection);
        return gap < obstacle.radius + enemy.radius + 3;
      });
    };
    if (free(dx, dy)) return { x: vx, y: vy };
    const side = enemy.navigationSide || enemy.strafeDirection || 1;
    for (const turn of [Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
      for (const sign of [side, -side]) {
        const angle = turn * sign;
        const x = dx * Math.cos(angle) - dy * Math.sin(angle);
        const y = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (free(x, y)) {
          enemy.navigationSide = sign;
          return { x: x * speed, y: y * speed };
        }
      }
    }
    return { x: 0, y: 0 };
  };
  const layouts = [
    [],
    [{ x: 300, y: 270, radius: 34 }],
    [{ x: 300, y: 245, radius: 28 }, { x: 300, y: 295, radius: 28 }, { x: 640, y: 150, radius: 22, broken: true }],
    [{ x: 200, y: 120, radius: 20 }, { x: 420, y: 330, radius: 30 }, { x: 700, y: 260, radius: 26 },
      { x: 520, y: 100, radius: 18 }, { x: 150, y: 400, radius: 24 }],
  ];
  let compared = 0;
  for (const layout of layouts) {
    const c = combat();
    c.breakables = layout.map((obstacle) => ({ ...obstacle }));
    for (let x = 100; x <= 860; x += 60) {
      for (let y = 100; y <= 440; y += 60) {
        for (let heading = 0; heading < 8; heading += 1) {
          const vx = Math.cos(heading * Math.PI / 4) * 120;
          const vy = Math.sin(heading * Math.PI / 4) * 120;
          for (const strafeDirection of [1, -1]) {
            const a = { x, y, radius: 12, strafeDirection };
            const b = { x, y, radius: 12, strafeDirection };
            const got = c.steerEnemyVelocity(a, vx, vy);
            const want = reference(c, b, vx, vy);
            assert.ok(Math.abs(got.x - want.x) < 1e-9 && Math.abs(got.y - want.y) < 1e-9, `${x},${y} h${heading}`);
            assert.equal(a.navigationSide, b.navigationSide);
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared > 1500);
});

test('BALANCE.md and this file describe the same set of rules', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'BALANCE.md'), 'utf8');
  const documented = [...doc.matchAll(/^###\s+([RT]\d+)\b/gm)].map((match) => match[1]).sort();
  const tested = [...fs.readFileSync(__filename, 'utf8').matchAll(/^test\('([RT]\d+):/gm)].map((match) => match[1]).sort();
  assert.ok(documented.length >= 12, 'BALANCE.md lists the rules as "### R1 ..." headings');
  assert.deepEqual(documented, tested);
  assert.match(source('mobmanager.js'), /BALANCE\.md/, 'the tuning table points at the document');
});

test('the pause toggle flips the setting, persists it, and labels the state and the input being read', () => {
  const stored = {};
  const texts = [];
  const ctx = new Proxy({}, {
    get: (target, method) => (method === 'fillText' ? (text) => texts.push(text) : () => {}),
    set: () => true,
  });
  const context = vm.createContext({
    ctx, gameSettings: { adaptiveEnemies: true }, SETTINGS_STORAGE_KEY: 'settings-key', NARRATION_ENABLED: false,
    localStorage: { setItem: (key, value) => { stored[key] = value; } },
    lastInputMode: 'keyboard', gamepadInput: { family: 'xbox' }, inputAI: { mode: 'touch' },
    ttsButtonBounds: () => ({ x: 24, y: 100, width: 170, height: 22 }),
  });
  loadFunctions(context, 'gameui.js',
    ['adaptiveToggleBounds', 'toggleAdaptiveEnemies', 'adaptiveToggleKeyLabel', 'drawAdaptiveToggle']);
  context.drawAdaptiveToggle();
  assert.deepEqual(texts, ['ADAPTIVE ENEMIES [E]: ON', 'Enemies are adapting to touch play']);
  context.toggleAdaptiveEnemies();
  assert.equal(JSON.parse(stored['settings-key']).adaptiveEnemies, false);
  texts.length = 0;
  context.drawAdaptiveToggle();
  assert.deepEqual(texts, ['ADAPTIVE ENEMIES [E]: OFF', 'Original enemy tactics']);
  context.lastInputMode = 'controller';
  assert.equal(context.adaptiveToggleKeyLabel(), 'Y');
  context.gamepadInput.family = 'ps';
  assert.equal(context.adaptiveToggleKeyLabel(), '△');
  context.localStorage = { setItem: () => { throw new Error('blocked'); } };
  context.toggleAdaptiveEnemies();
  assert.equal(context.gameSettings.adaptiveEnemies, true, 'a blocked store still lets the choice apply this session');
  assert.ok(context.adaptiveToggleBounds().y >= 100, 'the button sits below the audio panel');
});
