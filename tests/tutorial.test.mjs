import test from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial, wholeBodyVisible } from '../js/tutorial.js';
import { body } from './helpers.mjs';

const idle = { present: true, lane: 0, ducking: false, jump: false, reach: false };
const silent = new Proxy({}, { get: () => () => {} });

function newTutorial(drills = ['jump', 'duck', 'right', 'left', 'stretch']) {
  const said = [];
  const t = new Tutorial({
    say: (text) => said.push(text),
    sfx: silent,
    drills,
    calibrate: () => Promise.resolve({}),
  });
  return { t, said };
}

/** Get past framing and calibration to the first drill. */
async function toFirstDrill(t) {
  for (let f = 0; f < 120 && t.phase === 'framing'; f++) t.update(1 / 60, idle, body());
  await Promise.resolve(); await Promise.resolve();
  for (let f = 0; f < 5 && t.phase !== 'drill'; f++) t.update(1 / 60, idle, body());
  return t;
}

test('it waits until the whole child is in frame', () => {
  const { t } = newTutorial();
  // Present, but the tracker cannot see them at all.
  for (let f = 0; f < 120; f++) t.update(1 / 60, { ...idle, present: false }, null);
  assert.equal(t.phase, 'framing');
  const view = t.update(1 / 60, { ...idle, present: false }, null);
  assert.match(view.message, /step back/i);
});

test('feet out of shot is not good enough', () => {
  const cropped = body().map((p, i) => (i === 27 || i === 28 ? { ...p, visibility: 0.1 } : p));
  assert.equal(wholeBodyVisible(cropped), false);
  assert.equal(wholeBodyVisible(body()), true);
});

test('it walks through one move at a time, in order', async () => {
  const { t } = newTutorial();
  await toFirstDrill(t);
  assert.equal(t.current.key, 'jump');

  t.update(1 / 60, { ...idle, jump: true }, body());
  assert.equal(t.list[0].state, 'passed');
  // The pause after praise is deliberate, so the child hears it.
  for (let f = 0; f < 120 && t.current.key === 'jump'; f++) t.update(1 / 60, idle, body());
  assert.equal(t.current.key, 'duck');
});

test('a drill is only passed by the movement it asked for', async () => {
  const { t } = newTutorial(['duck']);
  await toFirstDrill(t);
  for (let f = 0; f < 60; f++) t.update(1 / 60, { ...idle, jump: true, lane: 1 }, body());
  assert.equal(t.list[0].state, 'todo', 'jumping does not pass the duck drill');
  for (let f = 0; f < 30; f++) t.update(1 / 60, { ...idle, ducking: true }, body());
  assert.equal(t.list[0].state, 'passed');
});

test('a drill the child cannot do is skipped, never a dead end', async () => {
  const { t, said } = newTutorial(['stretch']);
  await toFirstDrill(t);
  for (let f = 0; f < 60 * 25; f++) t.update(1 / 60, idle, body());
  assert.equal(t.list[0].state, 'skipped');
  assert.ok(said.some((s) => /tricky/i.test(s)), 'and it is said kindly');
});

test('the child is nudged with a plainer hint halfway through', async () => {
  const { t, said } = newTutorial(['jump']);
  await toFirstDrill(t);
  const before = said.length;
  for (let f = 0; f < 60 * 10; f++) t.update(1 / 60, idle, body());
  assert.ok(said.length > before, 'a reminder is spoken');
});

test('finishing every drill leads to a countdown and then the game', async () => {
  const { t } = newTutorial(['jump']);
  await toFirstDrill(t);
  t.update(1 / 60, { ...idle, jump: true }, body());
  for (let f = 0; f < 60 * 10 && !t.done; f++) t.update(1 / 60, idle, body());
  assert.equal(t.done, true);
  assert.equal(t.progress, 1);
});

test('the floor poses are run as held drills', async () => {
  const { t } = newTutorial(['cow']);
  await toFirstDrill(t);
  assert.equal(t.current.shape, 'cow');
  const view = t.update(1 / 60, idle, body());
  assert.equal(typeof view.holdProgress, 'number', 'a hold bar is offered');
});

test('the checklist reports what was passed and what was skipped', async () => {
  const { t } = newTutorial(['jump', 'duck']);
  await toFirstDrill(t);
  t.update(1 / 60, { ...idle, jump: true }, body());
  for (let f = 0; f < 60 * 30 && !t.done; f++) t.update(1 / 60, idle, body());
  const states = Object.fromEntries(t.view().checklist.map((d) => [d.key, d.state]));
  assert.equal(states.jump, 'passed');
  assert.equal(states.duck, 'skipped');
});

test('with no camera it skips framing and goes straight to the drills', async () => {
  const t = new Tutorial({ say: () => {}, sfx: silent, drills: ['jump'], framing: false });
  t.update(1 / 60, idle, null);
  await Promise.resolve(); await Promise.resolve();
  t.update(1 / 60, idle, null);
  assert.equal(t.phase, 'drill', 'framing is not a dead end without a camera');
});
