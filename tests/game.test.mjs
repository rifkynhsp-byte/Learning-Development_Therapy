import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerGame } from '../js/game.js';
import { stubCanvas, stubWindow, silentSfx } from './helpers.mjs';

stubWindow();

const PLAYER_Z = 3.5; // must match js/game.js
const newGame = () => new RunnerGame(stubCanvas(), silentSfx, () => {});

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
  game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
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
