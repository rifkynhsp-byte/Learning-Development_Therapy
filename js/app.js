/**
 * Bootstrap: screen flow, input source selection, wake lock, service worker.
 */
import { Sfx } from './audio.js';
import { PoseController } from './pose.js';
import { RunnerGame } from './game.js';

const $ = (id) => document.getElementById(id);

const ui = {
  overlay: $('overlay'),
  start: $('panel-start'),
  loading: $('panel-loading'),
  loadingTitle: $('loading-title'),
  loadingNote: $('loading-note'),
  calibrate: $('panel-calibrate'),
  calibCount: $('calib-count'),
  calibHint: $('calib-hint'),
  ringFill: $('ring-fill'),
  over: $('panel-over'),
  hud: $('hud'),
  score: $('hud-score'),
  coins: $('hud-coins'),
  move: $('hud-move'),
  preview: $('preview'),
};

const sfx = new Sfx();
const game = new RunnerGame($('game'), sfx, onGameEvent);
let pose = null;
let wakeLock = null;
let lastFrame = performance.now();
let moveLabelUntil = 0;

/** Keyboard fallback so the game is playable (and testable) without a camera. */
const keys = { lane: 0, ducking: false, jump: false, reach: false };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.lane = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.lane = 1;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = true;
  else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = true;
  else if (e.key === 'Shift') keys.reach = true;
  else return;
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if ((e.key === 'ArrowLeft' || e.key === 'a') && keys.lane === -1) keys.lane = 0;
  else if ((e.key === 'ArrowRight' || e.key === 'd') && keys.lane === 1) keys.lane = 0;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = false;
});

// ------------------------------------------------------------------ screens

function show(panel) {
  for (const p of [ui.start, ui.loading, ui.calibrate, ui.over]) p.classList.add('hidden');
  if (panel) {
    panel.classList.remove('hidden');
    ui.overlay.classList.remove('hidden');
  } else {
    ui.overlay.classList.add('hidden');
  }
}

$('btn-start').addEventListener('click', () => beginCameraSession());
$('btn-keys').addEventListener('click', () => {
  sfx.unlock();
  requestWakeLock();
  startRun();
});
$('btn-again').addEventListener('click', () => {
  if (pose && pose.calibrated) runCalibration();
  else startRun();
});

async function beginCameraSession() {
  // Both the audio context and getUserMedia need this click on iOS.
  sfx.unlock();
  requestWakeLock();
  show(ui.loading);

  pose = new PoseController($('webcam'), $('skeleton'));
  try {
    await pose.start();
  } catch (err) {
    console.error(err);
    pose = null;
    ui.loadingTitle.textContent = 'Camera unavailable';
    ui.loadingNote.innerHTML =
      `${escapeHtml(err.message || String(err))}<br><br>` +
      'Check that the page is on https, that camera permission was allowed, ' +
      'and that no other app is holding the camera. You can still play with the keyboard.';
    ui.loading.querySelector('.spinner').classList.add('hidden');
    return;
  }
  ui.preview.classList.remove('hidden');
  runCalibration();
}

async function runCalibration() {
  show(ui.calibrate);
  sfx.ready();
  const total = 3000;
  const done = pose.calibrate(total);
  const started = performance.now();

  const tickUi = setInterval(() => {
    const elapsed = performance.now() - started;
    const frac = Math.min(1, elapsed / total);
    ui.ringFill.style.strokeDashoffset = String(327 * (1 - frac));
    ui.calibCount.textContent = String(Math.max(1, Math.ceil((total - elapsed) / 1000)));
    ui.calibHint.textContent = pose.state.present
      ? 'Got you! Hold still…'
      : 'Step back so your whole body fits in the little picture.';
    ui.preview.classList.toggle('lost', !pose.state.present);
  }, 100);

  await done;
  clearInterval(tickUi);
  ui.preview.classList.remove('lost');
  sfx.go();
  startRun();
}

function startRun() {
  show(null);
  ui.hud.classList.remove('hidden');
  game.start();
  setMoveLabel('Go!');
}

function onGameEvent(label) {
  if (label === '__gameover__') { endRun(); return; }
  setMoveLabel(label);
}

function setMoveLabel(text) {
  ui.move.textContent = text;
  moveLabelUntil = performance.now() + 900;
}

function endRun() {
  ui.hud.classList.add('hidden');
  $('over-score').textContent = String(Math.floor(game.distance));
  $('stat-jumps').textContent = String(game.stats.jumps);
  $('stat-ducks').textContent = String(game.stats.ducks);
  $('stat-lanes').textContent = String(game.stats.lanes);
  $('stat-reaches').textContent = String(game.stats.reaches);
  $('over-title').textContent = pickPraise(game.distance);
  show(ui.over);
  setTimeout(() => sfx.fanfare(), 500);
}

function pickPraise(distance) {
  if (distance > 600) return 'Incredible running!';
  if (distance > 300) return 'Strong body, strong focus!';
  if (distance > 120) return 'Great moving!';
  return 'Nice try — go again!';
}

// --------------------------------------------------------------- main loop

function frame(now) {
  requestAnimationFrame(frame);
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  let input;
  if (pose && pose.calibrated) {
    const p = pose.consume();
    input = {
      lane: p.present ? p.lane : 0,
      ducking: p.present && p.ducking,
      jump: p.jump,
      reach: p.reach,
    };
    ui.preview.classList.toggle('lost', !p.present);
  } else {
    input = { lane: keys.lane, ducking: keys.ducking, jump: keys.jump, reach: keys.reach };
    keys.jump = false;
    keys.reach = false;
  }

  game.update(dt, input);

  if (game.running) {
    ui.score.textContent = String(Math.floor(game.distance));
    ui.coins.textContent = `● ${game.coins}`;
    if (now > moveLabelUntil) ui.move.textContent = game.shield > 0 ? 'Shielded' : 'Run!';
  }
}
requestAnimationFrame(frame);

// ------------------------------------------------------- device housekeeping

/**
 * No touch input happens during a run, so tablets dim the screen mid-session
 * and kill the tracking loop. Hold the display awake instead.
 */
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    console.warn('wake lock unavailable', err);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) =>
      console.warn('service worker registration failed', err));
  });
}
