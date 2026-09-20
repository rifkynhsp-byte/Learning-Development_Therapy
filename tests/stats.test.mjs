import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStats, CHILD, aggregate, saveSession, loadHistory, clearHistory } from '../js/stats.js';

/** Node has no localStorage; give the module something to write to. */
function mockStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

test('a still child burns almost nothing', () => {
  const s = new SessionStats();
  s.tick(600); // ten minutes of standing there
  assert.ok(s.met < 3.3, 'barely above resting');
  assert.ok(s.kcal < 10, `${s.kcal} kcal for doing nothing`);
});

test('a busy session lands in a plausible range for an 18 kg five-year-old', () => {
  const s = new SessionStats();
  // Ten minutes, moving steadily: 15 jumps, 12 squats, 20 steps a minute.
  s.tick(600);
  for (let i = 0; i < 150; i++) s.record('jumps');
  for (let i = 0; i < 120; i++) s.record('ducks');
  for (let i = 0; i < 200; i++) s.record('lanes');
  const { kcal, met } = s.summary();
  assert.ok(met >= 6 && met <= 7.5, `MET ${met} should read as vigorous play`);
  // 10 min at ~7 MET for 18 kg is roughly 20-25 kcal.
  assert.ok(kcal > 15 && kcal < 35, `${kcal} kcal is out of range`);
});

test('the estimate scales with the child, not just the clock', () => {
  const light = new SessionStats({ ...CHILD, weightKg: 18 });
  const heavy = new SessionStats({ ...CHILD, weightKg: 30 });
  for (const s of [light, heavy]) {
    s.tick(300);
    for (let i = 0; i < 60; i++) s.record('jumps');
  }
  assert.ok(heavy.kcal > light.kcal);
  assert.ok(Math.abs(heavy.kcal / light.kcal - 30 / 18) < 0.01, 'linear in body weight');
});

test('poses are counted by shape', () => {
  const s = new SessionStats();
  s.record('pose', 'cow');
  s.record('pose', 'cow');
  s.record('pose', 'cobra');
  assert.equal(s.counts.poses, 3);
  assert.deepEqual(s.posesByShape, { cow: 2, cobra: 1 });
});

test('sessions are stored and totalled, and today is separated out', () => {
  mockStorage();
  clearHistory();
  const now = Date.now();
  const yesterday = now - 26 * 60 * 60 * 1000;

  saveSession({ startedAt: yesterday, minutes: 5, seconds: 300, kcal: 9, distance: 400, fruit: 10,
    counts: { jumps: 10, ducks: 8, lanes: 12, reaches: 3, poses: 1 } });
  saveSession({ startedAt: now, minutes: 8, seconds: 480, kcal: 14, distance: 700, fruit: 20,
    counts: { jumps: 20, ducks: 15, lanes: 18, reaches: 5, poses: 2 } });

  const { all, today } = aggregate(loadHistory(), now);
  assert.equal(all.sessions, 2);
  assert.equal(today.sessions, 1);
  assert.equal(all.counts.jumps, 30);
  assert.equal(today.counts.jumps, 20);
  assert.ok(Math.abs(all.kcal - 23) < 0.001);
});

test('a two-second poke is not recorded as a session', () => {
  mockStorage();
  clearHistory();
  saveSession({ startedAt: Date.now(), minutes: 0.03, seconds: 2, kcal: 0.1, counts: {} });
  assert.equal(loadHistory().length, 0);
});

test('blocked storage never breaks the game', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.deepEqual(loadHistory(), []);
  assert.doesNotThrow(() => saveSession({ startedAt: Date.now(), minutes: 3, seconds: 180, kcal: 5, counts: {} }));
  assert.doesNotThrow(() => clearHistory());
});

test('saving twice in one sitting updates the row instead of adding one', () => {
  mockStorage();
  clearHistory();
  const startedAt = Date.now();
  saveSession({ startedAt, minutes: 2, seconds: 120, kcal: 4, counts: { jumps: 5 } });
  saveSession({ startedAt, minutes: 6, seconds: 360, kcal: 11, counts: { jumps: 18 } });
  const rows = loadHistory();
  assert.equal(rows.length, 1, 'one sitting, one row');
  assert.equal(rows[0].counts.jumps, 18, 'and it holds the latest totals');
});
