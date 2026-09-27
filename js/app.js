/**
 * Bootstrap: screen flow, input source, practice room, yoga gates, statistics,
 * wake lock and service worker.
 */
import { Sfx } from './audio.js';
import { PoseController } from './pose.js';
import { RunnerGame, SPEED_PRESETS } from './game.js';
import { Tutorial } from './tutorial.js';
import { Coach } from './coach.js';
import { ShapeHold, SHAPES, detectShape, LETTERS } from './shapes.js';
import { SessionStats, CHILD, saveSession, loadHistory, aggregate, clearHistory } from './stats.js';
import { ADVENTURES, adventureByKey, MOVE_WORDS, say as pickText } from './lessons.js';

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
  combo: $('hud-combo'),
  challenge: $('challenge'),
  preview: $('preview'),
  hearts: $('hud-hearts'),
  lesson: $('lesson'),
  quiz: $('quiz'),
  fact: $('fact'),
};

/**
 * When the runner is opened from inside Rumah Belajar, the family app's
 * common.js is on the page as window.SUPER: learning in the runner then earns
 * the same XP, food and zoo animals as every other game, and there is a way
 * home. Opened on its own, SUPER is absent and all of this quietly does nothing.
 */
const superApp = () => (window.SUPER && window.SUPER.score ? window.SUPER : null);
function awardXp(o) {
  const S = superApp();
  if (!S) return;
  try { S.score.award('runner', o); } catch { /* never let scoring stop a run */ }
}
if (window.SUPER) {
  $('super-home').classList.remove('hidden');
  $('super-home-2').classList.remove('hidden');
}

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
let currentShape = null;
let shapeCheckedAt = 0;
let factTimer = 0;

const settings = loadSettings();

/** Keyboard fallback so the game is playable (and testable) without a camera. */
const keys = { lane: 0, ducking: false, jump: false, reach: false, confirm: false, shape: null, shapeUntil: 0 };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.lane = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.lane = 1;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = true;
  else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = true;
  else if (e.key === 'Shift') keys.reach = true;
  else if (e.key === 'Enter') keys.confirm = true;
  else if (LETTERS.includes(e.key.toUpperCase())) {
    // Keyboard stand-in for striking a pose: press the letter itself.
    keys.shape = e.key.toUpperCase();
    keys.shapeUntil = performance.now() + 1500;
  } else return;
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if ((e.key === 'ArrowLeft' || e.key === 'a') && keys.lane === -1) keys.lane = 0;
  else if ((e.key === 'ArrowRight' || e.key === 'd') && keys.lane === 1) keys.lane = 0;
  else if (e.key === 'ArrowDown' || e.key === 's') keys.ducking = false;
});

// ------------------------------------------------------------------ settings

function loadSettings() {
  const defaults = { speed: 'medium', practice: true, voice: true, gates: true, walls: true,
                     adventure: 'water', lang: 'both' };
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
  game.wallsEnabled = settings.walls;
  game.setAdventure(adventureByKey(settings.adventure));
  game.lang = settings.lang;
  coach.muted = !settings.voice;
  stats.speedLabel = settings.speed;
  for (const btn of $('speed-picker').querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.speed === settings.speed);
  }
  for (const btn of $('lang-picker').querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.lang === settings.lang);
  }
  for (const btn of $('adventure-picker').querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.adventure === settings.adventure);
  }
  const adv = adventureByKey(settings.adventure);
  $('adventure-note').textContent = adv
    ? `${adv.icon} ${t(adv.intro)}`
    : 'Free run: animals, fruit, yoga gates and letter walls, no lessons.';
  $('opt-practice').checked = settings.practice;
  $('opt-voice').checked = settings.voice;
  $('opt-gates').checked = settings.gates;
  $('opt-walls').checked = settings.walls;
}

/** The adventure picker: a free run, then one button per adventure. */
function buildAdventurePicker() {
  const box = $('adventure-picker');
  const options = [{ key: 'free', icon: '\u{1F3C3}', id: 'Lari bebas', en: 'Free run' }, ...ADVENTURES];
  box.innerHTML = options.map((a) =>
    `<button type="button" data-adventure="${a.key}"><span class="big">${a.icon}</span>` +
    `${escapeHtml(a.id)}<br><small>${escapeHtml(a.en)}</small></button>`).join('');
}
buildAdventurePicker();
applySettings();

