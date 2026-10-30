const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function room(x, y, extra = {}) {
  return {
    x, y, type: 'normal', sizeKey: 'small', links: {}, lockedDoors: {},
    visited: true, cleared: true, hidden: false, secretExit: null, ...extra,
  };
}

function link(a, b, direction) {
  const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' };
  a.links[direction] = true;
  b.links[opposite[direction]] = true;
}

function world(rooms, currentRoom) {
  const c = vm.createContext({
    player: { x: 0, y: 0, radius: 12 },
    mode: 'playing', deathTimer: 0, rooms, currentRoom, currentFloor: 1,
    directions: [
      { name: 'up', dx: 0, dy: -1 },
      { name: 'right', dx: 1, dy: 0 },
      { name: 'down', dx: 0, dy: 1 },
      { name: 'left', dx: -1, dy: 0 },
    ],
    oppositeDirection: { up: 'down', right: 'left', down: 'up', left: 'right' },
    ROOM_SIZES: { small: { w: 960, h: 540 } }, ROOM_W: 960, ROOM_H: 540,
    ROOM_WALL_THICKNESS: 64, PLAYER_VISUAL_HALF_WIDTH: 24, PLAYER_VISUAL_HEIGHT: 80, WALL_COLLISION_PADDING: 8,
    VIEW_W: 960, VIEW_H: 540,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  });
  for (const file of ['worldmanager.js', 'gameui.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c);
  }
  c.calls = [];
  vm.runInContext(`
    playSound = saveRunState = suppressHeldAttackInput = () => {};
    closeMap = () => calls.push('closeMap');
    captureRoomRuntime = (room) => calls.push(['capture', room]);
    spawnRoom = (room) => calls.push(['spawn', room]);
  `, c);
  return c;
}

// start(0,3) — a(1,3) — b(2,3), with c(1,2) above a.
function corridor() {
  const start = room(0, 3, { type: 'start' });
  const a = room(1, 3);
  const b = room(2, 3, { type: 'shop' });
  const up = room(1, 2);
  link(start, a, 'right');
  link(a, b, 'right');
  link(a, up, 'up');
  return { start, a, b, up };
}

test('map travel reaches cleared rooms through cleared rooms and enters by the last door', () => {
  const { start, a, b, up } = corridor();
  const c = world([start, a, b, up], start);
  const routes = c.mapTravelRoutes();
  assert.equal(routes.get(a), 'right');
  assert.equal(routes.get(b), 'right');
  assert.equal(routes.get(up), 'up');
  assert.equal(routes.has(start), false);

  assert.equal(c.travelToRoom(up), true);
  assert.equal(c.currentRoom, up);
  // Walking up enters through the bottom door.
  assert.equal(c.player.x, 480);
  assert.equal(c.player.y, 540 - (64 + 12 + 8));
  // Calls are built inside the vm context, so compare them piece by piece.
  assert.equal(c.calls.length, 3);
  assert.equal(c.calls[0], 'closeMap');
  assert.equal(c.calls[1][0], 'capture');
  assert.equal(c.calls[1][1], start);
  assert.equal(c.calls[2][0], 'spawn');
  assert.equal(c.calls[2][1], up);
});

test('map travel never crosses locked doors, hostile rooms or unexplored rooms', () => {
  const { start, a, b, up } = corridor();
  a.lockedDoors.right = true;
  b.lockedDoors.left = true;
  up.visited = false;
  const c = world([start, a, b, up], start);
  let routes = c.mapTravelRoutes();
  assert.equal(routes.has(b), false);
  assert.equal(routes.has(up), false);
  assert.equal(c.travelToRoom(b), false);
  assert.equal(c.currentRoom, start);

  delete a.lockedDoors.right;
  delete b.lockedDoors.left;
  a.cleared = false;
  routes = c.mapTravelRoutes();
  assert.equal(routes.has(a), false);
  assert.equal(routes.has(b), false, 'a hostile room blocks the way through it');
});

test('the map names what blocks a route: foes, a locked door, or both', () => {
  const { start, a, b, up } = corridor();
  const c = world([start, a, b, up], start);
  assert.equal(c.mapRouteBlocker(b), null);
  a.cleared = false;
  assert.equal(c.mapRouteBlocker(b), 'foes');
  a.cleared = true;
  a.lockedDoors.right = true;
  assert.equal(c.mapRouteBlocker(b), 'locked');
  start.links.right = true;
  a.cleared = false;
  assert.equal(c.mapRouteBlocker(b), 'both');
});

test('map travel is unavailable from a hostile room or while dying', () => {
  const { start, a, b, up } = corridor();
  const c = world([start, a, b, up], start);
  start.cleared = false;
  assert.equal(c.mapTravelRoutes().size, 0);
  start.cleared = true;
  c.deathTimer = 0.5;
  assert.equal(c.mapTravelRoutes().size, 0);
  c.deathTimer = 0;
  c.mode = 'paused';
  assert.equal(c.mapTravelRoutes().size, 0);
});

test('a secret room is reachable both ways only once it is revealed', () => {
  const { start, a, b, up } = corridor();
  const secret = room(1, 4, { type: 'secret', hidden: true, returnTo: a, returnDirection: 'up' });
  secret.links.up = true;
  a.secretExit = { direction: 'down', room: secret };
  const c = world([start, a, b, up, secret], start);
  assert.equal(c.mapTravelRoutes().has(secret), false);

  secret.hidden = false;
  assert.equal(c.mapTravelRoutes().get(secret), 'down');
  c.travelToRoom(secret);
  assert.equal(c.currentRoom, secret);
  assert.equal(c.mapTravelRoutes().get(start), 'left');
});

test('the full map fits every revealed room inside its area', () => {
  const area = vm.runInContext('MAP_AREA', world([room(0, 0)], room(0, 0)));
  const inside = (c, rooms) => {
    const { cell, originX, originY } = c.mapLayout();
    for (const r of rooms) {
      const x = originX + r.x * cell;
      const y = originY + r.y * cell;
      assert.ok(x >= area.x - 0.01 && x + cell <= area.x + area.w + 0.01, `room ${r.x},${r.y} fits horizontally`);
      assert.ok(y >= area.y - 0.01 && y + cell <= area.y + area.h + 0.01, `room ${r.x},${r.y} fits vertically`);
    }
    return cell;
  };

  const single = room(0, 3, { type: 'start' });
  const singleCell = inside(world([single], single), [single]);
  assert.equal(singleCell, 130, 'a one-room floor draws at the largest cell size');

  const corners = [room(0, 0), room(6, 0), room(0, 6), room(6, 6)];
  const fullCell = inside(world(corners, corners[0]), corners);
  assert.ok(fullCell >= 50, 'a floor spanning the whole grid stays readable');
});
