/**
 * The practice room.
 *
 * Before any running happens the child is checked into position and then asked
 * for one movement at a time -- jump, duck, step right, step left, stretch, and
 * the two floor poses -- with a spoken prompt for each. Nothing starts until
 * the camera can see them properly, and no drill can trap them: every one times
 * out and moves on, because a child stuck failing the same instruction is a
 * child who stops playing.
 */
import { SHAPES, ShapeHold } from './shapes.js';
import { praise, encourage } from './coach.js';

const DRILL_TIMEOUT = 18;      // seconds before a drill gives up and moves on
const DRILL_GAP = 1.4;         // pause on success, so praise is heard
const FRAMING_HOLD = 1.2;      // seconds fully in frame before we believe it

export const DRILLS = [
  { key: 'jump',    label: 'Jump',        emoji: '\u{1F998}', cue: 'Jump up high!',
    hint: 'Hop with both feet, or lift one knee up high.' },
  { key: 'duck',    label: 'Duck',        emoji: '\u{1F986}', cue: 'Duck down low!',
    hint: 'Squat down like a little frog.' },
  { key: 'right',   label: 'Step right',  emoji: '\u{27A1}',  cue: 'Step to your right!',
    hint: 'Take a big step sideways.' },
  { key: 'left',    label: 'Step left',   emoji: '\u{2B05}',  cue: 'Step to your left!',
    hint: 'Now a big step the other way.' },
  { key: 'stretch', label: 'Big stretch', emoji: '\u{1F64C}', cue: 'Reach both arms up high!',
    hint: 'Stretch up as tall as you can.' },
  { key: 'cow',     label: SHAPES.cow.label,   emoji: SHAPES.cow.emoji,   cue: SHAPES.cow.cue,
    hint: 'Hands and knees, tummy down, head up.', shape: 'cow' },
  { key: 'cobra',   label: SHAPES.cobra.label, emoji: SHAPES.cobra.emoji, cue: SHAPES.cobra.cue,
    hint: 'Lie on your tummy, push your chest up.', shape: 'cobra' },
];

export class Tutorial {
  /**
   * @param {object} opts
   * @param {(text: string) => void} opts.say      speak a prompt
   * @param {object} opts.sfx                      sound effects
   * @param {string[]} [opts.drills]               which drill keys to run
   * @param {() => Promise<any>} [opts.calibrate]  starts the standing baseline
   * @param {boolean} [opts.framing]  false when there is no camera to frame
   */
  constructor({ say, sfx, drills, calibrate, framing = true }) {
    this.say = say || (() => {});
    this.sfx = sfx;
    this.calibrateFn = calibrate;
    this.requireFraming = framing;
    this.list = (drills ? DRILLS.filter((d) => drills.includes(d.key)) : DRILLS).map((d) => ({
      ...d, state: 'todo',
    }));
    this.phase = 'framing';
    this.index = 0;
    this.framedFor = 0;
    this.drillTime = 0;
    this.gap = 0;
    this.hold = null;
    this.duckHeld = 0;
    this.message = '';
    this.spokenFor = null;
    this.readyCountdown = 3;
    this.done = false;
  }

  get current() { return this.list[this.index] || null; }

  get progress() {
    const passed = this.list.filter((d) => d.state !== 'todo').length;
    return passed / this.list.length;
  }

  /**
   * Advance one frame.
   * @param {number} dt seconds
   * @param {object} input {present, lane, ducking, jump, reach}
   * @param {Array|null} landmarks raw pose landmarks, for the floor poses
   */
  update(dt, input, landmarks = null) {
    if (this.done) return this.view();
    switch (this.phase) {
      case 'framing': this._framing(dt, input, landmarks); break;
      case 'calibrating': break;                 // resolved by the promise
      case 'drill': this._drill(dt, input, landmarks); break;
      case 'gap': this._gap(dt); break;
      case 'ready': this._ready(dt); break;
    }
    return this.view();
  }

  // Wait until the whole child, feet included, is in the picture.
  _framing(dt, input, landmarks) {
    // Nothing to frame without a camera: go straight to the drills.
    if (!this.requireFraming) { this._beginCalibration(); return; }
    const full = input.present && wholeBodyVisible(landmarks);
    this.framedFor = full ? this.framedFor + dt : 0;
    this.message = full
      ? 'Got you! Stand tall and hold still.'
      : 'Step back until I can see you from head to toes.';
    if (this.spokenFor !== this.message) {
      this.spokenFor = this.message;
      this.say(full ? 'I can see you. Stand tall and hold still.'
                    : 'Step back so I can see all of you.');
    }
    if (this.framedFor >= FRAMING_HOLD) this._beginCalibration();
  }

