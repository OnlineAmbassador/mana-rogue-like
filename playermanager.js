/* Player combat, movement abilities, damage, and hit feedback. */

function getActiveAttackElement() {
  return magicElements.has(activeMagicElement) ? activeMagicElement : null;
}

function startingMagicElement(entry) {
  const elements = Object.keys(magicElementPalette);
  return entry.className === 'Mage' ? elements[Math.floor(Math.random() * elements.length)] : 'bubble';
}

function magicColor(projectile) {
  return magicElementPalette[projectile.element] || projectile.color || magicElementPalette.bubble || '#62d9ee';
}

function triggerHitStop(duration, minGap = 0) {
  const now = performance.now();
  if (minGap > 0 && now < hitStopReadyAt) return;
  hitStopTimer = Math.max(hitStopTimer, duration);
  hitStopReadyAt = now + (duration + minGap) * 1000;
}

function fireMode(style = activeCombatStyle) {
  return fireModes[style] || 'rapid';
}

function activeWeaponMod(style) {
  return shopItemCatalog.find((item) => item.kind === 'mod' && item.style === style && ownedItems.has(item.id)) || null;
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
      createGroundHazard(target.x, target.y + target.radius * 0.35, 'water', 'player', {
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
    chainLightningFrom(origin, damage, ownedItems.has('storm-spool') ? 4 : 2, true, color);
    for (let index = arcStart; index < lightningArcs.length; index += 1) {
      Object.assign(lightningArcs[index], { ttl: 0.4, color, owner: 'player' });
    }
    addParticles(origin.x, origin.y, color, 22, 200);
  } else if (effect === 'rot') {
    const victims = target?.hp > 0 ? [target] : near.slice(0, 2);
    for (const enemy of victims) {
      enemy.manaRotTimer = Math.max(enemy.manaRotTimer || 0, ownedItems.has('ember-seed') ? 4 : 2.4);
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
    const radius = ownedItems.has('nova-pearl') ? 135 : 95;
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

function isUpgradeAvailable(item) {
  if (item.kind === 'boss-relic') return false;
  const rangeTier = rangeLensItemIds.indexOf(item.id);
  const luckTier = ['luck-up-i', 'luck-up-ii'].indexOf(item.id);
  return isCatalogItemUnlocked(item) && (rangeTier < 0 || rangeTier === weapon.rangeLevel) &&
    (luckTier < 0 || luckTier === player.luck);
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
  for (const id of [...ownedItems].filter((itemId) => attackMorphs[itemId]).slice(-2)) {
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
    const next = enemies
      .filter((enemy) => enemy.hp > 0 && !enemy.manaRift && !struck.has(enemy) &&
        distanceBetween(enemy, source) < 190 && hasLineOfSight(source, enemy))
      .sort((a, b) => distanceBetween(a, source) - distanceBetween(b, source))[0];
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
  const reachBoost = charged ? 1.25 : 1;
  const arc = charged ? Math.PI : 0.95;
  const reachOf = (item) => (item === 'sword' ? 92 : item === 'daggers' ? 53 : 66) * reachBoost;
  const strikeRange = Math.max(...ownedWeapons.map(reachOf));
  const meleeProfile = characterProfile().melee * (styleSynergy('melee') ? 1.2 : 1);
  const damage = Math.max(1, Math.round((player.damage + weapon.damageBonus +
    ownedWeapons.reduce((bonus, item) => bonus + (item === 'sword' ? 2 : item === 'daggers' ? 1 : 0), 0)) * damageScale * meleeProfile));
  player.swordParryDamage = damage;
  player.swordParryRewarded = false;
  player.swordParryTimer = Math.max(player.swordParryTimer, 0.28);
  player.swordParryRadius = 0;
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
    const distance = Math.hypot(enemy.x - player.x, enemy.y - originY);
    if (distance <= strikeRange + enemy.radius && Math.abs(angleTo(enemy)) < arc &&
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
      charged,
      spin: charged,
      damage,
      hitEnemies: item === 'sword' ? new Set(hitEnemies) : null,
      element: getActiveAttackElement(),
    });
  });
  if (charged) {
    player.spin = { angle: baseAngle, timer: 0.38, duration: 0.38 };
    triggerCameraShake?.('charge');
  }
  if (activeWeaponMod('melee')?.id === 'mod-cinder') spawnFireWall(baseAngle, damage, charged);
  addParticles(player.x + Math.cos(baseAngle) * 44, originY + Math.sin(baseAngle) * 44,
    charged ? '#fff2a0' : combatPalette.melee, 7 + ownedWeapons.length * 3, 100);
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
      const dx = enemy.x - player.x;
      const dy = enemy.y - originY;
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
      if (bladeDistance > enemy.radius + 4) continue;

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

function spawnFireWall(angle, swingDamage, charged) {
  const distances = charged ? [50, 85, 120, 155] : [50, 85, 120];
  for (const distance of distances) {
    if (groundHazards.filter((hazard) => hazard.owner === 'player' && hazard.kind === 'fire').length >= 12) return;
    const x = clamp(player.x + Math.cos(angle) * distance, 50, ROOM_W - 50);
    const y = clamp(player.y + Math.sin(angle) * distance, 50, ROOM_H - 50);
    igniteMiasmaAt(x, y);
    createGroundHazard(x, y, 'fire', 'player', {
      radius: 30, duration: charged ? 3.2 : 2.4, damage: Math.max(1, Math.round(swingDamage * 0.4)),
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
    const parryDamage = Math.max(1, parryDamageBase) +
      Math.max(0, incoming.damage || 0);
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
  return target ? Math.atan2(target.y - attackOriginY(), target.x - player.x) : null;
}

function currentAimAngle() {
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
  return MELEE_CHARGE_TIME * (activeWeaponMod('melee')?.id === 'mod-windup' ? 0.7 : 1);
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
        addParticles(player.x, attackOriginY(), '#fff2a0', 12, 120);
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
  const normalCooldown = Math.max(0.5, (nativeStyle() === 'melee' ? character.fireDelay || 0.3 : 0.3) * FIRE_RATE_SCALE * 2.4) *
    (flurry ? 0.4 : 1) / (characterProfile().meleeRate * (styleSynergy('melee') && flurry ? 1.2 : 1));
  const normalScale = flurry ? 1.0 : MELEE_BASE_SCALE;
  // A charged swing deals the damage of every normal swing it replaces (hold time plus recovery), so DPS stays equal.
  const chargedScale = normalScale * clamp((meleeChargeTime() + normalCooldown * 1.3) / normalCooldown, 1, MAX_CHARGE_SHOTS);
  performMeleeSwing(baseAngle, charged ? chargedScale : normalScale, charged);
  if (charged) {
    player.swordParryTimer = Math.max(player.swordParryTimer, 0.38);
    player.swordParryRadius = 92 * 1.25;
    player.swordParryFlash = Math.max(player.swordParryFlash, 0.24);
  }
  // Heavy, deliberate swings (Diablo-style); only Flurry Gauntlets speed them up.
  player.fireCooldown = Math.max(0.5, (nativeStyle() === 'melee' ? character.fireDelay || 0.3 : 0.3) * FIRE_RATE_SCALE * 2.4) *
    (charged ? 1.3 : flurry ? 0.4 : 1) / (characterProfile().meleeRate * (styleSynergy('melee') && flurry ? 1.2 : 1));
  recordStyleUse('melee', player.fireCooldown);
  playSound('weapons/barehands/hit1.ogg', 0.2);
}

function bowChargeTime() {
  return BOW_CHARGE_TIME * (activeWeaponMod('bow')?.id === 'mod-draw' ? 0.7 : 1);
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
  const chargeTime = 0.9;
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
    const along = (enemy.x - start.x) * dx + (enemy.y - start.y) * dy;
    if (along <= 0 || along > obstacleDistance) continue;
    const nearest = { x: start.x + dx * along, y: start.y + dy * along };
    if (distanceBetween(enemy, nearest) > enemy.radius + projectile.beamWidth * 0.5) continue;
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
    if (enemy.hp <= 0 || enemy.manaRift ||
        distanceToSegment(enemy, start, beamEnd) > enemy.radius + projectile.beamWidth * 0.5) continue;
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
  const chargedBowBeam = style === 'bow' && bowCharge >= 0.3;
  const tripleBow = style === 'bow' && !bowCharge && fireMode('bow') === 'triple';
  if (player.fireCooldown > 0 && (!bowCharge || magicCharge)) return;
  const mod = activeWeaponMod(style);
  const modId = mod?.id;
  const bowPierce = modId === 'mod-pierce';
  const rapidQuiver = modId === 'mod-quiver';
  const chainCount = modId === 'mod-chain' || modId === 'mod-storm-arrows' ? 2 : 0;
  const modExplode = modId === 'mod-splash' ? 58 : 0;
  const modDrop = modId === 'mod-lingering' ? 'long' : null;
  const profile = characterProfile();
  const synergy = styleSynergy(style);
  if (!styleUnlocked(style)) return;
  const styleDamage = (style === 'magic' ? profile.magic : style === 'bow' ? profile.bow : 1) *
    (synergy ? 1.15 : 1);
  const normalInterval = attackDelay * FIRE_RATE_SCALE / (style === 'bow' ? profile.bowRate * (synergy ? 1.15 : 1) : 1);
  const chargeStrength = bowCharge || magicCharge;
  const holdSeconds = bowCharge ? BOW_TAP_WINDOW + bowCharge * bowChargeTime() : magicCharge * 0.9;
  const chargeMul = bowCharge || magicCharge ? clamp((holdSeconds + normalInterval) / normalInterval, 1, MAX_CHARGE_SHOTS) : 1;
  const chargedImpactBonus = chargeStrength > 0 ? 1 + chargeStrength * 0.75 : 1;
  const bowDamageMul = (style === 'magic' ? (magicCharge ? chargeMul * (1 + magicCharge * 3.5) : 1) : style !== 'bow' ? 1 : bowCharge ? chargeMul : rapidQuiver ? 0.6 : 1) *
    chargedImpactBonus * styleDamage *
    (tripleBow ? 0.6 : 1);
  const bowDelayMul = (style !== 'bow' ? 1 : bowCharge ? 1 : rapidQuiver ? 0.55 : 1) * (tripleBow ? 1.35 : 1) /
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
  player.attackAnimationStyle = style === 'bow' ? 'bow' : 'hand';
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
    const element = style === 'bow' ? null : getActiveAttackElement();
    // Prism fans out by default; only a non-water element fuses the fan into one heavy shot.
    const fusedElementalShot = !morph.surround && ownedItems.has('prism') && Boolean(element) &&
      element !== 'bubble' && weapon.shotCount > 1;
    const baseShots = tripleBow ? Math.max(3, weapon.shotCount) : weapon.shotCount;
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
        ? weapon.shotDamageMultiplier * weapon.shotCount * 1.6
        : weapon.shotDamageMultiplier;
      const arrowSize = style === 'bow' ? clamp(Math.sqrt(bowDamageMul), 0.7, 1.4) : 1;
      const shotProjectile = {
        x: player.x + vx * 18,
        y: attackOriginY + vy * 18,
        vx: vx * weapon.projectileSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul * (bowCharge ? 1.35 : 1),
        vy: vy * weapon.projectileSpeed * (fusedElementalShot ? 1.18 : 1) * morph.speedMul * (bowCharge ? 1.35 : 1),
        radius: style === 'magic' && magicCharge >= 0.25
          ? Math.max(6 * weapon.tearSize * morph.sizeMul, player.radius * 0.65 * magicCharge)
          : 6 * weapon.tearSize * arrowSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul * (bowCharge ? 1.1 + bowCharge * 0.2 : 1) * (magicCharge ? 1.1 + magicCharge * 0.2 : 1),
        size: weapon.tearSize * arrowSize * (fusedElementalShot ? 1.55 : 1) * morph.sizeMul *
          (bowCharge ? 1.1 + bowCharge * 0.2 : 1) * (magicCharge ? 1.1 + magicCharge * 0.65 : 1),
        color: element ? magicElementPalette[element] : style !== 'bow' && morph.color ? morph.color
          : style === 'bow' ? '#d8b577' : (weapon.shotCount > 1 ? combatPalette.volley : combatPalette.arcane),
        type: style === 'bow' ? 'arrow' : 'elemental',
        element,
        magicCluster: style === 'magic' && ownedItems.has('spore-bloom'),
        glow: null,
        damage: Math.max(1, Math.round((player.damage + weapon.damageBonus) * damageMultiplier * morph.damageMul * bowDamageMul)),
        ttl: chargedBowBeam ? 0.65 + bowCharge * 0.85 : 0.5 * weapon.rangeMultiplier * (bowCharge ? 1.4 : 1),
        dropCurve: bowCharge ? 3.2 : magicCharge ? 3 : undefined,
        piercesWalls: weapon.rangeLevel >= 3,
        fused: fusedElementalShot,
        shape: style === 'bow' ? null : morph.shape,
        pulse: morph.pulse,
        drop: modDrop || morph.drop,
        explode: Math.max(morph.explode, magicCharge >= 0.25 ? 54 : 0, modExplode),
        slowOnHit: morph.slowOnHit,
        pierce: style === 'bow' ? (bowPierce ? 9 : bowCharge ? 3 : 0) : magicCharge >= 0.5 ? 3 : 0,
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
      spawnPlayerProjectile(style === 'magic' ? prepareWildMagicShot(shotProjectile) : shotProjectile);
    }
  }
  player.fireCooldown = attackDelay * morph.delayMul * FIRE_RATE_SCALE * bowDelayMul;
  recordStyleUse(style, player.fireCooldown);
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

function cycleCombatStyle(step = 1) {
  const available = ['melee', 'bow', 'magic'].filter(styleUnlocked);
  const index = available.indexOf(activeCombatStyle);
  selectCombatStyle(available[(index + step + available.length) % available.length]);
}

function selectCombatStyle(style) {
  if (style === activeCombatStyle || weaponSwapCooldown > 0) return;
  weaponSwapCooldown = WEAPON_SWAP_COOLDOWN;
  activeCombatStyle = style;
  player.meleeCharge = 0;
  player.bowHold = 0;
  player.chargeFraction = 0;
  updateHud();
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
  bombs.push({ owner: 'player', x: player.x, y: player.y, fuse: 1.7, radius: 110 });
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

function explodeBomb(bomb) {
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

function useConsumable() {
  const available = consumables.filter((item) => item.count > 0);
  if (available.length === 0) {
    showMessage('No consumables ready. Find one in a shop.', 1.8);
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
        damageEnemy(enemy, 8, player.x, player.y);
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

function startDash() {
  if (mode !== 'playing' || dashCooldown > 0 || dashTimer > 0) return;
  if (currentRoom && (currentRoom.type === 'shop' || currentRoom.type === 'bank')) return;
  const dx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0) + gamepadInput.moveX + touchInput.moveX;
  const dy = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0) + gamepadInput.moveY + touchInput.moveY;
  const length = Math.hypot(dx, dy);
  dashVector = length > 0.1 ? { x: dx / length, y: dy / length } : { x: player.lookX, y: player.lookY };
  dashTimer = 0.16;
  dashCooldown = character?.className === 'Scout' ? 0.42 : 0.85;
  player.invuln = Math.max(player.invuln, 0.24);
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

function gainXp(amount) {
  if (character?.className === 'Scholar') amount *= 1.3;
  xpPoints += amount;
  while (xpPoints >= XP_PER_LEVEL(xpLevel)) {
    xpPoints -= XP_PER_LEVEL(xpLevel);
    xpLevel += 1;
    const boons = [
      ['Swift Boon: +speed', () => { player.speed *= 1.05; }],
      ['Might Boon: +1 damage', () => { player.damage += 1; }],
      ['Frenzy Boon: faster firing', () => { weapon.fireDelay = Math.max(0.12, weapon.fireDelay * 0.93); }],
      ['Vigor Boon: heal 1', () => { player.hp = Math.min(player.maxHp, player.hp + 1); }],
      ['Reach Boon: longer range', () => { weapon.rangeMultiplier *= 1.06; }],
    ];
    const [label, apply] = boons[Math.floor(Math.random() * boons.length)];
    apply();
    streakCallout.timer = streakCallout.duration;
    streakCallout.x = player.x;
    streakCallout.y = player.y - 70;
    streakCallout.text = `LEVEL ${xpLevel}! ${label}`;
    addParticles(player.x, player.y, '#7ee8ff', 16, 140);
    playSound('som:alteration/levelup.ogg', 0.3);
  }
  updateHud();
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
    const pulse = 1 + Math.sin(pod.fuse * 18) * 0.12;
    ctx.save();
    ctx.fillStyle = '#c878df';
    ctx.strokeStyle = '#f1c9fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pod.x, pod.y, pod.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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
    const fade = Math.max(0, beam.timer / 0.22);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ff7a9c';
    ctx.lineWidth = 12 * fade + 2;
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y);
    ctx.lineTo(beam.x + beam.dx * beam.length, beam.y + beam.dy * beam.length);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 * fade + 1;
    ctx.stroke();
    ctx.restore();
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
  if (bomb.owner === 'enemy' || !ownedItems.has('spore-bloom')) return;
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
const runStats = { seconds: 0, kills: 0, guardians: 0, zennyFound: 0, lastHitBy: '', unlocked: [] };

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
  player.invuln = 0.9;
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
  const innerRadius = Math.max(60, farthest * (0.72 - 0.3 * intensity));
  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, farthest);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.4, `rgba(0, 0, 0, ${(0.35 * intensity).toFixed(3)})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${(0.78 * intensity).toFixed(3)})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}
