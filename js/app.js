/**
 * Bootstrap: screen flow, input source, practice room, yoga gates, statistics,
 * wake lock and service worker.
 */
import { Sfx } from './audio.js';
import { PoseController } from './pose.js';
import { RunnerGame, SPEED_PRESETS } from './game.js';
import { Tutorial } from './tutorial.js';
import { Coach } from './coach.js';
import { ShapeHold, SHAPES } from './shapes.js';
import { SessionStats, CHILD, saveSession, loadHistory, aggregate, clearHistory } from './stats.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'sensory-runner-settings-v1';
const GATE_TIMEOUT = 45;   // seconds before a pose gate gives up on its own

const ui = {
  overlay: $('overlay'),
  start: $('panel-start'),
  loading: $('panel-loading'),
  practice: $('panel-practice'),
  gate: $('panel-gate'),
  over: $('panel-over'),
  progress: $('panel-progress'),
  hud: $('hud'),
  score: $('hud-score'),
  coins: $('hud-coins'),
  move: $('hud-move'),
  preview: $('preview'),
};

const sfx = new Sfx();
const coach = new Coach();
const stats = new SessionStats(CHILD);
const game = new RunnerGame($('game'), sfx, onGameEvent);

let pose = null;
let tutorial = null;
let gate = null;             // {shape, hold, elapsed}
let wakeLock = null;
let lastFrame = performance.now();
let moveLabelUntil = 0;
let lastRunDistance = 0;

const settings = loadSettings();
applySettings();

/** Keyboard fallback so the game is playable (and testable) without a camera. */
const keys = { lane: 0, ducking: false, jump: false, reach: false, confirm: false };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.lane = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.lane = 1;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = true;
  else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = true;
  else if (e.key === 'Shift') keys.reach = true;
  else if (e.key === 'Enter') keys.confirm = true;
  else return;
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if ((e.key === 'ArrowLeft' || e.key === 'a') && keys.lane === -1) keys.lane = 0;
  else if ((e.key === 'ArrowRight' || e.key === 'd') && keys.lane === 1) keys.lane = 0;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = false;
});

// ------------------------------------------------------------------ settings

function loadSettings() {
  const defaults = { speed: 'medium', practice: true, voice: true, gates: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* fine */ }
}

function applySettings() {
  game.setSpeedPreset(settings.speed);
  game.gatesEnabled = settings.gates;
  coach.muted = !settings.voice;
  stats.speedLabel = settings.speed;
  for (const btn of $('speed-picker').querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.speed === settings.speed);
  }
  $('opt-practice').checked = settings.practice;
  $('opt-voice').checked = settings.voice;
  $('opt-gates').checked = settings.gates;
}

$('speed-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-speed]');
  if (!btn) return;
  settings.speed = btn.dataset.speed;
  saveSettings();
  applySettings();
  sfx.lane();
});

for (const [id, key] of [['opt-practice', 'practice'], ['opt-voice', 'voice'], ['opt-gates', 'gates']]) {
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    applySettings();
  });
}

// ------------------------------------------------------------------ screens

function show(panel) {
  for (const p of [ui.start, ui.loading, ui.practice, ui.gate, ui.over, ui.progress]) {
    p.classList.add('hidden');
  }
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
  if (settings.practice) startPractice();
  else startRun();
});
$('btn-again').addEventListener('click', () => {
  if (pose && pose.calibrated) startRun();
  else if (pose) startPractice();
  else startRun();
});
$('btn-menu').addEventListener('click', backToMenu);
$('btn-skip-practice').addEventListener('click', () => { tutorial = null; startRun(); });
$('btn-skip-gate').addEventListener('click', () => finishGate(false));
$('btn-progress').addEventListener('click', showProgress);
$('btn-progress-back').addEventListener('click', backToMenu);
$('btn-clear').addEventListener('click', () => {
  if (confirm('Clear all saved sessions from this device?')) {
    clearHistory();
    showProgress();
  }
});

function backToMenu() {
  coach.stop();
  persistSession();
  show(ui.start);
  ui.hud.classList.add('hidden');
}

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
    $('loading-title').textContent = 'Camera unavailable';
    $('loading-note').innerHTML =
      `${escapeHtml(err.message || String(err))}<br><br>` +
      'Check that the page is on https, that camera permission was allowed, ' +
      'and that no other app is holding the camera. You can still play with the keyboard.';
    ui.loading.querySelector('.spinner').classList.add('hidden');
    return;
  }
  ui.preview.classList.remove('hidden');
  startPractice();
}

/**
 * The practice room. With a camera it also performs the standing calibration;
 * on the keyboard it is a dry run of the same drills.
 */
