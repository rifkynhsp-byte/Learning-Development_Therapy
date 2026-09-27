import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerGame, HEARTS } from '../js/game.js';
import { ADVENTURES, MOVES, MOVE_WORDS, adventureByKey, makeQuestion, say } from '../js/lessons.js';
import { SHAPES } from '../js/shapes.js';
import { stubCanvas, stubWindow, silentSfx } from './helpers.mjs';

stubWindow();

const PLAYER_Z = 3.5; // must match js/game.js

function newGame(key, onEvent = () => {}) {
  const game = new RunnerGame(stubCanvas(), silentSfx, onEvent);
  game.gatesEnabled = false;
  game.wallsEnabled = true;
  game.setAdventure(adventureByKey(key));
  return game;
}

/**
 * A child who does whatever the current lesson asks, and answers every
 * question with the right lane. Ordinary obstacles are handled the way the
 * playWell helper in game.test.mjs does.
 */
function playLessons(game, seconds, { answerRight = true, doLessons = true } = {}) {
  for (let f = 0; f < Math.round(seconds * 60) && game.running; f++) {
    const p = game.player;
    const input = { lane: p.lane, ducking: false, jump: false, reach: false, shape: null };
    const L = game.lesson;

    if (L.quiz && L.quiz.z - PLAYER_Z < 30) {
      const want = L.quiz.options.find((o) => o.correct === answerRight);
      input.lane = want.lane;
    }
    const stop = L.stop;
    if (doLessons && stop && stop.move === 'reach' && stop.z - PLAYER_Z < 10) input.reach = true;
    if (doLessons && stop && stop.move === 'letter') input.shape = stop.step.letter;

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

test('every adventure is complete and in both languages', () => {
  assert.ok(ADVENTURES.length >= 5);
  const keys = new Set();
  for (const adv of ADVENTURES) {
    assert.ok(!keys.has(adv.key), `duplicate key ${adv.key}`);
    keys.add(adv.key);
    assert.ok(['cycle', 'animals'].includes(adv.kind), adv.key);
    for (const pair of [adv.intro, adv.ethic, { id: adv.id, en: adv.en }]) {
      assert.ok(pair.id && pair.en, `${adv.key} needs Indonesian and English`);
    }
    assert.ok(adv.steps.length >= 4, `${adv.key} is too short to teach anything`);
    assert.ok(adv.zones.length >= 1);
    const emojis = new Set();
    for (const step of adv.steps) {
      assert.ok(MOVES.includes(step.move), `${adv.key}/${step.en}: unknown move ${step.move}`);
      assert.ok(MOVE_WORDS[step.move]);
      if (step.move === 'letter') assert.ok(SHAPES[step.letter], `${step.en}: no body letter ${step.letter}`);
      for (const pair of [step.do, step.fact, step]) assert.ok(pair.id && pair.en, `${adv.key}/${step.en}`);
      if (adv.kind === 'animals') assert.ok(step.q && step.q.id && step.q.en, `${step.en} needs a question`);
      assert.ok(!emojis.has(step.emoji), `${adv.key}: two steps share ${step.emoji}, a question could not tell them apart`);
      emojis.add(step.emoji);
    }
  }
});

test('the water cycle is taught in order and closes the loop', () => {
  const water = adventureByKey('water');
  const names = water.steps.map((s) => s.en);
  assert.deepEqual(names, ['The sea', 'Evaporation', 'Condensation', 'Wind', 'Rain', 'Flowing back']);
  // Each stage asks for a different movement from the one before, so acting
  // out the cycle is itself varied exercise.
  for (let i = 0; i < water.steps.length; i++) {
    const next = water.steps[(i + 1) % water.steps.length];
    assert.notEqual(water.steps[i].move, next.move, `${water.steps[i].en} and ${next.en}`);
  }
});

test('every question has exactly one right answer, from the same adventure', () => {
  let r = 0;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (const adv of ADVENTURES) {
    for (let i = 0; i < adv.steps.length; i++) {
      const q = makeQuestion(adv, i, rand);
      assert.equal(q.options.length, 3);
      assert.equal(q.options.filter((o) => o.correct).length, 1);
      const right = q.options.find((o) => o.correct);
      assert.equal(right.emoji, adv.steps[i].emoji);
      for (const o of q.options) assert.ok(adv.steps.some((s) => s.emoji === o.emoji));
      assert.ok(q.prompt.id && q.prompt.en);
    }
  }
  const cycleQ = makeQuestion(adventureByKey('water'), 2);
  assert.match(cycleQ.prompt.en, /After evaporation/);
  assert.match(cycleQ.prompt.id, /Setelah penguapan/);
});

test('language picking', () => {
  const pair = { id: 'Hujan', en: 'Rain' };
  assert.equal(say(pair, 'id'), 'Hujan');
  assert.equal(say(pair, 'en'), 'Rain');
  assert.match(say(pair, 'both'), /Hujan.*Rain/);
});

test('a child who acts out every stage learns the whole water cycle, then gets questions', () => {
  const events = [];
  const game = newGame('water', (label, payload) => events.push({ label, payload }));
  game.start();
  playLessons(game, 150);
  const learned = events.filter((e) => e.payload.learned).map((e) => e.payload.learned.step.en);
  assert.ok(learned.length >= 6, `learned only ${learned.join(', ')}`);
  assert.deepEqual(learned.slice(0, 6), adventureByKey('water').steps.map((s) => s.en),
    'stages must come in cycle order');
  assert.ok(events.some((e) => e.payload.learned?.loopDone), 'finishing the cycle is announced');
  const answers = events.filter((e) => e.payload.answer);
  assert.ok(answers.length >= 1, 'questions follow the first loop');
  assert.ok(answers.every((e) => e.payload.answer.correct));
  assert.equal(game.stats.quizRight, answers.length);
});

test('a question answered in the wrong lane is corrected, not punished', () => {
  const events = [];
  const game = newGame('sea', (label, payload) => events.push({ label, payload }));
  game.start();
  game.lesson.loops = 1;            // skip ahead: questions from the first stop
  playLessons(game, 40, { answerRight: false });
  const answers = events.filter((e) => e.payload.answer);
  assert.ok(answers.length >= 1);
  assert.ok(answers.every((e) => !e.payload.answer.correct && e.payload.answer.right.correct));
  assert.ok(game.running, 'a wrong answer never ends the run');
  assert.equal(game.hearts, HEARTS, 'and never costs a heart');
});

test('a missed stretch or letter comes round again instead of being skipped', () => {
  const events = [];
  const game = newGame('water', (label, payload) => events.push({ label, payload }));
  game.start();
  game.lesson.index = 1;            // Evaporation: stretch up
  playLessons(game, 30, { doLessons: false });
  const missed = events.filter((e) => e.payload.lessonMissed);
  assert.ok(missed.length >= 1);
  assert.equal(missed[0].payload.lessonMissed.step.en, 'Evaporation');
  assert.equal(game.lesson.index, 1, 'still on evaporation until it is done');
  const again = events.filter((e) => e.payload.lesson && e.payload.lesson.step.en === 'Evaporation');
  assert.ok(again.length >= 2, 'the same stage is offered again');
});

test('a dodge stop always needs a step: the open lane is never where the child stands', () => {
  for (let i = 0; i < 30; i++) {
    const game = newGame('sea');
    game.start();
    game.player.lane = [-1, 0, 1][i % 3];
    game.distance = game.lesson.nextAt;
    game.lesson.index = 0;          // the crab
    game._spawnLessonStop();
    const stop = game.lesson.stop;
    assert.equal(stop.move, 'dodge');
    assert.notEqual(stop.free, game.player.lane);
    const blocked = game.obstacles.filter((o) => o.lesson).map((o) => o.lane);
    assert.ok(blocked.includes(game.player.lane));
    assert.ok(!blocked.includes(stop.free));
  }
});

test('in an adventure a crash costs a heart, and only the last heart ends the run', () => {
  const game = newGame('wild');
  game.start();
  let frames = 0;
  while (game.running && frames < 60 * 240) {
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false, shape: null });
    frames++;
  }
  assert.equal(game.running, false, 'standing still still ends eventually');
  assert.equal(game.hearts, 1, `used ${HEARTS - 1} hearts before the end`);
});

