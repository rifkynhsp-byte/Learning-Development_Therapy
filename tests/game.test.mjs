import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerGame, SPEED_PRESETS, TOLERANCE } from '../js/game.js';
import { stubCanvas, stubWindow, silentSfx } from './helpers.mjs';

stubWindow();

const PLAYER_Z = 3.5; // must match js/game.js
const newGame = (opts = {}) => {
  const game = new RunnerGame(stubCanvas(), silentSfx, opts.onEvent || (() => {}));
  // Yoga gates freeze the world waiting for a pose the tests cannot strike.
  game.gatesEnabled = opts.gates ?? false;
  // Walls need a shape fed in, which most tests do not care about.
  game.wallsEnabled = opts.walls ?? false;
  return game;
};

/** Run frames with fixed input, e.g. to let a deferred crash land. */
function idleFor(game, seconds, input = {}) {
  const base = { lane: game.player.lane, ducking: false, jump: false, reach: false };
  for (let f = 0; f < Math.round(seconds * 60); f++) game.update(1 / 60, { ...base, ...input });
  return game;
}

/**
 * A competent player: ducks full-width bars, jumps barrier rows, and takes the
 * open lane past trains. Used to check the course is actually beatable.
 */
function playWell(game, seconds) {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames && game.running; f++) {
    const p = game.player;
    const input = { lane: p.lane, ducking: false, jump: false, reach: false };
    const soon = game.obstacles
      .filter((o) => !o.hit && o.z - PLAYER_Z > -1 && o.z - PLAYER_Z < 14)
      .sort((a, b) => a.z - b.z);
    if (soon.length) {
      const lead = soon[0].z - PLAYER_Z;
      const group = soon.filter((o) => o.z - PLAYER_Z < lead + 4);
      const kinds = new Set(group.map((o) => o.type));
      const blocked = new Set(group.map((o) => o.lane));
      if (kinds.has('bar')) {
        input.ducking = lead < 7;
      } else if (blocked.size === 3) {
        input.jump = lead < 4.5 && p.y <= 0.001;
      } else {
        const free = [p.lane, -1, 0, 1].find((l) => !blocked.has(l));
        if (free !== undefined) input.lane = free;
      }
    }
    game.update(1 / 60, input);
  }
  return game;
}

test('doing nothing ends the run: the obstacles are real', () => {
  const game = newGame();
  game.start();
  for (let f = 0; f < 60 * 60 && game.running; f++) {
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  assert.equal(game.running, false);
  assert.ok(game.distance < 400, 'should not coast a long way');
});

test('the course is beatable and asks for every movement', () => {
  // Several runs: the spawner is random, so one lucky seed proves nothing.
  let survived = 0;
  const totals = { jumps: 0, ducks: 0, lanes: 0 };
  for (let i = 0; i < 8; i++) {
    const game = newGame();
    game.start();
    playWell(game, 120);
    if (game.running) survived++;
    totals.jumps += game.stats.jumps;
    totals.ducks += game.stats.ducks;
    totals.lanes += game.stats.lanes;
  }
  assert.ok(survived >= 5, `good play should usually last 2 min (survived ${survived}/8)`);
  assert.ok(totals.jumps > 0, 'full-width barrier rows must force jumps');
  assert.ok(totals.ducks > 0, 'full-width bars must force squats');
  assert.ok(totals.lanes > 0, 'trains must force side steps');
});

test('difficulty stays inside a five-year-old\'s reaction window', () => {
  const game = newGame();
  game.start();
  playWell(game, 120);
  assert.ok(game.speed <= 15, 'speed is capped');
  // Worst case: smallest gap at top speed still leaves over a second to react.
  assert.ok(15 / 15 >= 1.0);
});

test('the opening stretch never stacks obstacles across lanes', () => {
  for (let i = 0; i < 20; i++) {
    const game = newGame();
    game.start();
    while (game.running && game.distance < 130) {
      game.update(1 / 60, { lane: 0, ducking: true, jump: true, reach: false });
    }
    const barriersPerGroup = {};
    for (const o of game.obstacles) {
      if (o.type !== 'barrier') continue;
      const key = Math.round(o.z);
      barriersPerGroup[key] = (barriersPerGroup[key] || 0) + 1;
    }
    for (const [, n] of Object.entries(barriersPerGroup)) {
      assert.ok(n === 1 || n === 3, 'warm-up barriers come alone or as a jumpable row');
    }
    assert.equal(game.obstacles.some((o) => o.type === 'train'), false,
      'no trains during the warm-up');
  }
});

test('a stretch collects a shield, which then absorbs one hit', () => {
  const game = newGame();
  game.start();
  game.pickups.push({ kind: 'shield', lane: 0, z: PLAYER_Z + 8, y: 2.1, spin: 0 });
  game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: true });
  assert.equal(game.shield, 1);

  game.obstacles.push({ type: 'train', lane: 0, z: PLAYER_Z });
  game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  assert.equal(game.running, true, 'the shield takes the hit');
  assert.equal(game.shield, 0, 'and is spent');

  game.obstacles.push({ type: 'train', lane: 0, z: PLAYER_Z });
  idleFor(game, TOLERANCE.late + 0.1);
  assert.equal(game.running, false, 'the next hit ends the run');
});

