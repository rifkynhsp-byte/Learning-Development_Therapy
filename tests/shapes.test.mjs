import test from 'node:test';
import assert from 'node:assert/strict';
import { detectShape, matchesShape, ShapeHold, SHAPES } from '../js/shapes.js';

/** Build a landmark set from a sketch of where the body parts are. */
function pose(parts) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const [i, [x, y]] of Object.entries(parts)) lm[i] = { x, y, visibility: 1 };
  return lm;
}

// Side-on, hands and knees, torso flat like a table.
const quadruped = (noseY) => pose({
  0: [0.30, noseY],
  11: [0.40, 0.50], 12: [0.40, 0.50],
  15: [0.40, 0.80], 16: [0.40, 0.80],
  23: [0.65, 0.50], 24: [0.65, 0.50],
  25: [0.65, 0.80], 26: [0.65, 0.80],
  27: [0.72, 0.85], 28: [0.72, 0.85],
});

// Face down, hips on the mat, chest pushed up, legs flat behind.
const cobra = pose({
  0: [0.38, 0.58],
  11: [0.45, 0.65], 12: [0.45, 0.65],
  15: [0.50, 0.80], 16: [0.50, 0.80],
  23: [0.65, 0.80], 24: [0.65, 0.80],
  25: [0.75, 0.82], 26: [0.75, 0.82],
  27: [0.85, 0.82], 28: [0.85, 0.82],
});

// Standing, arms and legs thrown wide.
const star = pose({
  0: [0.50, 0.28],
  11: [0.42, 0.35], 12: [0.58, 0.35],
  15: [0.15, 0.20], 16: [0.85, 0.20],
  23: [0.46, 0.55], 24: [0.54, 0.55],
  25: [0.40, 0.75], 26: [0.60, 0.75],
  27: [0.35, 0.95], 28: [0.65, 0.95],
});

// Ordinary standing, arms down.
const standing = pose({
  0: [0.50, 0.28],
  11: [0.45, 0.35], 12: [0.55, 0.35],
  15: [0.44, 0.60], 16: [0.56, 0.60],
  23: [0.46, 0.55], 24: [0.54, 0.55],
  25: [0.46, 0.75], 26: [0.54, 0.75],
  27: [0.46, 0.95], 28: [0.54, 0.95],
});

test('cow: hands and knees with the head lifted', () => {
  assert.equal(detectShape(quadruped(0.44)).shape, 'cow');
});

test('cat: hands and knees with the chin tucked', () => {
  assert.equal(detectShape(quadruped(0.53)).shape, 'cat');
});

test('a neutral table top is neither, but still counts for either', () => {
  assert.equal(detectShape(quadruped(0.50)).shape, 'quadruped');
  assert.equal(matchesShape(quadruped(0.50), 'cow'), true);
  assert.equal(matchesShape(quadruped(0.50), 'cat'), true);
});

test('cobra is told apart from a table top', () => {
  assert.equal(detectShape(cobra).shape, 'cobra');
  assert.equal(matchesShape(cobra, 'cow'), false);
});

test('a star needs both wide arms and wide feet', () => {
  assert.equal(detectShape(star).shape, 'star');
  assert.equal(detectShape(standing).shape, 'stand');
  assert.equal(matchesShape(standing, 'star'), false);
});

test('standing is never mistaken for a floor pose', () => {
  for (const target of ['cow', 'cat', 'cobra']) {
    assert.equal(matchesShape(standing, target), false, target);
  }
});

test('a body the tracker cannot see reports nothing', () => {
  const faded = standing.map((p, i) => (i >= 11 && i <= 24 ? { ...p, visibility: 0.05 } : p));
  assert.equal(detectShape(faded).shape, null);
  assert.equal(matchesShape(null, 'cow'), false);
});

test('a hold fills up while the pose is held', () => {
  const hold = new ShapeHold('cow');
  let state;
  for (let f = 0; f < Math.ceil(SHAPES.cow.hold * 60) + 5; f++) {
    state = hold.update(quadruped(0.44), 1 / 60);
  }
  assert.equal(state.done, true);
});

test('a wobble costs some progress but does not reset it', () => {
  const hold = new ShapeHold('cow');
  for (let f = 0; f < 60; f++) hold.update(quadruped(0.44), 1 / 60);   // 1 s held
  const peak = hold.held;
  for (let f = 0; f < 6; f++) hold.update(standing, 1 / 60);           // 0.1 s lost
  assert.ok(hold.held > 0, 'progress survives a blip');
  assert.ok(hold.held < peak, 'but it does decay');
});

test('a pose never held makes no progress', () => {
  const hold = new ShapeHold('cobra');
  for (let f = 0; f < 120; f++) hold.update(standing, 1 / 60);
  assert.equal(hold.held, 0);
  assert.equal(hold.everMatched, false);
});