$('adventure-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-adventure]');
  if (!btn) return;
  settings.adventure = btn.dataset.adventure;
  saveSettings();
  applySettings();
  sfx.lane();
  const adv = adventureByKey(settings.adventure);
  if (adv) coach.sayPair({ id: adv.id, en: adv.en }, settings.lang);
});

$('lang-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-lang]');
  if (!btn) return;
  settings.lang = btn.dataset.lang;
  saveSettings();
  applySettings();
  sfx.lane();
});

$('speed-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-speed]');
  if (!btn) return;
  settings.speed = btn.dataset.speed;
  saveSettings();
  applySettings();
  sfx.lane();
});

for (const [id, key] of [['opt-practice', 'practice'], ['opt-voice', 'voice'],
                         ['opt-gates', 'gates'], ['opt-walls', 'walls']]) {
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
  hideLessonHud();
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
  game.wallsEnabled = settings.walls;
  game.setAdventure(adventureByKey(settings.adventure));
  game.lang = settings.lang;
  game.start();
  setMoveLabel('Go!');
  hideLessonHud();
  const adv = game.adventure;
  if (adv) {
    ui.lesson.classList.remove('hidden');
    ui.hearts.classList.remove('hidden');
    renderLessonHud(null);
    coach.sayPair(adv.intro, settings.lang);
  } else {
    coach.say('Ready, set, go!');
  }
}

// ---------------------------------------------------------- learning HUD

/** Text in the chosen language, from a {id, en} pair. */
function t(pair) { return pickText(pair, settings.lang); }

function hideLessonHud() {
  for (const el of [ui.lesson, ui.quiz, ui.fact, ui.hearts]) el.classList.add('hidden');
  clearTimeout(factTimer);
}

/**
 * The cycle strip: every step in order, the ones learned this run ticked, the
 * current one highlighted. For a cycle an arrow closes the loop back to the
 * start, because "it goes round again" is the whole point.
 */
function renderLessonHud(current) {
  const adv = game.adventure;
  if (!adv) return;
  const L = game.lesson;
  const index = current ? current.index : L.index;
  $('lesson-icon').textContent = adv.icon;
  $('lesson-title').textContent = t({ id: adv.id, en: adv.en });
  const learned = new Set(L.learnedKeys);
  $('lesson-steps').innerHTML = adv.steps.map((step, i) => {
    const cls = i === index ? 'now' : learned.has(i) ? 'done' : '';
    return `<span class="${cls}" title="${escapeHtml(t(step))}">${step.emoji}</span>`;
  }).join('') + (adv.kind === 'cycle' ? '<span class="arrow">\u21BA</span>' : '');
  const step = adv.steps[index];
  const label = adv.kind === 'cycle'
    ? `${settings.lang === 'en' ? 'Step' : 'Langkah'} ${index + 1}/${adv.steps.length}: ${t(step)}`
    : t(step);
  $('lesson-emoji').textContent = step.emoji;
  $('lesson-name').textContent = label;
  const move = MOVE_WORDS[step.move];
  $('lesson-do').textContent = current
    ? `${move.emoji} ${t(step.do)}`
    : `${move.emoji} ${settings.lang === 'en' ? 'Coming up' : 'Sebentar lagi'}\u2026`;
}

function showFact(emoji, title, text, wrong = false) {
  $('fact-emoji').textContent = emoji;
  $('fact-title').textContent = title;
  $('fact-text').textContent = text;
  ui.fact.classList.toggle('wrong', wrong);
  ui.fact.classList.remove('hidden');
  // Restart the entry animation for back-to-back facts.
  ui.fact.style.animation = 'none';
  void ui.fact.offsetWidth;
  ui.fact.style.animation = '';
  clearTimeout(factTimer);
  factTimer = setTimeout(() => ui.fact.classList.add('hidden'), 7000);
}

function renderHearts() {
  ui.hearts.textContent = '\u2764\uFE0F'.repeat(Math.max(0, game.hearts)) +
    '\u{1F90D}'.repeat(Math.max(0, 3 - game.hearts));
}

