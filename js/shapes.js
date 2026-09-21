/**
 * Held body shapes: the floor poses and the body letters.
 *
 * Two families, detected the same way:
 *
 *   Floor poses -- Cow, Cat, Cobra. The reflex-integration positions. The
 *   camera sees the child side-on, so these are judged from the torso's tilt
 *   and from where the hips sit relative to whatever is lowest in frame.
 *
 *   Body letters -- T, Y, O, A, L, X. The child makes the letter with their
 *   whole body and the shape has to fit through a hole in an oncoming wall.
 *   These are judged facing the camera, from where each wrist sits relative to
 *   the shoulders and how far apart the feet are.
 *
 * Every threshold is deliberately loose. A five-year-old's Cobra is not a yoga
 * teacher's Cobra, and the point is that they get on the floor and stretch,
 * not that they hit the shape exactly.
 */

const P = {
  nose: 0,
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

/** Everything the game can ask for, with the words said out loud. */
// The letters use the letter itself as their icon rather than a picture: it
// is unambiguous, and a child learning to read gets the letter in front of
// them while they make it with their body.
export const SHAPES = {
  // --- floor poses
  cow: {
    label: 'Cow pose', emoji: '\u{1F404}', family: 'floor', hold: 3,
    cue: 'Hands and knees. Drop your tummy and look up!',
  },
  cat: {
    label: 'Cat pose', emoji: '\u{1F431}', family: 'floor', hold: 3,
    cue: 'Hands and knees. Arch your back and tuck your chin!',
  },
  cobra: {
    label: 'Cobra pose', emoji: '\u{1F40D}', family: 'floor', hold: 2.5,
    cue: 'Lie on your tummy and lift your chest up!',
  },
  // --- body letters
  T: {
    label: 'Letter T', emoji: 'T', family: 'letter', hold: 1.2,
    cue: 'Make a T! Arms straight out to the sides.',
  },
  Y: {
    label: 'Letter Y', emoji: 'Y', family: 'letter', hold: 1.2,
    cue: 'Make a Y! Arms up high in a V.',
  },
  O: {
    label: 'Letter O', emoji: 'O', family: 'letter', hold: 1.2,
    cue: 'Make an O! Hands together above your head.',
  },
  A: {
    label: 'Letter A', emoji: 'A', family: 'letter', hold: 1.2,
    cue: 'Make an A! Feet wide apart, arms down and out.',
  },
  L: {
    label: 'Letter L', emoji: 'L', family: 'letter', hold: 1.2,
    cue: 'Make an L! One arm straight out, the other down.',
  },
  X: {
    label: 'Letter X', emoji: 'X', family: 'letter', hold: 1.2,
    cue: 'Make an X! Arms up wide and feet wide.',
  },
};

export const FLOOR_POSES = Object.keys(SHAPES).filter((k) => SHAPES[k].family === 'floor');
export const LETTERS = Object.keys(SHAPES).filter((k) => SHAPES[k].family === 'letter');

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Reduce landmarks to the shape-relevant geometry. Returns null when too much
 * of the body is missing to say anything honest about it.
 */
export function measureShape(lm, minVisibility = 0.4) {
  if (!lm || lm.length < 29) return null;
  const vis = (i) => (lm[i].visibility ?? 1);
  const core = [P.shoulderL, P.shoulderR, P.hipL, P.hipR];
  if (core.reduce((s, i) => s + vis(i), 0) / core.length < minVisibility) return null;

  // Mirrored, to match the rest of the app.
  const pt = (i) => ({ x: 1 - lm[i].x, y: lm[i].y });

  const shoulder = mid(pt(P.shoulderL), pt(P.shoulderR));
  const hip = mid(pt(P.hipL), pt(P.hipR));
  const knee = mid(pt(P.kneeL), pt(P.kneeR));
  const ankle = mid(pt(P.ankleL), pt(P.ankleR));
  const wristA = pt(P.wristL);
  const wristB = pt(P.wristR);
  const wrist = mid(wristA, wristB);
  const nose = pt(P.nose);

  const torso = Math.max(0.05, dist(shoulder, hip));
  const shoulderWidth = Math.max(0.02, Math.abs(pt(P.shoulderL).x - pt(P.shoulderR).x));

  // 1 = torso straight up and down, 0 = torso flat like a table.
  const upright = Math.abs(hip.y - shoulder.y) / torso;

  // Lowest thing in frame stands in for the floor.
  const floorY = Math.max(ankle.y, knee.y, wrist.y, hip.y, shoulder.y);

  // Per-arm geometry, measured from the body's own centre line so it reads the
  // same whichever way the child is facing.
  const rise = (w) => (shoulder.y - w.y) / torso;          // + = wrist above the shoulders
  const out = (w) => Math.abs(w.x - shoulder.x) / shoulderWidth;  // + = away from the body

  return {
    shoulder, hip, knee, ankle, wrist, nose, wristA, wristB,
    torso, shoulderWidth, upright, floorY,
    hipAboveFloor: (floorY - hip.y) / torso,
    headAboveShoulder: (shoulder.y - nose.y) / torso,
    shoulderAboveHip: (hip.y - shoulder.y) / torso,
    ankleBelowHip: (ankle.y - hip.y) / torso,
    wristSpread: Math.abs(wristA.x - wristB.x) / shoulderWidth,
    ankleSpread: Math.abs(pt(P.ankleL).x - pt(P.ankleR).x) / shoulderWidth,
    wristAboveHip: (hip.y - wrist.y) / torso,
    riseA: rise(wristA), riseB: rise(wristB),
    outA: out(wristA), outB: out(wristB),
    handsApart: Math.abs(wristA.x - wristB.x) / shoulderWidth,
  };
}

/** True when the child is on hands and knees at all, whatever their back does. */
export function isQuadruped(m) {
  return m.upright < 0.62          // torso closer to flat than upright
    && m.hipAboveFloor > 0.15      // hips lifted off the floor
    && m.wrist.y > m.shoulder.y;   // hands planted below the shoulders
}

/**
 * Cobra, generously.
 *
 * The strict version -- hips pinned to the mat, legs flat, chest well up --
 * turned out to be more than a five-year-old will hold. This asks only that
 * they are down on the floor and not on all fours, with some lift through the
 * chest. A loose J shape counts. The therapeutic value is in getting down and
 * stretching up at all.
 */
export function isCobra(m) {
  return m.upright < 0.85              // not standing
    && m.hipAboveFloor < 0.5           // hips low, near the floor
    && m.shoulderAboveHip > 0.08;      // any lift through the chest
}

/**
 * Which named shape the body is in, or null. One at a time: the checks run
 * from most specific to least, so a letter cannot be mistaken for standing.
 */
export function detectShape(lm) {
  const m = measureShape(lm);
  if (!m) return { shape: null, metrics: null };

  let shape = null;
  if (isQuadruped(m)) {
    // Cat and Cow differ at the head end, which the model tracks far more
    // reliably than the curve of a small child's spine.
    if (m.headAboveShoulder > 0.12) shape = 'cow';
    else if (m.headAboveShoulder < -0.05) shape = 'cat';
    else shape = 'quadruped';
  } else if (isCobra(m)) {
    shape = 'cobra';
  } else if (m.upright > 0.7) {
    shape = detectLetter(m) || 'stand';
  }
  return { shape, metrics: m };
}

/**
 * The standing letters. Checked from the most constrained shape down, because
 * several of them overlap: an O is a Y with the hands brought together, and an
 * X is a Y with the feet apart.
 */
export function detectLetter(m) {
  const bothUp = m.riseA > 0.3 && m.riseB > 0.3;
  const bothOut = m.outA > 0.7 && m.outB > 0.7;
  const legsWide = m.ankleSpread > 1.3;

  // O: hands meeting above the head.
  if (m.riseA > 0.45 && m.riseB > 0.45 && m.handsApart < 0.9) return 'O';

  // X: arms up and out, feet apart.
  if (bothUp && bothOut && legsWide) return 'X';

  // Y: arms up and out, feet together.
  if (bothUp && m.outA > 0.5 && m.outB > 0.5 && !legsWide) return 'Y';

  // T: arms level with the shoulders, stretched out.
  if (Math.abs(m.riseA) < 0.35 && Math.abs(m.riseB) < 0.35 && m.outA > 0.9 && m.outB > 0.9) return 'T';

  // L: one arm out sideways, the other hanging down.
  const armOut = (rise, out) => Math.abs(rise) < 0.4 && out > 0.9;
  const armDown = (rise, out) => rise < -0.5 && out < 0.9;
  if ((armOut(m.riseA, m.outA) && armDown(m.riseB, m.outB))
    || (armOut(m.riseB, m.outB) && armDown(m.riseA, m.outA))) return 'L';

  // A: feet wide, arms low and angled away from the body.
  if (legsWide && m.riseA < -0.2 && m.riseB < -0.2 && m.outA > 0.75 && m.outB > 0.75) return 'A';

  return null;
}

/** Does the body match a target shape, counting near-misses as matches? */
export function matchesShape(lm, target) {
  const { shape } = detectShape(lm);
  return shapeSatisfies(shape, target);
}

/** Same question, when the shape has already been detected this frame. */
export function shapeSatisfies(shape, target) {
  if (!shape || !target) return false;
  if (shape === target) return true;
  // Cat and Cow both mean "you got on the floor on hands and knees", which is
  // most of the work. Accept a neutral table top for either.
  if ((target === 'cow' || target === 'cat') && shape === 'quadruped') return true;
  // An X is a Y with the feet apart; a child who makes either has thrown their
  // arms up and out, so accept the near miss rather than punish it.
  if (target === 'Y' && shape === 'X') return true;
  if (target === 'X' && shape === 'Y') return true;
  return false;
}

/**
 * Accumulates hold time for a shape. Brief dropouts -- the child wobbles, or
 * the tracker loses an arm -- decay the timer slowly instead of resetting it,
 * so one bad frame does not undo four seconds of effort.
 */
export class ShapeHold {
  constructor(target, seconds = SHAPES[target]?.hold ?? 3) {
    this.target = target;
    this.required = seconds;
    this.held = 0;
    this.everMatched = false;
  }

  update(lm, dt) {
    const ok = lm ? matchesShape(lm, this.target) : false;
    if (ok) {
      this.held = Math.min(this.required, this.held + dt);
      this.everMatched = true;
    } else {
      this.held = Math.max(0, this.held - dt * 0.6);
    }
    return { matching: ok, progress: this.held / this.required, done: this.held >= this.required };
  }
}
