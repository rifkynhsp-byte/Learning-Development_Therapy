import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseController } from '../js/pose.js';
import { body, wait } from './helpers.mjs';

/** Push synthetic landmarks through the same path the camera loop uses. */
function feed(pc, lm, frames = 10) {
  for (let i = 0; i < frames; i++) {
    const m = pc._measure(lm);
    assert.ok(m, 'landmarks should be accepted');
    if (pc._calibSamples) pc._collect(m);
    else pc._classify(m);
  }
}

async function calibrated() {
  const pc = new PoseController({ readyState: 4, currentTime: 0 }, null);
  const done = pc.calibrate(60);
  feed(pc, body(), 20);
  await wait(90);
  feed(pc, body(), 3);
  await done;
  return pc;
}

test('calibration learns a standing baseline', async () => {
  const pc = await calibrated();
  assert.ok(pc.calibrated);
  assert.ok(Math.abs(pc.baseline.torso - 0.2) < 0.01);
  assert.ok(Math.abs(pc.baseline.centerX - 0.5) < 0.01);
});

test('standing still fires nothing', async () => {
  const pc = await calibrated();
  feed(pc, body(), 25);
  const s = pc.consume();
  assert.equal(s.jump, false);
  assert.equal(s.reach, false);
  assert.equal(s.ducking, false);
  assert.equal(s.lane, 0);
});

test('a hop triggers exactly one jump', async () => {
  const pc = await calibrated();
  feed(pc, body({ dy: -0.05 }), 8);
  assert.equal(pc.consume().jump, true);
  feed(pc, body({ dy: -0.05 }), 8);
  assert.equal(pc.consume().jump, false, 'staying up must not re-fire');
});

test('a high knee lift also counts as a jump', async () => {
  const pc = await calibrated();
  feed(pc, body({ kneeDy: -0.09 }), 8);
  assert.equal(pc.consume().jump, true);
});

test('a squat latches and releases on standing up', async () => {
  const pc = await calibrated();
  feed(pc, body({ dy: 0.045 }), 10);
  assert.equal(pc.state.ducking, true);
  feed(pc, body(), 12);
  assert.equal(pc.state.ducking, false);
});

test('side steps map to lanes, mirrored', async () => {
  const pc = await calibrated();
  // The child steps to their own right: raw x falls, mirrored x rises.
  feed(pc, body({ dx: -0.10 }), 12);
  assert.equal(pc.state.lane, 1);
  feed(pc, body({ dx: 0.10 }), 12);
  assert.equal(pc.state.lane, -1);
  feed(pc, body(), 12);
  assert.equal(pc.state.lane, 0);
});

test('a small sway does not change lane', async () => {
  const pc = await calibrated();
  feed(pc, body({ dx: -0.04 }), 12);
  assert.equal(pc.state.lane, 0);
});

test('both arms overhead triggers a stretch', async () => {
  const pc = await calibrated();
  feed(pc, body({ wristY: 0.28 }), 8);
  assert.equal(pc.consume().reach, true);
});

test('a half-visible body is rejected rather than guessed at', async () => {
  const pc = await calibrated();
  const faded = body().map((p, i) => (i >= 11 && i <= 24 ? { ...p, visibility: 0.1 } : p));
  assert.equal(pc._measure(faded), null);
});