/** Everything the adventure says and shows, driven by the game's events. */
function onLessonEvent(payload) {
  const adv = game.adventure;
  const lang = settings.lang;

  if (payload.lesson) {
    const { step, index, total } = payload.lesson;
    renderLessonHud(payload.lesson);
    ui.quiz.classList.add('hidden');
    const lead = adv.kind === 'cycle'
      ? { id: `Langkah ${index + 1}: ${step.id}.`, en: `Step ${index + 1} of ${total}: ${step.en}.` }
      : { id: `${step.id}!`, en: `The ${step.en.toLowerCase()}!` };
    coach.sayPair({ id: `${lead.id} ${step.do.id}`, en: `${lead.en} ${step.do.en}` }, lang);
    return true;
  }

  if (payload.learned) {
    const { step, loopDone } = payload.learned;
    renderLessonHud(null);
    showFact(step.emoji, t(step), t(step.fact));
    coach.sayPair(step.fact, lang);
    awardXp({ level: 2, wrongs: 0 });
    if (loopDone) {
      const done = adv.kind === 'cycle'
        ? { id: 'Kembali ke awal! Siklusnya berputar terus.', en: 'Back to the start! The cycle goes round and round.' }
        : { id: 'Hebat, semua hewan sudah kita temui!', en: 'Great, we met every animal!' };
      coach.sayPair(done, lang, { interrupt: false });
      coach.sayPair(adv.ethic, lang, { interrupt: false });
      coach.sayPair({ id: 'Sekarang ada pertanyaan. Pilih jalur yang benar!',
                      en: 'Now for some questions. Step into the right lane!' }, lang, { interrupt: false });
    }
    return true;
  }

  if (payload.lessonMissed) {
    const { step } = payload.lessonMissed;
    const move = MOVE_WORDS[step.move];
    coach.sayPair({ id: `Hampir! Ayo coba lagi. ${move.id}`, en: `Almost! Let us try again. ${move.en}` }, lang);
    return true;
  }

  if (payload.quiz) {
    const q = payload.quiz;
    $('quiz-prompt').textContent = t(q.prompt);
    $('quiz-hint').textContent = lang === 'en'
      ? 'Step into the lane with the right picture!'
      : 'Geser ke jalur dengan gambar yang benar!';
    ui.quiz.classList.remove('hidden');
    coach.sayPair(q.prompt, lang);
    const names = q.options.map((o) => o.id).join(', ');
    const namesEn = q.options.map((o) => o.en).join(', ');
    coach.sayPair({ id: names, en: namesEn }, lang, { interrupt: false });
    return true;
  }

  if (payload.answer) {
    const { correct, right } = payload.answer;
    ui.quiz.classList.add('hidden');
    if (correct) {
      showFact(right.emoji, lang === 'en' ? `Right! ${right.en}` : `Benar! ${right.id}`, t(payload.answer.prompt));
      coach.sayPair({ id: `Benar! ${right.id}.`, en: `That's right! ${right.en}.` }, lang);
      awardXp({ level: 3, wrongs: 0 });
    } else {
      showFact(right.emoji, lang === 'en' ? `The answer is ${right.en}` : `Jawabannya ${right.id}`,
        t(payload.answer.prompt), true);
      coach.sayPair({ id: `Belum tepat. Jawabannya ${right.id}.`, en: `Not quite. It is the ${right.en.toLowerCase()}.` }, lang);
      awardXp({ level: 3, wrongs: 2 });
    }
    return true;
  }

  if ('hearts' in payload) {
    renderHearts();
    coach.say(game.hearts > 1 ? 'Oops! Keep going!' : 'Last heart. You can do it!', { interrupt: false });
    return false;
  }
  return false;
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
  ui.challenge.classList.add('hidden');
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
  if (game.adventure && onLessonEvent(payload)) {
    setMoveLabel(payload.lesson ? t(payload.lesson.step) : label);
    return;
  }
  if (payload.gate) { openGate(payload.gate); return; }
  if (payload.wall) { coach.say(SHAPES[payload.wall].cue); }
  if (payload.zone) { coach.say(`Welcome to the ${label.replace('!', '')}!`, { interrupt: false }); }
  if (payload.letter) { coach.say('Perfect!', { interrupt: false }); }
  if (payload.move && payload.move !== 'pose') stats.record(payload.move);
  setMoveLabel(label);
}