function startPractice() {
  const drills = pose
    ? undefined                                  // everything, floor poses included
    : ['jump', 'duck', 'right', 'left', 'stretch'];
  tutorial = new Tutorial({
    say: (text, opts) => coach.say(text, opts),
    sfx,
    drills,
    framing: !!pose,
    calibrate: () => (pose ? pose.calibrate(2600) : Promise.resolve()),
  });
  show(ui.practice);
  ui.hud.classList.add('hidden');
}

function renderPractice(view) {
  $('practice-emoji').textContent = view.emoji;
  $('practice-title').textContent = view.title;
  $('practice-message').textContent = view.message;

  const holdBar = $('practice-hold');
  if (view.holdProgress !== null && view.phase === 'drill') {
    holdBar.classList.remove('hidden');
    $('practice-hold-fill').style.width = `${Math.round(view.holdProgress * 100)}%`;
  } else {
    holdBar.classList.add('hidden');
  }

  const count = $('practice-count');
  if (view.countdown !== null) {
    count.classList.remove('hidden');
    count.textContent = String(view.countdown);
  } else {
    count.classList.add('hidden');
  }

  const list = $('practice-checklist');
  const signature = view.checklist.map((d) => `${d.key}:${d.state}`).join('|') + view.title;
  if (list.dataset.signature !== signature) {
    list.dataset.signature = signature;
    list.innerHTML = '';
    for (const drill of view.checklist) {
      const chip = document.createElement('span');
      const active = view.phase !== 'ready' && drill.label === view.title;
      chip.className = `chip ${drill.state}${active ? ' active' : ''}`;
      chip.innerHTML = `<span>${drill.emoji}</span><span>${escapeHtml(drill.label)}</span>` +
        (drill.state === 'todo' ? '' : '<span class="tick"></span>');
      list.appendChild(chip);
    }
  }
}

function startRun() {
  tutorial = null;
  gate = null;
  coach.stop();
  show(null);
  ui.hud.classList.remove('hidden');
  game.setSpeedPreset(settings.speed);
  game.gatesEnabled = settings.gates;
  game.start();
  setMoveLabel('Go!');
  coach.say('Ready, set, go!');
}

// --------------------------------------------------------------- yoga gates

function openGate(shape) {
  const spec = SHAPES[shape];
  gate = { shape, hold: new ShapeHold(shape), elapsed: 0 };
  $('gate-emoji').textContent = spec.emoji;
  $('gate-title').textContent = spec.label;
  $('gate-cue').textContent = spec.cue;
  $('gate-hold-fill').style.width = '0%';
  $('gate-hint').textContent = pose
    ? 'Hold it while the bar fills up.'
    : 'No camera: press Enter to pass the pose.';
  show(ui.gate);
  coach.say(spec.cue);
}

function updateGate(dt) {
  gate.elapsed += dt;
  let progress;

  if (pose) {
    const state = gate.hold.update(pose.landmarks, dt);
    progress = state.progress;
    if (state.done) { finishGate(true); return; }
  } else {
    // Keyboard mode cannot strike a pose; Enter stands in for it.
    progress = keys.confirm ? 1 : Math.min(0.9, gate.elapsed / 6);
    if (keys.confirm) { keys.confirm = false; finishGate(true); return; }
  }

  $('gate-hold-fill').style.width = `${Math.round(progress * 100)}%`;
  game.setGateProgress(progress);

  // Never trap the child in front of a pose they cannot make.
  if (gate.elapsed > GATE_TIMEOUT) finishGate(false);
}

function finishGate(passed) {
  if (!gate) return;
  const shape = gate.shape;
  gate = null;
  keys.confirm = false;
  if (passed) {
    stats.record('pose', shape);
    coach.say('Beautiful pose! Off we go.');
  } else {
    coach.say('That is okay. Off we go!');
  }
  game.closeGate(passed);
  show(null);
  ui.hud.classList.remove('hidden');
}

// ------------------------------------------------------------- game events

function onGameEvent(label, payload = {}) {
  if (label === '__gameover__') { endRun(); return; }
  if (payload.gate) { openGate(payload.gate); return; }
  if (payload.move && payload.move !== 'pose') stats.record(payload.move);
  setMoveLabel(label);
}

function setMoveLabel(text) {
  ui.move.textContent = text;
  moveLabelUntil = performance.now() + 900;
}