test('a free run is unchanged: no lessons, no hearts, first crash ends it', () => {
  const events = [];
  const game = new RunnerGame(stubCanvas(), silentSfx, (label, payload) => events.push(payload));
  game.gatesEnabled = false;
  game.wallsEnabled = false;
  game.setAdventure(null);
  game.start();
  for (let f = 0; f < 60 * 60 && game.running; f++) {
    game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  }
  assert.equal(game.running, false);
  assert.equal(game.hearts, HEARTS);
  assert.ok(!events.some((p) => p.lesson || p.quiz || p.learned));
});

test('adventures run through their own places', () => {
  const game = newGame('sea');
  game.start();
  assert.equal(game.theme.key, 'reef');
  game.distance = 270;
  game._updateZone();
  assert.equal(game.theme.key, 'deep-sea');
  game.setAdventure(null);
  game.start();
  assert.equal(game.theme.key, 'city');
});

test('a yoga gate waits for the lesson on the track instead of wiping it', () => {
  const game = newGame('water');
  game.gatesEnabled = true;
  game.start();
  game.distance = game.lesson.nextAt;
  game._spawnLessonStop();
  const lessonObstacles = game.obstacles.filter((o) => o.lesson).length;
  game.nextGateAt = game.distance;
  game.update(1 / 60, { lane: 0, ducking: false, jump: false, reach: false });
  assert.equal(game.gate, null, 'no gate while the lesson stop approaches');
  assert.equal(game.obstacles.filter((o) => o.lesson).length, lessonObstacles);
});