/**
 * The wall prompt: the letter to make, how close it is, and whether the tracker
 * can currently see that shape. Drawn as a HUD chip rather than an overlay so
 * it never covers the wall the child is running at.
 */
function renderChallengeHud(input) {
  const next = game.nextChallenge();
  const chip = ui.challenge;
  ui.combo.classList.toggle('hidden', game.multiplier < 2);
  ui.combo.textContent = `\u{1F525} x${game.multiplier}`;

  if (next.type === 'quiz') {
    chip.classList.add('hidden');
    return;
  }
  if (next.type !== 'letter') {
    chip.classList.add('hidden');
    return;
  }
  chip.classList.remove('hidden');
  const matched = input.shape && SHAPES[next.letter] &&
    (input.shape === next.letter || (next.letter === 'X' && input.shape === 'Y') ||
     (next.letter === 'Y' && input.shape === 'X'));
  chip.classList.toggle('matched', !!matched);
  $('challenge-letter').textContent = next.letter;
  $('challenge-cue').textContent = matched ? 'Hold it!' : SHAPES[next.letter].cue;
  $('challenge-bar-fill').style.width =
    `${Math.round(100 * Math.max(0, Math.min(1, 1 - next.distance / 55)))}%`;
}

function setMoveLabel(text) {
  ui.move.textContent = text;
  moveLabelUntil = performance.now() + 900;
}

function endRun() {
  hideLessonHud();
  ui.challenge.classList.add('hidden');
  ui.combo.classList.add('hidden');
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
  $('stat-poses').textContent = String(game.stats.poses + game.stats.letters);
  $('stat-fruit').textContent = String(game.coins);
  $('stat-combo').textContent = String(game.bestCombo);
  $('stat-time').textContent = clock(s.seconds);
  $('stat-kcal').textContent = s.kcal.toFixed(1);
  $('stat-met').textContent = s.met.toFixed(1);
  $('over-title').textContent = pickPraise(lastRunDistance);
  const adv = game.adventure;
  ui.over.classList.toggle('learning', !!adv);
  $('stat-learned').textContent = String(game.stats.learned);
  $('stat-quiz').textContent = `${game.stats.quizRight}/${game.stats.quizTotal}`;
  const list = $('learned-list');
  const ethic = $('over-ethic');
  if (adv && game.lesson.learnedKeys.length) {
    const seen = [...new Set(game.lesson.learnedKeys)];
    list.innerHTML = seen.map((i) => `<span>${adv.steps[i].emoji} ${escapeHtml(t(adv.steps[i]))}</span>`).join('');
    list.classList.remove('hidden');
  } else {
    list.classList.add('hidden');
  }
  if (adv) {
    ethic.textContent = `${adv.icon} ${t(adv.ethic)}`;
    ethic.classList.remove('hidden');
  } else {
    ethic.classList.add('hidden');
  }
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
    renderChallengeHud(input);
    if (game.adventure) {
      renderHearts();
      const quiz = game.lesson.quiz;
      if (quiz) {
        const lane = game.player.lane;
        const here = quiz.options.find((o) => o.lane === lane);
        $('quiz-hint').textContent = here
          ? `${here.emoji} ${settings.lang === 'en' ? here.en : here.id}?`
          : '';
      }
    }
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
      shape: heldShape(),
    };
  }
  if (pose) {
    // Camera is up but the baseline is not taken yet (still in the practice room).
    return { present: pose.state.present, lane: 0, ducking: false, jump: false, reach: false, shape: heldShape() };
  }
  const shape = performance.now() < keys.shapeUntil ? keys.shape : null;
  const input = {
    present: true, lane: keys.lane, ducking: keys.ducking,
    jump: keys.jump, reach: keys.reach, shape,
  };
  keys.jump = false;
  keys.reach = false;
  return input;
}

/**
 * The shape the child is holding right now. Classifying every frame is wasted
 * work -- a held pose does not change in 16 ms -- so this runs at about 12 Hz
 * and reuses the answer in between.
 */
function heldShape() {
  const now = performance.now();
  if (now - shapeCheckedAt > 80) {
    shapeCheckedAt = now;
    currentShape = pose && pose.landmarks ? detectShape(pose.landmarks).shape : null;
  }
  return currentShape;
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