function endRun() {
  lastRunDistance = game.distance;
  stats.endRun(game.distance);
  stats.fruit += game.coins;
  ui.hud.classList.add('hidden');

  const s = stats.summary();
  $('over-score').textContent = String(Math.floor(lastRunDistance));
  $('stat-jumps').textContent = String(game.stats.jumps);
  $('stat-ducks').textContent = String(game.stats.ducks);
  $('stat-lanes').textContent = String(game.stats.lanes);
  $('stat-reaches').textContent = String(game.stats.reaches);
  $('stat-poses').textContent = String(game.stats.poses);
  $('stat-fruit').textContent = String(game.coins);
  $('stat-time').textContent = clock(s.seconds);
  $('stat-kcal').textContent = s.kcal.toFixed(1);
  $('stat-met').textContent = s.met.toFixed(1);
  $('over-title').textContent = pickPraise(lastRunDistance);
  show(ui.over);
  coach.say(pickPraise(lastRunDistance));
  setTimeout(() => sfx.fanfare(), 500);
  persistSession();
}

function pickPraise(distance) {
  if (distance > 600) return 'Incredible running!';
  if (distance > 300) return 'Strong body, strong focus!';
  if (distance > 120) return 'Great moving!';
  return 'Nice try — go again!';
}

/** Keep the on-device history current, so a closed tab loses nothing. */
function persistSession() {
  saveSession(stats.summary());
}

// ------------------------------------------------------------------ progress

function showProgress() {
  const { all, today, rows } = aggregate(loadHistory());
  $('child-profile').textContent = `${CHILD.ageYears}-year-old, ${CHILD.weightKg} kg`;
  fillGrid($('today-grid'), today);
  fillGrid($('alltime-grid'), all);

  const list = $('session-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<div class="empty">No sessions saved yet.</div>';
  } else {
    for (const row of rows.slice().reverse().slice(0, 12)) {
      const when = new Date(row.startedAt);
      const div = document.createElement('div');
      div.className = 'session-row';
      div.innerHTML =
        `<span class="when">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` +
        `<span class="what">${clock(row.seconds)} &middot; ${Math.round(row.kcal)} kcal &middot; ` +
        `${(row.counts?.jumps ?? 0)}\u{1F998} ${(row.counts?.ducks ?? 0)}\u{1F986} ${(row.counts?.poses ?? 0)}\u{1F9D8}</span>`;
      list.appendChild(div);
    }
  }
  show(ui.progress);
}

function fillGrid(el, bucket) {
  const cells = [
    [clock(Math.round(bucket.minutes * 60)), 'moving'],
    [bucket.kcal.toFixed(0), 'kcal (est.)'],
    [String(bucket.sessions), 'sessions'],
    [String(bucket.counts.jumps), '\u{1F998} jumps'],
    [String(bucket.counts.ducks), '\u{1F986} squats'],
    [String(bucket.counts.poses), '\u{1F9D8} poses'],
  ];
  el.innerHTML = cells.map(([value, label]) =>
    `<div><b>${escapeHtml(value)}</b><small>${label}</small></div>`).join('');
}

const clock = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// --------------------------------------------------------------- main loop

function frame(now) {
  requestAnimationFrame(frame);
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  const input = readInput();

  if (gate) {
    updateGate(dt);
    game.update(dt, input);        // keeps the frozen scene rendering
    return;
  }

  if (tutorial) {
    const view = tutorial.update(dt, input, pose ? pose.landmarks : null);
    renderPractice(view);
    game.render();                 // idle scenery behind the panel
    if (tutorial.done) startRun();
    return;
  }

  game.update(dt, input);
  if (game.running) {
    stats.tick(dt);
    ui.score.textContent = String(Math.floor(game.distance));
    ui.coins.textContent = `\u{1F34E} ${game.coins}`;
    if (now > moveLabelUntil) ui.move.textContent = game.shield > 0 ? '⭐ Shielded' : 'Run!';
  }
}

function readInput() {
  if (pose && pose.calibrated) {
    const p = pose.consume();
    ui.preview.classList.toggle('lost', !p.present);
    return {
      present: p.present,
      lane: p.present ? p.lane : 0,
      ducking: p.present && p.ducking,
      jump: p.jump,
      reach: p.reach,
    };
  }
  if (pose) {
    // Camera is up but the baseline is not taken yet (still in the practice room).
    return { present: pose.state.present, lane: 0, ducking: false, jump: false, reach: false };
  }
  const input = { present: true, lane: keys.lane, ducking: keys.ducking, jump: keys.jump, reach: keys.reach };
  keys.jump = false;
  keys.reach = false;
  return input;
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

window.addEventListener('pagehide', persistSession);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A handle for poking at a live session from the console, and what the
// browser tests drive. Read-only in spirit: nothing here is load-bearing.
window.__sensoryRunner = { game, stats, settings, coach, get pose() { return pose; } };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) =>
      console.warn('service worker registration failed', err));
  });
}