  _beginCalibration() {
    this.phase = 'calibrating';
    this.message = 'Hold still...';
    this.sfx?.ready?.();
    const start = this.calibrateFn ? this.calibrateFn() : Promise.resolve();
    start.then(() => {
      this.say('Great standing. Now let us practise our moves.');
      this._startDrill(0);
    });
  }

  _startDrill(index) {
    this.index = index;
    this.phase = 'drill';
    this.drillTime = 0;
    this.duckHeld = 0;
    const drill = this.current;
    if (!drill) { this._finish(); return; }
    this.hold = drill.shape ? new ShapeHold(drill.shape) : null;
    this.message = drill.hint;
    this.sfx?.ready?.();
    this.say(drill.cue);
  }

  _drill(dt, input, landmarks) {
    const drill = this.current;
    if (!drill) { this._finish(); return; }
    this.drillTime += dt;

    let passed = false;
    if (drill.shape) {
      const state = this.hold.update(landmarks, dt);
      this.holdProgress = state.progress;
      passed = state.done;
      this.message = state.matching
        ? 'That is it -- hold it there!'
        : drill.hint;
    } else if (drill.key === 'jump') {
      passed = input.jump;
    } else if (drill.key === 'duck') {
      this.duckHeld = input.ducking ? this.duckHeld + dt : 0;
      passed = this.duckHeld >= 0.3;
    } else if (drill.key === 'right') {
      passed = input.lane === 1;
    } else if (drill.key === 'left') {
      passed = input.lane === -1;
    } else if (drill.key === 'stretch') {
      passed = input.reach;
    }

    if (passed) {
      drill.state = 'passed';
      this.sfx?.coin?.();
      this.say(praise(), { interrupt: false });
      this.message = praise();
      this.phase = 'gap';
      this.gap = DRILL_GAP;
      return;
    }

    // Halfway through, repeat the instruction with the plain-language hint.
    if (this.drillTime > DRILL_TIMEOUT / 2 && !drill.nudged) {
      drill.nudged = true;
      this.say(`${encourage()} ${drill.hint}`);
    }

    if (this.drillTime > DRILL_TIMEOUT) {
      // Never block: mark it as one to work on and carry on.
      drill.state = 'skipped';
      this.say('That one is tricky. We will try it in the game.');
      this.message = 'We will come back to this one.';
      this.phase = 'gap';
      this.gap = DRILL_GAP;
    }
  }

  _gap(dt) {
    this.gap -= dt;
    if (this.gap > 0) return;
    if (this.index + 1 < this.list.length) this._startDrill(this.index + 1);
    else this._finish();
  }

  _finish() {
    this.phase = 'ready';
    this.readyCountdown = 3.99;
    const passed = this.list.filter((d) => d.state === 'passed').length;
    this.say(passed === this.list.length
      ? 'All moves done. You are ready to go!'
      : 'Good practice. Let us play!');
    this.sfx?.fanfare?.();
  }

  _ready(dt) {
    this.readyCountdown -= dt;
    this.message = 'Starting in\u2026';
    if (this.readyCountdown <= 0) {
      this.done = true;
      this.sfx?.go?.();
    }
  }

  view() {
    const drill = this.current;
    return {
      phase: this.phase,
      done: this.done,
      title: this._title(),
      message: this.message,
      emoji: this.phase === 'drill' && drill ? drill.emoji : '\u{1F3C3}',
      countdown: this.phase === 'ready' ? Math.max(1, Math.ceil(this.readyCountdown)) : null,
      holdProgress: this.hold ? this.holdProgress || 0 : null,
      timeLeft: this.phase === 'drill' ? Math.max(0, DRILL_TIMEOUT - this.drillTime) : null,
      checklist: this.list.map((d) => ({ key: d.key, label: d.label, emoji: d.emoji, state: d.state })),
      progress: this.progress,
    };
  }

  _title() {
    switch (this.phase) {
      case 'framing': return 'Find your spot';
      case 'calibrating': return 'Stand tall like a tree';
      case 'drill': return this.current ? this.current.label : '';
      case 'gap': return this.current ? this.current.label : '';
      case 'ready': return 'Ready to go!';
      default: return '';
    }
  }
}

/** Head and at least one set of ankles in frame, with room to spare. */
export function wholeBodyVisible(landmarks) {
  if (!landmarks || landmarks.length < 29) return false;
  const vis = (i) => (landmarks[i].visibility ?? 1);
  const inFrame = (i) => {
    const p = landmarks[i];
    return p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.995;
  };
  const head = vis(0) > 0.5 && inFrame(0);
  const feet = (vis(27) > 0.4 && inFrame(27)) || (vis(28) > 0.4 && inFrame(28));
  return head && feet;
}
