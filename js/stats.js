/**
 * Session statistics, an exercise estimate, and a small history kept on the
 * device.
 *
 * The calorie figure is an estimate and nothing more. It comes from the
 * standard MET equation -- kcal/min = MET x 3.5 x kg / 200 -- with the MET
 * value inferred from how often the child actually moved, rather than assumed
 * from the fact that the game was open. A child standing still in front of the
 * camera burns close to nothing, and the model reflects that.
 *
 * MET values for children's activity are themselves approximations, and young
 * children are less economical movers than the adults these equations were
 * built from, so treat the number as "roughly this much effort", useful for
 * comparing one session with another, not as a measurement.
 */

const STORE_KEY = 'sensory-runner-history-v1';
const MAX_HISTORY = 60;

export const CHILD = {
  ageYears: 5,
  weightKg: 18,
};

// Rough MET anchors for a child at play. The scale runs from standing still
// to sustained jumping, and where a session lands on it is decided by the
// movement count, never by elapsed time alone.
const MET_IDLE = 1.8;     // standing in front of the camera, not moving
const MET_CAP = 7.5;      // sustained jumping and squatting
const MET_FULL_AT = 25;   // weighted movements per minute that count as flat out

// How much each movement contributes to the intensity estimate. Jumping and
// squatting are whole-body; a side step and a stretch are lighter.
const EFFORT = { jumps: 1.6, ducks: 1.3, lanes: 0.6, reaches: 0.5, poses: 1.0 };

export class SessionStats {
  constructor(child = CHILD) {
    this.child = child;
    this.reset();
  }

  reset() {
    this.startedAt = Date.now();
    this.activeSeconds = 0;
    this.counts = { jumps: 0, ducks: 0, lanes: 0, reaches: 0, poses: 0 };
    this.posesByShape = {};
    this.distance = 0;
    this.fruit = 0;
    this.runs = 0;
    this.bestDistance = 0;
    this.speedLabel = 'medium';
  }

  /** Count a movement the child actually performed. */
  record(kind, detail) {
    if (kind === 'pose') {
      this.counts.poses++;
      if (detail) this.posesByShape[detail] = (this.posesByShape[detail] || 0) + 1;
      return;
    }
    if (kind in this.counts) this.counts[kind]++;
  }

  /** Called every frame while a run is in progress. */
  tick(dt) { this.activeSeconds += dt; }

  endRun(distance) {
    this.runs++;
    this.distance += distance;
    this.bestDistance = Math.max(this.bestDistance, distance);
  }

  get totalMovements() {
    return Object.values(this.counts).reduce((a, b) => a + b, 0);
  }

  /** Weighted movements per minute of play. */
  get intensity() {
    const minutes = this.activeSeconds / 60;
    if (minutes < 0.05) return 0;
    let weighted = 0;
    for (const [kind, weight] of Object.entries(EFFORT)) {
      weighted += (this.counts[kind] || 0) * weight;
    }
    return weighted / minutes;
  }

  get met() {
    if (this.activeSeconds < 5) return MET_IDLE;
    // Starts at standing and climbs with how much the child actually moved, so
    // a session spent watching the screen is not credited as exercise. The
    // curve saturates rather than running away.
    const met = MET_IDLE + (MET_CAP - MET_IDLE) * Math.min(1, this.intensity / MET_FULL_AT);
    return Math.max(MET_IDLE, Math.min(MET_CAP, met));
  }

  get kcal() {
    const minutes = this.activeSeconds / 60;
    return this.met * 3.5 * this.child.weightKg / 200 * minutes;
  }

  summary() {
    return {
      startedAt: this.startedAt,
      minutes: this.activeSeconds / 60,
      seconds: Math.round(this.activeSeconds),
      counts: { ...this.counts },
      posesByShape: { ...this.posesByShape },
      distance: Math.round(this.distance),
      bestDistance: Math.round(this.bestDistance),
      fruit: this.fruit,
      runs: this.runs,
      met: Number(this.met.toFixed(1)),
      kcal: Number(this.kcal.toFixed(1)),
      intensity: Number(this.intensity.toFixed(1)),
      speed: this.speedLabel,
    };
  }
}

// --------------------------------------------------------------- history

/** Everything below degrades quietly when storage is unavailable. */
function readRaw() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function loadHistory() {
  const rows = readRaw();
  return Array.isArray(rows) ? rows : [];
}

/**
 * Store a session, replacing the previous write from the same sitting rather
 * than appending. The app saves after every run so a closed tab loses nothing,
 * and that should leave one row per sitting, not one per run.
 */
export function saveSession(summary) {
  if (summary.seconds < 10) return loadHistory(); // not a session, just a poke
  const rows = loadHistory();
  const last = rows[rows.length - 1];
  if (last && last.startedAt === summary.startedAt) rows.pop();
  rows.push(summary);
  const trimmed = rows.slice(-MAX_HISTORY);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    /* private browsing, quota, blocked storage: the session still counts on screen */
  }
  return trimmed;
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** Totals across every stored session, plus today's. */
export function aggregate(rows = loadHistory(), now = Date.now()) {
  const blank = () => ({
    sessions: 0, minutes: 0, kcal: 0, distance: 0, fruit: 0,
    counts: { jumps: 0, ducks: 0, lanes: 0, reaches: 0, poses: 0 },
  });
  const all = blank();
  const today = blank();

  for (const row of rows) {
    for (const bucket of [all, ...(sameDay(row.startedAt, now) ? [today] : [])]) {
      bucket.sessions++;
      bucket.minutes += row.minutes || 0;
      bucket.kcal += row.kcal || 0;
      bucket.distance += row.distance || 0;
      bucket.fruit += row.fruit || 0;
      for (const k of Object.keys(bucket.counts)) {
        bucket.counts[k] += (row.counts && row.counts[k]) || 0;
      }
    }
  }
  return { all, today, rows };
}

export function clearHistory() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing to do */ }
}
