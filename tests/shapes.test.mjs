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

test('a star shape reads as the letter X', () => {
  assert.equal(detectShape(star).shape, 'X');
  assert.equal(detectShape(standing).shape, 'stand');
  assert.equal(matchesShape(standing, 'X'), false);
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

// --------------------------------------------------------------- body letters

/**
 * Standing, facing the camera, with the arms placed by hand. Shoulders span
 * 0.16 of the frame and the torso is 0.20 tall, so one shoulder width is about
 * 0.16 and a full arm reach is about 0.35 from the centre line.
 */
function letterPose({ wristL, wristR, ankleSpread = 0.08 }) {
  const half = ankleSpread / 2;
  return pose({
    0: [0.50, 0.28],
    11: [0.42, 0.35], 12: [0.58, 0.35],
    15: wristL, 16: wristR,
    23: [0.46, 0.55], 24: [0.54, 0.55],
    25: [0.50 - half, 0.75], 26: [0.50 + half, 0.75],
    27: [0.50 - half, 0.95], 28: [0.50 + half, 0.95],
  });
}

test('T: arms straight out at shoulder height', () => {
  assert.equal(detectShape(letterPose({ wristL: [0.15, 0.35], wristR: [0.85, 0.35] })).shape, 'T');
});

test('Y: arms up and out, feet together', () => {
  assert.equal(detectShape(letterPose({ wristL: [0.28, 0.18], wristR: [0.72, 0.18] })).shape, 'Y');
});

test('O: hands meeting above the head', () => {
  assert.equal(detectShape(letterPose({ wristL: [0.47, 0.14], wristR: [0.53, 0.14] })).shape, 'O');
});

test('X: arms up and out with the feet apart', () => {
  assert.equal(
    detectShape(letterPose({ wristL: [0.20, 0.18], wristR: [0.80, 0.18], ankleSpread: 0.30 })).shape,
    'X');
});

test('A: feet wide, arms low and angled away', () => {
  assert.equal(
    detectShape(letterPose({ wristL: [0.26, 0.62], wristR: [0.74, 0.62], ankleSpread: 0.30 })).shape,
    'A');
});

test('L: one arm out sideways, the other down', () => {
  assert.equal(detectShape(letterPose({ wristL: [0.15, 0.35], wristR: [0.56, 0.62] })).shape, 'L');
  assert.equal(detectShape(letterPose({ wristL: [0.44, 0.62], wristR: [0.85, 0.35] })).shape, 'L');
});

test('ordinary standing is not read as any letter', () => {
  assert.equal(detectShape(letterPose({ wristL: [0.44, 0.60], wristR: [0.56, 0.60] })).shape, 'stand');
});

test('a Y is accepted for an X and the other way round', () => {
  const y = letterPose({ wristL: [0.28, 0.18], wristR: [0.72, 0.18] });
  assert.equal(matchesShape(y, 'X'), true, 'close enough: arms are up and out');
  assert.equal(matchesShape(y, 'T'), false, 'but a Y is not a T');
});

// ------------------------------------------------------------ cobra, loosened

test('cobra accepts a loose J shape, not just a full push-up', () => {
  // Lying down, only a small lift through the chest.
  const lazyCobra = pose({
    0: [0.40, 0.70],
    11: [0.46, 0.74], 12: [0.46, 0.74],
    15: [0.52, 0.82], 16: [0.52, 0.82],
    23: [0.66, 0.82], 24: [0.66, 0.82],
    25: [0.76, 0.84], 26: [0.76, 0.84],
    27: [0.86, 0.84], 28: [0.86, 0.84],
  });
  assert.equal(detectShape(lazyCobra).shape, 'cobra');
});

test('cobra still needs the child on the floor, not standing', () => {
  assert.equal(matchesShape(standing, 'cobra'), false);
  assert.equal(matchesShape(letterPose({ wristL: [0.15, 0.35], wristR: [0.85, 0.35] }), 'cobra'), false);
});

test('hands and knees is still cow or cat, never cobra', () => {
  assert.equal(matchesShape(quadruped(0.44), 'cobra'), false);
  assert.equal(matchesShape(quadruped(0.53), 'cobra'), false);
});
