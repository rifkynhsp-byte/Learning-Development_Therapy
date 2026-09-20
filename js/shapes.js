/**
 * Held body shapes -- the floor poses, as opposed to the quick gestures in
 * pose.js.
 *
 * These are the reflex-integration positions: quadruped Cat and Cow for the
 * symmetrical tonic neck reflex, Cobra for spinal extension, and a wide Star
 * for the spinal Galant reflex. The camera sees the child side-on for the
 * floor poses, so everything here is judged from the torso's tilt and from
 * where the hips sit relative to whatever is lowest in frame.
 *
 * The thresholds are deliberately loose. A five-year-old's Cobra is not a
 * yoga teacher's Cobra, and the point is that they get on the floor and move,
 * not that they hit a shape exactly.
 */

const P = {
  nose: 0,
  shoulderL: 11, shoulderR: 12,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

export const SHAPES = {
  cow: {
    label: 'Cow pose',
    emoji: '\u{1F404}',
    cue: 'Hands and knees. Drop your tummy and look up!',
    hold: 3,
  },
  cat: {
    label: 'Cat pose',
    emoji: '\u{1F431}',
    cue: 'Hands and knees. Arch your back and tuck your chin!',
    hold: 3,
  },
  cobra: {
    label: 'Cobra pose',
    emoji: '\u{1F40D}',
    cue: 'Lie on your tummy and push your chest up high!',
    hold: 3,
  },
  star: {
    label: 'Star shape',
    emoji: '\u{2B50}',
    cue: 'Stand up tall and make a big star -- arms and legs wide!',
    hold: 2.5,
  },
};

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
  const wrist = mid(pt(P.wristL), pt(P.wristR));
  const nose = pt(P.nose);

  const torso = Math.max(0.05, dist(shoulder, hip));
  const shoulderWidth = Math.max(0.02, Math.abs(pt(P.shoulderL).x - pt(P.shoulderR).x));

  // 1 = torso straight up and down, 0 = torso flat like a table.
  const upright = Math.abs(hip.y - shoulder.y) / torso;

  // Lowest thing in frame stands in for the floor.
  const floorY = Math.max(ankle.y, knee.y, wrist.y, hip.y, shoulder.y);

  return {
    shoulder, hip, knee, ankle, wrist, nose,
    torso, shoulderWidth, upright, floorY,
    hipAboveFloor: (floorY - hip.y) / torso,
    headAboveShoulder: (shoulder.y - nose.y) / torso,
    shoulderAboveHip: (hip.y - shoulder.y) / torso,
    ankleBelowHip: (ankle.y - hip.y) / torso,
    wristSpread: Math.abs(pt(P.wristL).x - pt(P.wristR).x) / shoulderWidth,
    ankleSpread: Math.abs(pt(P.ankleL).x - pt(P.ankleR).x) / shoulderWidth,
    wristAboveHip: (hip.y - wrist.y) / torso,
  };
}

/** True when the child is on hands and knees at all, whatever their back does. */
export function isQuadruped(m) {
  return m.upright < 0.62          // torso closer to flat than upright
    && m.hipAboveFloor > 0.15      // hips lifted off the floor
    && m.wrist.y > m.shoulder.y;   // hands planted below the shoulders
}

/**
 * Which of the named shapes the body is currently in, or null. One shape at a
 * time: the checks are ordered from most specific to least.
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
  } else if (
    m.upright < 0.75 &&
    m.hipAboveFloor < 0.22 &&        // hips down on the mat
    m.shoulderAboveHip > 0.25 &&     // chest pushed up
    Math.abs(m.ankleBelowHip) < 0.55 // legs stretched out flat behind
  ) {
    shape = 'cobra';
  } else if (
    m.upright > 0.7 &&               // standing
    m.wristSpread > 2.0 &&           // arms out wide
    m.ankleSpread > 1.3              // feet apart
  ) {
    shape = 'star';
  } else if (m.upright > 0.7) {
    shape = 'stand';
  }
  return { shape, metrics: m };
}

/** Does the body match a target shape, counting near-misses as matches? */
export function matchesShape(lm, target) {
  const { shape } = detectShape(lm);
  if (!shape) return false;
  if (shape === target) return true;
  // Cat and Cow both mean "you got on the floor on hands and knees", which is
  // most of the work. Accept a neutral table top for either.
  if ((target === 'cow' || target === 'cat') && shape === 'quadruped') return true;
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
