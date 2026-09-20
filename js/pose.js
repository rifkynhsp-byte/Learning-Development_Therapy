/**
 * Camera + MediaPipe pose tracking, reduced to the four gross-motor gestures
 * the runner needs: jump, duck (squat), side step, and overhead stretch.
 *
 * Everything is measured relative to a per-child calibration taken while they
 * stand still, and every distance is divided by their own torso length. That
 * way the thresholds hold whether the child is 1 m or 3 m from the camera, and
 * whether the device is an iPad on a chair or a laptop on the floor.
 */

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
// Tried in order: if a network or a CDN is having a bad day, the next mirror
// gets a go before the session is written off.
const BUNDLES = [
  `${CDN}/vision_bundle.mjs`,
  CDN,
  `https://unpkg.com/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,
];
const WASM_ROOTS = [
  `${CDN}/wasm`,
  `https://unpkg.com/@mediapipe/tasks-vision@${VERSION}/wasm`,
];
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// BlazePose landmark indices we care about.
const L = {
  nose: 0,
  shoulderL: 11, shoulderR: 12,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

// Bones drawn in the little corner preview.
const BONES = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

const TUNING = {
  jumpRise: 0.09,      // hips this far above baseline (in torso lengths) = jump
  kneeLift: 0.30,      // ...or one knee lifted this high, for kids who march
  duckEnter: -0.15,    // hips this far below baseline = duck
  duckExit: -0.08,     // hysteresis so a wobble does not flicker the state
  laneEnter: 0.42,     // sideways travel needed to commit to a lane
  laneExit: 0.26,
  reachRise: 0.25,     // wrists above shoulders by this much = big stretch
  jumpCooldown: 420,   // ms
  reachCooldown: 900,
  minVisibility: 0.5,
};

export class PoseController {
  constructor(video, previewCanvas) {
    this.video = video;
    this.preview = previewCanvas;
    this.pctx = previewCanvas ? previewCanvas.getContext('2d') : null;

    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.lastVideoTime = -1;

    /** Live gesture state read by the game each frame. */
    this.state = {
      present: false,
      lane: 0,          // -1 left, 0 centre, 1 right
      ducking: false,
      jump: false,      // edge-triggered, cleared by consume()
      reach: false,     // edge-triggered, cleared by consume()
      rise: 0,          // hip height above baseline, in torso lengths
    };

    this.baseline = null;   // set by calibrate()
    this._calibSamples = null;
    this._smooth = null;
    // Not 0: performance.now() is small right after load, and a zero origin
    // would swallow the very first jump or stretch as if it were a repeat.
    this._lastJumpAt = -1e9;
    this._lastReachAt = -1e9;
    this._wasAirborne = false;
    this.landmarks = null;
  }

  get calibrated() { return this.baseline !== null; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    const { FilesetResolver, PoseLandmarker } = await loadVisionBundle();
    const vision = await firstThatWorks(WASM_ROOTS, (root) => FilesetResolver.forVisionTasks(root));
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      // VIDEO mode keeps temporal state between frames, which smooths out the
      // jitter you otherwise get during fast arm and leg movement.
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.running = true;
    this._tick();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Start collecting a standing baseline. Resolves once enough frames land. */
  calibrate(durationMs = 2600) {
    this.baseline = null;
    this._smooth = null;
    return new Promise((resolve) => {
      this._calibSamples = { list: [], until: performance.now() + durationMs, resolve };
    });
  }

  /** Read and clear the edge-triggered gestures. */
  consume() {
    const snapshot = { ...this.state };
    this.state.jump = false;
    this.state.reach = false;
    return snapshot;
  }

  _tick = () => {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    if (!this.landmarker || this.video.readyState < 2) return;
    // detectForVideo demands strictly increasing timestamps.
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(this.video, performance.now());
    } catch (err) {
      console.warn('pose detect failed', err);
      return;
    }

    const lm = result.landmarks && result.landmarks[0];
    this.landmarks = lm || null;
    if (!lm) {
      this.state.present = false;
      this._drawPreview(null);
      return;
    }

    const metrics = this._measure(lm);
    if (!metrics) {
      this.state.present = false;
      this._drawPreview(lm);
      return;
    }
    this.state.present = true;

    if (this._calibSamples) this._collect(metrics);
    else if (this.baseline) this._classify(metrics);

    this._drawPreview(lm);
  };

  /**
   * Reduce 33 landmarks to the handful of mirrored, scale-free numbers the
   * gesture rules use. Returns null when the child is not properly in frame.
   */
  _measure(lm) {
    const vis = (i) => (lm[i].visibility ?? 1);
    const core = [L.shoulderL, L.shoulderR, L.hipL, L.hipR];
    const coreVis = core.reduce((sum, i) => sum + vis(i), 0) / core.length;
    if (coreVis < TUNING.minVisibility) return null;

    // The preview and the game are mirrored, so a step to the child's right
    // should read as a step to the right on screen: flip x here, once.
    const mx = (i) => 1 - lm[i].x;
    const my = (i) => lm[i].y;

    const shoulderX = (mx(L.shoulderL) + mx(L.shoulderR)) / 2;
    const shoulderY = (my(L.shoulderL) + my(L.shoulderR)) / 2;
    const hipX = (mx(L.hipL) + mx(L.hipR)) / 2;
    const hipY = (my(L.hipL) + my(L.hipR)) / 2;

    const legsVisible = (vis(L.kneeL) + vis(L.kneeR)) / 2 >= TUNING.minVisibility;
    const kneeY = legsVisible ? Math.min(my(L.kneeL), my(L.kneeR)) : null;

    const wristRise = Math.min(
      shoulderY - my(L.wristL),
      shoulderY - my(L.wristR),
    ); // positive when both wrists are above the shoulder line

    const raw = { shoulderX, shoulderY, hipX, hipY, kneeY, wristRise };
    // Light exponential smoothing kills single-frame landmark noise without
    // adding the lag a longer window would.
    if (!this._smooth) this._smooth = { ...raw };
    const a = 0.45;
    for (const k of ['shoulderX', 'shoulderY', 'hipX', 'hipY', 'wristRise']) {
      this._smooth[k] = this._smooth[k] * (1 - a) + raw[k] * a;
    }
    this._smooth.kneeY = kneeY === null ? null
      : (this._smooth.kneeY === null ? kneeY : this._smooth.kneeY * (1 - a) + kneeY * a);

    const torso = Math.max(0.08, this._smooth.hipY - this._smooth.shoulderY);
    return { ...this._smooth, torso };
  }

  _collect(m) {
    const job = this._calibSamples;
    job.list.push(m);
    if (performance.now() < job.until) return;

    const mean = (pick) => {
      const vals = job.list.map(pick).filter((v) => v !== null && Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    this.baseline = {
      centerX: mean((s) => s.shoulderX),
      hipY: mean((s) => s.hipY),
      shoulderY: mean((s) => s.shoulderY),
      kneeY: mean((s) => s.kneeY),
      torso: mean((s) => s.torso) || 0.25,
    };
    this._calibSamples = null;
    job.resolve(this.baseline);
  }

  _classify(m) {
    const b = this.baseline;
    const torso = b.torso;
    const now = performance.now();

    // Screen y grows downward, so "above baseline" is a negative delta.
    const hipRise = (b.hipY - m.hipY) / torso;
    const kneeLift = (b.kneeY !== null && m.kneeY !== null)
      ? (b.kneeY - m.kneeY) / torso : 0;
    this.state.rise = hipRise;

    // --- Jump: hips up, or a knee driven up for a child who marches instead.
    const airborne = hipRise > TUNING.jumpRise || kneeLift > TUNING.kneeLift;
    if (airborne && !this._wasAirborne && now - this._lastJumpAt > TUNING.jumpCooldown) {
      this.state.jump = true;
      this._lastJumpAt = now;
    }
    this._wasAirborne = airborne;

    // --- Duck: hips dropped into a squat, with hysteresis on the way out.
    if (!this.state.ducking && hipRise < TUNING.duckEnter) this.state.ducking = true;
    else if (this.state.ducking && hipRise > TUNING.duckExit) this.state.ducking = false;

    // --- Lane: sideways travel of the shoulder midpoint.
    const drift = (m.shoulderX - b.centerX) / torso;
    const lane = this.state.lane;
    if (lane !== 1 && drift > TUNING.laneEnter) this.state.lane = 1;
    else if (lane !== -1 && drift < -TUNING.laneEnter) this.state.lane = -1;
    else if (lane !== 0 && Math.abs(drift) < TUNING.laneExit) this.state.lane = 0;

    // --- Reach: both wrists clearly above the shoulders.
    const reaching = m.wristRise / torso > TUNING.reachRise;
    if (reaching && now - this._lastReachAt > TUNING.reachCooldown) {
      this.state.reach = true;
      this._lastReachAt = now;
    }
  }

  _drawPreview(lm) {
    if (!this.pctx) return;
    const { width: w, height: h } = this.preview;
    const ctx = this.pctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(13,27,42,0.85)';
    ctx.fillRect(0, 0, w, h);
    if (!lm) return;

    const px = (i) => (1 - lm[i].x) * w;
    const py = (i) => lm[i].y * h;

    ctx.strokeStyle = this.state.present ? '#4cc9f0' : '#ef476f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      if (!lm[a] || !lm[b]) continue;
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd166';
    for (const i of [L.nose, L.wristL, L.wristR, L.ankleL, L.ankleR]) {
      if (!lm[i]) continue;
      ctx.beginPath();
      ctx.arc(px(i), py(i), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Import the tasks-vision bundle from the first mirror that answers. */
async function loadVisionBundle() {
  return firstThatWorks(BUNDLES, (url) => import(/* @vite-ignore */ url));
}

async function firstThatWorks(candidates, attempt) {
  let last;
  for (const candidate of candidates) {
    try {
      return await attempt(candidate);
    } catch (err) {
      last = err;
      console.warn('pose: falling back from', candidate, err);
    }
  }
  throw new Error(`Could not load the motion tracker (${last && last.message}).`);
}

export { TUNING };