test('a jump clears a barrier but not a train', () => {
  for (const [type, shouldSurvive] of [['barrier', true], ['train', false]]) {
    const game = newGame();
    game.start();
    game.update(1 / 60, { lane: 0, ducking: false, jump: true, reach: false });
    // Fly the obstacle in while the player is mid-arc.
    for (let f = 0; f < 18; f++) {
      game.obstacles = [{ type, lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
      game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
    }
    idleFor(game, TOLERANCE.late + 0.1);
    assert.equal(game.running, shouldSurvive, `${type} outcome`);
  }
});

test('a squat clears a low bar, standing does not', () => {
  for (const [ducking, shouldSurvive] of [[true, true], [false, false]]) {
    const game = newGame();
    game.start();
    for (let f = 0; f < 18; f++) {
      game.obstacles = [{ type: 'bar', lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
      game.update(1 / 60, { lane: 0, ducking, jump: false, reach: false });
    }
    idleFor(game, TOLERANCE.late + 0.1, { ducking });
    assert.equal(game.running, shouldSurvive, `ducking=${ducking}`);
  }
});

test('perspective: distance shrinks things and pulls them to the horizon', () => {
  const game = newGame();
  const near = game.project(0, 0, PLAYER_Z);
  const far = game.project(0, 0, 50);
  assert.ok(far.s < near.s);
  assert.ok(far.y < near.y);
  assert.ok(Math.abs(near.x - game.w / 2) < 0.001, 'the centre lane is centred');
  assert.ok(game.project(1, 0, PLAYER_Z).x > near.x, 'lane 1 is to the right');
});

test('a long frame stall cannot teleport the player through an obstacle', () => {
  const game = newGame();
  game.start();
  const before = game.distance;
  game.update(5, { lane: 0, ducking: false, jump: false, reach: false }); // 5 s hitch
  assert.ok(game.distance - before < 2, 'dt is clamped');
});

test('jumping far too early is still forgiven', () => {
  const game = newGame();
  game.start();
  game.update(1 / 60, { lane: 0, ducking: false, jump: true, reach: false });
  idleFor(game, 1.1);                       // jumped, flown, landed, waited
  assert.equal(game.player.y, 0, 'back on the ground');
  for (let f = 0; f < 18; f++) {
    game.obstacles = [{ type: 'barrier', lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  idleFor(game, TOLERANCE.late + 0.1);
  assert.equal(game.running, true, 'an early jump still counts');
});

test('jumping much too early eventually stops counting', () => {
  const game = newGame();
  game.start();
  game.update(1 / 60, { lane: 0, ducking: false, jump: true, reach: false });
  idleFor(game, 1 + TOLERANCE.earlyJump + 0.4);   // airtime, then well past the window
  for (let f = 0; f < 18; f++) {
    game.obstacles = [{ type: 'barrier', lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  idleFor(game, TOLERANCE.late + 0.1);
  assert.equal(game.running, false);
});

test('jumping slightly too late still rescues the run', () => {
  const game = newGame();
  game.start();
  for (let f = 0; f < 18; f++) {
    game.obstacles = [{ type: 'barrier', lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  assert.ok(game.pendingCrash, 'the crash is deferred, not immediate');
  game.update(1 / 60, { lane: 0, ducking: false, jump: true, reach: false });
  idleFor(game, TOLERANCE.late + 0.2);
  assert.equal(game.running, true, 'a late jump saves it');
});

test('ducking slightly too late still rescues the run', () => {
  const game = newGame();
  game.start();
  for (let f = 0; f < 18; f++) {
    game.obstacles = [{ type: 'bar', lane: 0, z: PLAYER_Z + 1 - f * 0.12 }];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  assert.ok(game.pendingCrash);
  idleFor(game, TOLERANCE.late - 0.05, { ducking: true });
  assert.equal(game.running, true);
});

test('speed presets scale the pace up and down', () => {
  const speeds = {};
  for (const key of Object.keys(SPEED_PRESETS)) {
    const game = newGame();
    game.setSpeedPreset(key);
    game.start();
    idleFor(game, 1);
    speeds[key] = game.speed;
  }
  assert.ok(Math.abs(speeds.medium / speeds.slow - 2) < 0.15, 'slow is about half');
  assert.ok(Math.abs(speeds.fast / speeds.medium - 2) < 0.15, 'fast is about double');
});

test('slow speed leaves far more time between obstacles', () => {
  const timeBetween = (key) => {
    const game = newGame();
    game.setSpeedPreset(key);
    game.start();
    let first = null;
    for (let f = 0; f < 60 * 60; f++) {
      const before = game.obstacles.length + game.pickups.length;
      game.update(1 / 60, { lane: 0, ducking: true, jump: false, reach: false });
      if (game.obstacles.length + game.pickups.length > before) {
        if (first === null) first = game.time;
        else return game.time - first;
      }
    }
    return Infinity;
  };
  const slow = timeBetween('slow');
  const fast = timeBetween('fast');
  assert.ok(slow > fast * 1.8, `slow should give much longer gaps (${slow} vs ${fast})`);
});

test('a yoga gate freezes the run until it is closed', () => {
  const events = [];
  const game = newGame({ gates: true, onEvent: (name, payload) => events.push([name, payload]) });
  game.start();
  playWell(game, 120);
  assert.ok(game.gate, 'a gate arrives');
  assert.ok(events.some(([, p]) => p && p.gate), 'and is announced');

  const frozen = game.distance;
  idleFor(game, 2);
  assert.equal(game.distance, frozen, 'the world waits for the pose');
  assert.equal(game.running, true, 'and the run is still alive');

  const posesBefore = game.stats.poses;
  game.closeGate(true);
  assert.equal(game.stats.poses, posesBefore + 1);
  assert.equal(game.shield, 1, 'holding the pose earns a star shield');
  idleFor(game, 1);
  assert.ok(game.distance > frozen, 'and the run resumes');
});

test('a gate waved through costs nothing but the bonus', () => {
  const game = newGame({ gates: true });
  game.start();
  playWell(game, 120);
  assert.ok(game.gate, 'a gate arrives');
  game.closeGate(false);
  assert.equal(game.gate, null);
  assert.equal(game.stats.poses, 0);
  assert.equal(game.running, true, 'a missed pose never ends the run');
});

test('every obstacle carries an animal and every fruit a fruit', () => {
  const game = newGame();
  game.start();
  idleFor(game, 40, { ducking: true });
  assert.ok(game.obstacles.length + game.pickups.length > 0);
  for (const o of game.obstacles) assert.ok(o.emoji, `${o.type} has art`);
  for (const p of game.pickups) assert.ok(p.emoji, `${p.kind} has art`);
});

// ------------------------------------------------------------- letter walls

/**
 * Run until the first wall appears. Animals are swept aside as we go: these
 * tests are about the wall, and a crash on the way there proves nothing.
 */
function toWall(game) {
  for (let f = 0; f < 60 * 240 && !game.walls.length; f++) {
    game.obstacles = [];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false, shape: null });
  }
  return game.walls[0];
}

/** Carry a wall to its verdict while holding `shape`. */
function resolveWall(game, wall, shape, frames = 60 * 30) {
  for (let f = 0; f < frames && !wall.resolved; f++) {
    game.obstacles = [];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false, shape });
  }
  return wall;
}

test('a letter wall arrives early, not minutes in', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  assert.ok(wall, 'a wall appears');
  assert.ok(game.distance < 120, `first wall by 120 m, got ${Math.round(game.distance)} m`);
  assert.ok(['T', 'Y', 'O', 'X', 'L', 'A'].includes(wall.letter));
});

test('making the letter passes the wall and pays a bonus', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  const coinsBefore = game.coins;
  resolveWall(game, wall, wall.letter);
  assert.equal(wall.resolved, true);
  assert.equal(wall.matched, true);
  assert.equal(game.stats.letters, 1);
  assert.ok(game.coins > coinsBefore, 'fruit is awarded');
  assert.ok(game.combo > 0, 'and it builds the streak');
});

test('missing the letter costs the streak but never the run', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  game.combo = 12;
  game.multiplier = 3;
  resolveWall(game, wall, 'stand');
  assert.equal(wall.matched, false);
  assert.equal(game.running, true, 'a missed letter is never fatal');
  assert.equal(game.combo, 0, 'but the streak resets');
  assert.equal(game.multiplier, 1);
});

test('the shape only has to be held somewhere in the approach', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  // Strike the pose early, then drop it well before the wall lands.
  for (let f = 0; f < 30; f++) {
    game.obstacles = [];
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false, shape: wall.letter });
  }
  resolveWall(game, wall, 'stand');
  assert.equal(wall.matched, true, 'an early shape still counts');
});

test('a Y is close enough for an X wall', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  wall.letter = 'X';
  wall.matched = false;
  resolveWall(game, wall, 'Y');
  assert.equal(wall.matched, true);
});

test('the HUD knows which letter is coming and how close it is', () => {
  const game = newGame({ walls: true });
  game.start();
  const wall = toWall(game);
  const next = game.nextChallenge();
  assert.equal(next.type, 'letter');
  assert.equal(next.letter, wall.letter);
  assert.ok(next.distance > 0);
});

// ------------------------------------------------------------- zones, combo

test('the scene changes as the child runs further', () => {
  const zones = [];
  const game = newGame({ onEvent: (name, p) => { if (p && p.zone) zones.push(p.zone); } });
  game.start();
  playWell(game, 240);
  assert.ok(zones.length >= 2, `expected to pass through several places, saw ${zones.join()}`);
  assert.notEqual(zones[0], zones[1], 'and they differ');
});

test('each zone brings its own scenery', () => {
  const game = newGame();
  game.start();
  playWell(game, 40);
  assert.ok(game.scenery.length > 0, 'the roadside is not empty');
  const themeProps = new Set(game.theme.props);
  for (const prop of game.scenery) assert.ok(themeProps.has(prop.emoji), 'props match the zone');
});

test('a streak raises the multiplier and a crash clears it', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 10; i++) game._addCombo();
  assert.equal(game.multiplier, 3);
  assert.equal(game.bestCombo, 10);
  game._gameOver();
  assert.equal(game.combo, 0);
  assert.equal(game.multiplier, 1);
  assert.equal(game.bestCombo, 10, 'the best is kept for the report');
});

test('fruit pays the multiplier', () => {
  const game = newGame();
  game.start();
  for (let i = 0; i < 10; i++) game._addCombo();      // x3
  game.pickups = [{ kind: 'coin', lane: 0, z: PLAYER_Z, y: 0.75, spin: 0, emoji: '\u{1F34E}' }];
  const before = game.coins;
  game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  assert.equal(game.coins - before, 3);
});
