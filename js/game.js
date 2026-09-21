/**
 * Three-lane endless runner, Subway-Surfers style, rendered with a simple
 * pseudo-3D projection on a 2D canvas (no engine, no asset downloads).
 *
 * Every obstacle type demands one specific whole-body movement:
 *   ground animal   -> jump      (vestibular input, lower-body heavy work)
 *   flying animal   -> squat     (core stability, sustained leg strength)
 *   big animal      -> side step (weight shift, bilateral coordination)
 *   star            -> stretch   (overhead extension, crossing the midline)
 *   yoga gate       -> held pose (reflex integration: Cat, Cow, Cobra, Star)
 *
 * Timing is forgiving by design. See TOLERANCE below: a child who jumps early
 * or late still gets through, because the therapeutic value is in the jump,
 * not in the frame it landed on.
 */

import { shapeSatisfies } from './shapes.js';

const LANES = [-1, 0, 1];
const DEPTH = 26;          // perspective falloff constant (higher = flatter)
const PLAYER_Z = 3.5;      // the runner sits ahead of the camera, not on it,
                           // so there is visible road under their feet
const FAR = 58;            // spawn distance, in world units
const ROAD_FAR = 260;      // the road itself is drawn well past that, so it
                           // converges into the horizon instead of stopping short
// A floaty arc: it widens the window in which the child is above an obstacle,
// which absorbs both a slightly early take-off and the tracking latency.
const GRAVITY = 18;
const JUMP_V = 6.6;
const DUCK_HOLD = 0.7;     // min seconds a duck stays latched

/** Speed settings, offered to the adult in the menu. */
export const SPEED_PRESETS = {
  slow:   { label: 'Slow',   multiplier: 0.5 },
  medium: { label: 'Medium', multiplier: 1.0 },
  fast:   { label: 'Fast',   multiplier: 2.0 },
};

/**
 * How generous the timing is. All in seconds.
 *
 * `early` covers the child who jumps as soon as they see the animal and has
 * already landed by the time it arrives. `late` defers the crash for a moment,
 * so a jump that lands just after contact still rescues them. Between them
 * they turn "you mistimed it" into "you moved, that counts".
 */
export const TOLERANCE = {
  earlyJump: 0.75,
  earlyDuck: 0.5,
  late: 0.3,
};

const OBSTACLES = {
  // Ground animals: jump over them.
  barrier: {
    h0: 0, h1: 0.58, w: 0.8, depth: 0.5,
    face: '#ef476f', top: '#ff7d9c',
    emojis: ['\u{1F40A}', '\u{1F422}', '\u{1F994}', '\u{1F438}', '\u{1F994}'],
    action: 'jump',
  },
  // Flying things at head height: duck under them.
  bar: {
    h0: 0.92, h1: 1.4, w: 0.98, depth: 0.5,
    face: '#f78c6b', top: '#ffb59b',
    emojis: ['\u{1F987}', '\u{1F41D}', '\u{1F99C}', '\u{1F985}'],
    action: 'duck',
  },
  // Big animals filling a lane: step around them.
  train: {
    h0: 0, h1: 2.0, w: 0.88, depth: 2.6,
    face: '#3a86ff', top: '#7fb0ff',
    emojis: ['\u{1F42F}', '\u{1F981}', '\u{1F418}', '\u{1F98F}', '\u{1F43B}'],
    action: 'dodge',
  },
};

/** A letter wall: full width, with a hole shaped like the letter. */
const WALL = { h0: 0, h1: 2.6, depth: 0.4 };

const FRUIT = ['\u{1F34E}', '\u{1F34C}', '\u{1F353}', '\u{1F347}', '\u{1F34A}',
               '\u{1F349}', '\u{1F95D}', '\u{1F34D}', '\u{1F352}', '\u{1F96D}'];

const GATE_SHAPES = ['cow', 'cat', 'cobra'];   // floor poses only; letters go on walls
const FIRST_GATE = 150;    // metres before the first floor pose
const GATE_EVERY = 280;
const FIRST_WALL = 70;     // metres before the first letter wall
const WALL_EVERY = 120;
const WALL_LETTERS = ['T', 'Y', 'O', 'X', 'L', 'A'];

/**
 * Scenery. The run passes through five places rather than one endless street,
 * because a background that never changes stops being noticed -- and noticing
 * is half of what we are training. A zone lasts about two minutes at Medium.
 */
const ZONE_LENGTH = 260;

const THEMES = [
  { key: 'city', name: 'City', skyline: 'buildings',
    sky: ['#12263f', '#1b4965', '#5fa8d3'], ground: '#16222f',
    road: ['#20303f', '#2f4457'], far: '#0d1b2a',
    props: ['\u{1F3E2}', '\u{1F3EC}', '\u{1F68F}', '\u{1F6A6}'] },
  { key: 'jungle', name: 'Jungle', skyline: 'trees',
    sky: ['#04230f', '#0f5132', '#5fbf6a'], ground: '#123320',
    road: ['#2b4a30', '#3d6b45'], far: '#071a0f',
    props: ['\u{1F334}', '\u{1F333}', '\u{1F99C}', '\u{1F33F}', '\u{1F412}'] },
  { key: 'desert', name: 'Desert', skyline: 'dunes',
    sky: ['#2b1d12', '#a6631b', '#f2c46b'], ground: '#3a2a18',
    road: ['#5a4326', '#7a5c35'], far: '#241709',
    props: ['\u{1F335}', '\u{1F42A}', '\u{1FAA8}', '\u{1F98E}'] },
  { key: 'snow', name: 'Snow', skyline: 'mountains',
    sky: ['#0f1f33', '#2a4a6b', '#cde6f7'], ground: '#1d2b3d',
    road: ['#33475e', '#4a6480'], far: '#0b1522',
    props: ['\u26C4', '\u{1F332}', '\u{1F3D4}\uFE0F', '\u2744\uFE0F'] },
  { key: 'space', name: 'Space', skyline: 'stars',
    sky: ['#03020c', '#0f0a24', '#2a1d52'], ground: '#0a0818',
    road: ['#171432', '#241f4a'], far: '#03020a',
    props: ['\u{1F680}', '\u{1F6F8}', '\u{1FA90}', '\u2B50', '\u{1F47D}'] },
];

export class RunnerGame {
  constructor(canvas, sfx, onEvent = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.onEvent = onEvent;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.speedPreset = 'medium';
    this.speedMultiplier = SPEED_PRESETS.medium.multiplier;
    this.gatesEnabled = true;
    this.wallsEnabled = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.reset();
  }

  setSpeedPreset(key) {
    if (!SPEED_PRESETS[key]) return;
    this.speedPreset = key;
    this.speedMultiplier = SPEED_PRESETS[key].multiplier;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w;
    this.h = h;
    this.horizon = h * 0.34;
    this.groundY = h * 0.88;
    this.unit = Math.min(w * 0.17, h * 0.24);   // pixels per world unit at z = 0
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  reset() {
    this.running = false;
    this.over = false;
    this.time = 0;
    this.distance = 0;
    this.coins = 0;
    this.speed = 8 * this.speedMultiplier;
    this.obstacles = [];
    this.pickups = [];
    this.particles = [];
    this.popups = [];
    this.sinceSpawn = 0;
    this.nextGap = 16;
    this.shield = 0;
    this.runPhase = 0;
    this.shake = 0;
    this.flash = 0;
    this.pendingCrash = null;
    this.gate = null;
    this.walls = [];
    this.scenery = [];
    this.sinceProp = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.multiplier = 1;
    this.themeIndex = 0;
    this.theme = THEMES[0];
    this.nextGateAt = FIRST_GATE;
    this.nextWallAt = FIRST_WALL;
    this.player = {
      lane: 0, x: 0, y: 0, vy: 0,
      ducking: false, duckTimer: 0,
      lastJumpAt: -99, lastDuckAt: -99, lastAirborneAt: -99,
    };
    this.stats = { jumps: 0, ducks: 0, lanes: 0, reaches: 0, poses: 0, letters: 0 };
  }

  start() {
    const preset = this.speedPreset;
    this.reset();
    this.speedPreset = preset;
    this.running = true;
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    dt = Math.min(dt, 0.05); // a backgrounded tab must not teleport the player
    if (!this.running) { this.render(); return; }
    this.time += dt;

    // A yoga gate freezes the world until the pose is done or waved through.
    if (this.gate) { this._updateGateVisual(dt); this.render(); return; }

    this.speed = Math.min(15, 8 + this.distance * 0.007 / this.speedMultiplier)
      * this.speedMultiplier;
    this.distance += this.speed * dt;
    this.runPhase += dt * (this.speed * 0.9);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 3);

    this._updateZone();
    this._applyInput(dt, input);
    this._movePlayer(dt);
    this._spawn(dt);
    this._advanceWorld(dt);
    this._collide(dt);
    this._resolveWalls(input);
    this.render();
  }

  /** Move to the next place when the child has run far enough. */
  _updateZone() {
    const index = Math.floor(this.distance / ZONE_LENGTH) % THEMES.length;
    if (index === this.themeIndex) return;
    this.themeIndex = index;
    this.theme = THEMES[index];
    this.scenery = [];
    this.flash = 0.8;
    this._popup(this.theme.name, '#4cc9f0');
    this.onEvent(`${this.theme.name}!`, { zone: this.theme.key });
  }

  /** Streaks: every fifth clean thing in a row raises the fruit multiplier. */
  _addCombo() {
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.multiplier = Math.min(5, 1 + Math.floor(this.combo / 5));
  }

  _breakCombo() {
    this.combo = 0;
    this.multiplier = 1;
  }

  /** What the child has to get ready for, for the HUD. */
  nextChallenge() {
    const wall = this.walls.filter((w) => !w.resolved).sort((a, b) => a.z - b.z)[0];
    if (wall) return { type: 'letter', letter: wall.letter, distance: Math.max(0, wall.z - PLAYER_Z) };
    const gateIn = this.nextGateAt - this.distance;
    const wallIn = this.nextWallAt - this.distance;
    if (wallIn < gateIn) return { type: 'wall-soon', distance: Math.max(0, wallIn) };
    return { type: 'pose-soon', distance: Math.max(0, gateIn) };
  }

  _applyInput(dt, input) {
    const p = this.player;

    if (input.lane !== p.lane) {
      p.lane = input.lane;
      this.stats.lanes++;
      this.sfx.lane();
      this.onEvent(input.lane < 0 ? 'Left!' : input.lane > 0 ? 'Right!' : 'Middle', { move: 'lanes' });
    }

    if (input.jump && p.y <= 0.001) {
      p.vy = JUMP_V;
      p.lastJumpAt = this.time;
      p.lastAirborneAt = this.time;
      p.ducking = false;
      p.duckTimer = 0;
      this.stats.jumps++;
      this.sfx.jump();
      this.onEvent('Jump!', { move: 'jumps' });
    }

    // A squat is held as long as the child stays low, but latches briefly so a
    // fast bob still carries them under the obstacle.
    if (input.ducking && p.y <= 0.001) {
      if (!p.ducking) {
        this.stats.ducks++;
        this.sfx.duck();
        this.onEvent('Duck!', { move: 'ducks' });
      }
      p.ducking = true;
      p.duckTimer = DUCK_HOLD;
      p.lastDuckAt = this.time;
    } else if (p.ducking) {
      p.duckTimer -= dt;
      p.lastDuckAt = this.time;
      if (p.duckTimer <= 0) p.ducking = false;
    }

    if (input.reach) {
      this.stats.reaches++;
      this.onEvent('Big stretch!', { move: 'reaches' });
      this._grabHighPickups();
    }
  }

  _movePlayer(dt) {
    const p = this.player;
    if (p.y > 0.001) p.lastAirborneAt = this.time;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    // Ease across lanes instead of snapping: the slide reads as a body shift.
    p.x += (p.lane - p.x) * Math.min(1, dt * 11);
  }

  _spawn(dt) {
    this._spawnScenery(dt);

    if (this.gatesEnabled && this.distance >= this.nextGateAt && !this.gate) {
      this._openGate();
      return;
    }
    if (this.wallsEnabled && this.distance >= this.nextWallAt) {
      this._spawnWall();
      return;
    }
    this.sinceSpawn += this.speed * dt;
    if (this.sinceSpawn < this.nextGap) return;
    this.sinceSpawn = 0;
    // Gaps shrink as the run speeds up, but never below a beatable reaction
    // window: at top speed this still leaves over a second between moves.
    this.nextGap = Math.max(15, 20 - this.distance * 0.004) + Math.random() * 5;

    // Warm-up: the first stretch is only single animals, flyers and fruit, so
    // the child meets one movement at a time before lanes come into it.
    const warmup = this.distance < 140;
    const roll = Math.random();
    if (warmup) {
      if (roll < 0.3) this._spawnBarrier(true);
      else if (roll < 0.55) this._spawnBar();
      else if (roll < 0.9) this._spawnCoins();
      else this._spawnShield();
      return;
    }
    if (roll < 0.26) this._spawnBarrier();
    else if (roll < 0.5) this._spawnBar();
    else if (roll < 0.72) this._spawnTrains();
    else if (roll < 0.92) this._spawnCoins();
    else this._spawnShield();
  }

  /**
   * A wall with a letter-shaped hole, which the child fits through by making
   * that letter with their body. It spawns at the far end of the track, so
   * there are several seconds to see it, hear it and get into the shape.
   */
  _spawnWall() {
    const letter = WALL_LETTERS[Math.floor(Math.random() * WALL_LETTERS.length)];
    this.walls.push({ letter, z: FAR, resolved: false, matched: false });
    this.nextWallAt += WALL_EVERY + Math.random() * 60;
    // Keep the lane clear so the child can concentrate on the shape.
    this.obstacles = this.obstacles.filter((o) => o.z < FAR - 14);
    this.sinceSpawn = -14;
    this.onEvent(`Make a ${letter}!`, { wall: letter });
  }

  /** Trees, buildings, cacti: whatever this zone has beside the track. */
  _spawnScenery(dt) {
    this.sinceProp += this.speed * dt;
    if (this.sinceProp < 9) return;
    this.sinceProp = 0;
    for (const side of [-1, 1]) {
      // Sparse and set well back: scenery should say where you are, not crowd
      // the lane the child is trying to read.
      if (Math.random() < 0.5) continue;
      const pool = this.theme.props;
      this.scenery.push({
        emoji: pool[Math.floor(Math.random() * pool.length)],
        x: side * (3.2 + Math.random() * 1.8),
        z: FAR + Math.random() * 8,
        scale: 0.55 + Math.random() * 0.5,
      });
    }
  }

  _makeObstacle(type, lane) {
    const pool = OBSTACLES[type].emojis;
    return { type, lane, z: FAR, emoji: pool[Math.floor(Math.random() * pool.length)] };
  }

  _spawnBarrier(single = false) {
    // An animal in one lane can be side-stepped, which is fine variety but
    // never actually asks for a jump. A full-width row leaves only one answer:
    // get both feet off the floor.
    if (Math.random() < 0.5) {
      for (const lane of LANES) this.obstacles.push(this._makeObstacle('barrier', lane));
      return;
    }
    const lane = pick(LANES);
    this.obstacles.push(this._makeObstacle('barrier', lane));
    if (!single && Math.random() < 0.35) {
      const other = pick(LANES.filter((l) => l !== lane));
      this.obstacles.push(this._makeObstacle('barrier', other));
    }
  }

  _spawnBar() {
    // Full width: the only way through is to get low.
    for (const lane of LANES) this.obstacles.push(this._makeObstacle('bar', lane));
  }

  _spawnTrains() {
    const free = pick(LANES);
    for (const lane of LANES) {
      if (lane === free) continue;
      if (Math.random() < 0.7) this.obstacles.push(this._makeObstacle('train', lane));
    }
    // Reward the side step with a fruit trail down the open lane.
    for (let i = 0; i < 4; i++) this.pickups.push(fruit(free, FAR + i * 1.6, 0.75));
  }

  _spawnCoins() {
    const lane = pick(LANES);
    const arc = Math.random() < 0.5;
    for (let i = 0; i < 6; i++) {
      // An arc sits high enough that the child has to jump through it.
      const y = arc ? 0.6 + Math.sin((i / 5) * Math.PI) * 1.0 : 0.75;
      this.pickups.push(fruit(lane, FAR + i * 1.5, y));
    }
  }

  _spawnShield() {
    this.pickups.push({ kind: 'shield', lane: pick(LANES), z: FAR, y: 2.0, spin: 0, emoji: '⭐' });
  }

  // ------------------------------------------------------------- yoga gates

  _openGate() {
    const shape = GATE_SHAPES[Math.floor(Math.random() * GATE_SHAPES.length)];
    this.gate = { shape, z: FAR * 0.45, arrived: false, progress: 0 };
    this.nextGateAt += GATE_EVERY;
    this.obstacles = this.obstacles.filter((o) => o.z < this.gate.z - 6);
    this.onEvent('Yoga time!', { gate: shape });
  }

  /** The archway glides in, then waits: the app drives the pose itself. */
  _updateGateVisual(dt) {
    const g = this.gate;
    if (g.arrived) return;
    g.z -= this.speed * dt * 0.8;
    if (g.z <= PLAYER_Z + 1.5) {
      g.z = PLAYER_Z + 1.5;
      g.arrived = true;
    }
  }

  setGateProgress(progress) {
    if (this.gate) this.gate.progress = progress;
  }

  /** Close a gate. `passed` awards the bonus; either way the run continues. */
  closeGate(passed) {
    if (!this.gate) return;
    const shape = this.gate.shape;
    if (passed) {
      this.stats.poses++;
      this.shield = 1;
      this.flash = 1;
      this.coins += 5;
      this.sfx.fanfare();
      this.onEvent('Beautiful pose!', { move: 'pose', shape });
      this._popup('+5', '#ffd166');
    } else {
      this.onEvent('Good try!', {});
    }
    this.gate = null;
    this.sinceSpawn = 0;
  }

  // ------------------------------------------------------------ world step

  _advanceWorld(dt) {
    const d = this.speed * dt;
    for (const o of this.obstacles) o.z -= d;
    for (const w of this.walls) w.z -= d;
    for (const p of this.scenery) p.z -= d;
    for (const p of this.pickups) { p.z -= d; p.spin += dt * 4; }
    this.walls = this.walls.filter((w) => w.z > -4);
    this.scenery = this.scenery.filter((p) => p.z > -4);
    this.obstacles = this.obstacles.filter((o) => o.z > -6);
    this.pickups = this.pickups.filter((p) => p.z > -6 && !p.taken);

    for (const s of this.particles) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
    }
    this.particles = this.particles.filter((s) => s.life > 0);

    for (const p of this.popups) { p.life -= dt; p.y -= dt * 60; }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  /** Overhead stretch sweeps up any star hanging within reach. */
  _grabHighPickups() {
    for (const p of this.pickups) {
      if (p.kind !== 'shield' || p.taken) continue;
      if (p.z > PLAYER_Z + 16 || p.z < PLAYER_Z - 2) continue;
      if (p.lane !== this.player.lane) continue;
      p.taken = true;
      this.shield = 1;
      this.flash = 1;
      this.sfx.shield();
      this.onEvent('Star shield!', {});
      this._burst(p, '#ffd166', 22);
    }
  }

  // -------------------------------------------------------------- collision

  /** Did the child do the right thing recently enough to count? */
  _forgiven(spec) {
    const p = this.player;
    if (spec.action === 'jump') {
      // Measured from when they landed, not from take-off: the jump itself
      // takes most of a second, and counting that against them would leave
      // almost no forgiveness at all.
      return p.y > 0.001 || this.time - p.lastAirborneAt < TOLERANCE.earlyJump;
    }
    if (spec.action === 'duck') {
      return p.ducking || this.time - p.lastDuckAt < TOLERANCE.earlyDuck;
    }
    return false;
  }

  _collide(dt) {
    const p = this.player;
    const headroom = p.ducking ? 0.62 : 1.25;   // player height, world units
    const feet = p.y;

    // A crash is never instant: the child gets a moment to still do the right
    // thing. This is the "too late" half of the timing tolerance.
    if (this.pendingCrash) {
      const pc = this.pendingCrash;
      pc.timer -= dt;
      if (this._forgiven(OBSTACLES[pc.obstacle.type])) {
        pc.obstacle.hit = true;
        this.pendingCrash = null;
        this.sfx.block();
        this.onEvent('Just made it!', {});
      } else if (pc.timer <= 0) {
        this.pendingCrash = null;
        this._gameOver();
        return;
      }
    }

    for (const o of this.obstacles) {
      if (o.hit) continue;
      const spec = OBSTACLES[o.type];
      const rel = o.z - PLAYER_Z;
      const near = rel - 0.45;
      const far = rel + spec.depth + 0.45;
      if (near > 0 || far < 0) continue;              // not level with the player yet
      if (Math.abs(o.lane - p.x) > 0.5) continue;     // in a different lane

      const clearsOver = feet >= spec.h1 - 0.12;                 // jumped it
      const clearsUnder = feet + headroom <= spec.h0 + 0.12;     // ducked under it
      if (clearsOver || clearsUnder || this._forgiven(spec)) {
        o.hit = true;                                 // counted as cleared
        this._addCombo();
        continue;
      }

      if (this.shield > 0) {
        o.hit = true;
        this.shield = 0;
        this.shake = 0.6;
        this.sfx.block();
        this.onEvent('Star saved you!', {});
        this._burst({ lane: o.lane, z: Math.max(o.z, PLAYER_Z), y: 0.9 }, '#4cc9f0', 18);
        continue;
      }

      if (!this.pendingCrash) this.pendingCrash = { obstacle: o, timer: TOLERANCE.late };
      return;
    }

    for (const q of this.pickups) {
      if (q.taken || q.kind !== 'coin') continue;
      if (Math.abs(q.z - PLAYER_Z) > 0.9) continue;
      if (Math.abs(q.lane - p.x) > 0.5) continue;
      const low = feet;
      const high = feet + headroom;
      if (q.y < low - 0.3 || q.y > high + 0.3) continue;
      q.taken = true;
      this.coins += this.multiplier;
      this._addCombo();
      this.sfx.coin();
      this._burst(q, '#ffd166', 8);
    }
  }

  /**
   * Decide each wall as it reaches the child. A wall is never fatal: missing
   * the shape costs the streak and the bonus, and the run carries on. Being
   * knocked back to the menu for a letter you could not make in time is how a
   * child decides the game hates them.
   */
  _resolveWalls(input) {
    for (const wall of this.walls) {
      if (wall.resolved) continue;
      const rel = wall.z - PLAYER_Z;
      // Judged over a window, not an instant, so an almost-there shape counts.
      if (rel > 1.6) {
        wall.matched = wall.matched || shapeSatisfies(input.shape, wall.letter);
        continue;
      }
      if (rel > -0.6) {
        if (shapeSatisfies(input.shape, wall.letter)) wall.matched = true;
        continue;
      }
      wall.resolved = true;
      if (wall.matched) {
        this.stats.letters++;
        this._addCombo();
        this.coins += 3 * this.multiplier;
        this.flash = 0.9;
        this.sfx.shield();
        this._popup('PERFECT!', '#7ddf9a');
        this.onEvent(`${wall.letter}! Perfect!`, { move: 'letters', letter: wall.letter });
        this._burst({ lane: 0, z: PLAYER_Z, y: 1.2 }, '#7ddf9a', 26);
      } else {
        this._breakCombo();
        this.shake = 0.5;
        this.sfx.block();
        this._popup('Missed!', '#f0a868');
        this.onEvent('Next time!', { wallMissed: wall.letter });
      }
    }
  }

  _gameOver() {
    this._breakCombo();
    this.running = false;
    this.over = true;
    this.shake = 1;
    this.sfx.crash();
    this.onEvent('Oops!', {});
    this.onEvent('__gameover__', {});
  }

  _burst(at, color, count) {
    const pos = this.project(at.lane, at.y ?? 0.8, Math.max(at.z, PLAYER_Z - 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 170;
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        life: 0.4 + Math.random() * 0.4, color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  _popup(text, color) {
    this.popups.push({ text, color, x: this.w / 2, y: this.h * 0.45, life: 1.2 });
  }

  // ---------------------------------------------------------------- render

  /** World (lane offset, height above ground, depth) -> screen pixels. */
  project(worldX, height, z) {
    const s = 1 / (1 + Math.max(z, -0.9) / DEPTH);
    return {
      x: this.w / 2 + worldX * this.unit * s,
      y: this.horizon + (this.groundY - this.horizon) * s - height * this.unit * s,
      s,
    };
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * 12;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    this._drawSky();
    this._drawTrack();

    // Painter's algorithm: everything sorted back to front.
    const items = [
      ...this.scenery.map((p) => ({ z: p.z, draw: () => this._drawScenery(p) })),
      ...this.obstacles.map((o) => ({ z: o.z, draw: () => this._drawObstacle(o) })),
      ...this.walls.map((w) => ({ z: w.z, draw: () => this._drawWall(w) })),
      ...this.pickups.filter((p) => !p.taken).map((p) => ({ z: p.z, draw: () => this._drawPickup(p) })),
      { z: PLAYER_Z, draw: () => this._drawPlayer() },
    ];
    if (this.gate) items.push({ z: this.gate.z, draw: () => this._drawGate() });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    this._drawParticles();
    this._drawPopups();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,209,102,${this.flash * 0.28})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }

  _drawSky() {
    const ctx = this.ctx;
    const theme = this.theme;
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.6, theme.sky[1]);
    sky.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.horizon + 40);

    this._drawSkyline(theme);

    ctx.fillStyle = theme.far;
    ctx.fillRect(0, this.horizon, this.w, this.h - this.horizon);
  }

  /**
   * The far parallax layer. It shifts opposite the player's lane, so a side
   * step reads as movement rather than the runner sliding on a fixed picture,
   * and its silhouette is what makes each zone recognisable at a glance.
   */
  _drawSkyline(theme) {
    const ctx = this.ctx;
    const span = this.w + 260;
    const shift = -this.player.x * this.w * 0.03 - (this.distance * 1.6) % span;
    const at = (i) => ((i * 96 + shift) % span) - 130;
    ctx.save();

    if (theme.skyline === 'stars') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 70; i++) {
        const x = ((i * 137 + shift * 0.3) % span) - 130;
        const y = ((i * 53) % Math.max(1, this.horizon - 10));
        const r = 1 + (i % 3) * 0.6;
        ctx.globalAlpha = 0.4 + ((i * 17) % 60) / 100;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalAlpha = 1;
    } else if (theme.skyline === 'trees' || theme.skyline === 'mountains') {
      const snow = theme.skyline === 'mountains';
      ctx.fillStyle = snow ? 'rgba(20,34,52,0.9)' : 'rgba(4,26,14,0.85)';
      for (let i = 0; i < 26; i++) {
        const w = 70 + ((i * 37) % 90);
        const h = (snow ? 60 : 40) + ((i * 53) % (snow ? 130 : 80));
        const x = at(i);
        ctx.beginPath();
        ctx.moveTo(x, this.horizon);
        ctx.lineTo(x + w / 2, this.horizon - h);
        ctx.lineTo(x + w, this.horizon);
        ctx.closePath();
        ctx.fill();
        if (snow) {
          ctx.fillStyle = 'rgba(230,244,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(x + w / 2 - w * 0.13, this.horizon - h * 0.72);
          ctx.lineTo(x + w / 2, this.horizon - h);
          ctx.lineTo(x + w / 2 + w * 0.13, this.horizon - h * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(20,34,52,0.9)';
        }
      }
    } else if (theme.skyline === 'dunes') {
      ctx.fillStyle = 'rgba(60,38,16,0.8)';
      for (let i = 0; i < 18; i++) {
        const w = 160 + ((i * 47) % 140);
        const h = 30 + ((i * 31) % 60);
        ctx.beginPath();
        ctx.ellipse(at(i) + w / 2, this.horizon, w / 2, h, 0, Math.PI, 0);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(8,18,32,0.75)';
      for (let i = 0; i < 26; i++) {
        const bw = 40 + ((i * 37) % 60);
        const bh = 26 + ((i * 53) % 90);
        ctx.fillRect(at(i), this.horizon - bh, bw, bh);
      }
    }
    ctx.restore();
  }

  /** Whatever grows or stands beside the track in this zone. */
  _drawScenery(prop) {
    if (prop.z > FAR + 8 || prop.z < PLAYER_Z - 2) return;
    const pos = this.project(prop.x, 0, prop.z);
    const size = Math.min(prop.scale * 0.9 * this.unit * pos.s, this.h * 0.2);
    this._emoji(prop.emoji, pos.x, pos.y - size * 0.45, size);
  }

  /**
   * A wall with a letter-shaped hole. The letter is drawn in the dark of the
   * far background with a bright rim, which reads as a hole cut through the
   * wall without needing a second canvas to composite one.
   */
  _drawWall(wall) {
    const ctx = this.ctx;
    const exit = PLAYER_Z - 1.2;
    if (wall.z > FAR + 6 || wall.z < exit) return;
    const alpha = Math.min(1, (wall.z - exit) / 1.2);
    const z = Math.max(wall.z, -0.8);
    const hit = wall.matched;

    const tl = this.project(-1.75, WALL.h1, z);
    const tr = this.project(1.75, WALL.h1, z);
    const br = this.project(1.75, WALL.h0, z);
    const bl = this.project(-1.75, WALL.h0, z);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hit ? '#2f9e5f' : '#8e5cf0';
    quad(ctx, tl, tr, br, bl);
    ctx.strokeStyle = hit ? '#7ddf9a' : '#c9a7ff';
    ctx.lineWidth = Math.max(2, 6 * tl.s);
    ctx.stroke();

    const centre = this.project(0, (WALL.h0 + WALL.h1) / 2, z);
    const size = Math.min(1.5 * this.unit * centre.s, this.h * 0.4);
    ctx.font = `bold ${Math.round(size)}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.theme.far;
    ctx.fillText(wall.letter, centre.x, centre.y);
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.strokeStyle = hit ? '#7ddf9a' : '#ffd166';
    ctx.strokeText(wall.letter, centre.x, centre.y);
    ctx.restore();
  }

  _drawTrack() {
    const ctx = this.ctx;
    const nearL = this.project(-1.6, 0, -2);
    const nearR = this.project(1.6, 0, -2);
    const farL = this.project(-1.6, 0, ROAD_FAR);
    const farR = this.project(1.6, 0, ROAD_FAR);

    // Ballast either side of the track, so the road does not float on a void.
    const groundL = this.project(-5.5, 0, -2);
    const groundR = this.project(5.5, 0, -2);
    const groundFL = this.project(-5.5, 0, ROAD_FAR);
    const groundFR = this.project(5.5, 0, ROAD_FAR);
    ctx.fillStyle = this.theme.ground;
    quad(ctx, groundL, groundFL, groundFR, groundR);

    const road = ctx.createLinearGradient(0, this.horizon, 0, this.h);
    road.addColorStop(0, this.theme.road[0]);
    road.addColorStop(1, this.theme.road[1]);
    ctx.fillStyle = road;
    quad(ctx, nearL, farL, farR, nearR);

    // Sleepers scrolling toward the camera give the sense of speed.
    const spacing = 3;
    const offset = this.distance % spacing;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let z = FAR; z > -1; z -= spacing) {
      const zz = z - offset;
      if (zz < -1) continue;
      quad(ctx,
        this.project(-1.6, 0, zz), this.project(1.6, 0, zz),
        this.project(1.6, 0, zz + 0.7), this.project(-1.6, 0, zz + 0.7));
    }

    // Distance haze: softens the point where the road meets the skyline.
    const haze = ctx.createLinearGradient(0, this.horizon - 10, 0, this.horizon + this.h * 0.14);
    haze.addColorStop(0, `${this.theme.sky[2]}99`);
    haze.addColorStop(1, `${this.theme.sky[2]}00`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, this.horizon - 10, this.w, this.h * 0.14 + 10);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (const x of [-0.5, 0.5]) {
      const n = this.project(x, 0, -2);
      const f = this.project(x, 0, ROAD_FAR);
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
    }
  }

  /**
   * Obstacles are drawn as a soft coloured block with the animal on the front.
   * The block carries the shape and the colour coding; the emoji carries the
   * charm. If a device has no emoji font, the block still reads correctly.
   */
  _drawObstacle(o) {
    const spec = OBSTACLES[o.type];
    // Stop drawing just after the runner passes, and fade out over the last
    // stretch: without this, an obstacle sliding toward the camera balloons to
    // fill the screen.
    const exit = PLAYER_Z - 1.5;
    if (o.z > FAR + 4 || o.z < exit) return;
    const ctx = this.ctx;
    const alpha = Math.min(1, (o.z - exit) / 1.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    const dim = o.hit;
    this._box(o.lane, o.z, spec, dim ? '#7b8794' : spec.face, dim ? '#9aa5b1' : spec.top);

    const mid = (spec.h0 + spec.h1) / 2;
    const pos = this.project(o.lane, mid, o.z);
    // Sized to the lane, not to the obstacle's height: a two-unit-tall animal
    // drawn at full height would spill across its neighbours.
    const size = Math.min(
      spec.w * 1.05 * this.unit * pos.s,
      (spec.h1 - spec.h0) * 1.15 * this.unit * pos.s,
      this.h * 0.32,
    );
    this._emoji(o.emoji, pos.x, pos.y, size);
    ctx.restore();
  }

  _emoji(glyph, x, y, size) {
    if (!glyph || size < 6) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y);
    ctx.restore();
  }

  _box(lane, z, spec, face, top) {
    const ctx = this.ctx;
    const zn = Math.max(z, -0.85);
    const zf = Math.max(z + spec.depth, -0.8);
    const hw = spec.w / 2;

    const fTL = this.project(lane - hw, spec.h1, zn);
    const fTR = this.project(lane + hw, spec.h1, zn);
    const fBR = this.project(lane + hw, spec.h0, zn);
    const fBL = this.project(lane - hw, spec.h0, zn);
    const bTL = this.project(lane - hw, spec.h1, zf);
    const bTR = this.project(lane + hw, spec.h1, zf);

    ctx.fillStyle = shade(face, -0.35);
    quad(ctx, bTL, bTR, this.project(lane + hw, spec.h0, zf), this.project(lane - hw, spec.h0, zf));
    ctx.fillStyle = top;
    quad(ctx, bTL, bTR, fTR, fTL);
    ctx.fillStyle = face;
    quad(ctx, fTL, fTR, fBR, fBL);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  _drawPickup(p) {
    if (p.z > FAR + 4 || p.z < PLAYER_Z - 1.5) return;
    const pos = this.project(p.lane, p.y, Math.max(p.z, -0.8));
    const bob = Math.sin(p.spin * 1.6) * 4 * pos.s;
    if (p.kind === 'coin') {
      this._emoji(p.emoji, pos.x, pos.y + bob, 0.42 * this.unit * pos.s);
    } else {
      const ctx = this.ctx;
      const r = Math.max(3, 0.34 * this.unit * pos.s);
      ctx.save();
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = r;
      this._emoji(p.emoji, pos.x, pos.y + bob, r * 2);
      ctx.restore();
      // Prompt: this one is collected by stretching, not by running into it.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(10, r * 0.9)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('↑', pos.x, pos.y - r * 1.6);
    }
  }

  _drawGate() {
    const ctx = this.ctx;
    const g = this.gate;
    const z = Math.max(g.z, -0.8);
    const postW = 0.22;
    for (const side of [-1, 1]) {
      const x = side * 1.5;
      const bottom = this.project(x, 0, z);
      const top = this.project(x, 2.4, z);
      const w = Math.max(3, postW * this.unit * bottom.s);
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(bottom.x - w / 2, top.y, w, bottom.y - top.y);
    }
    const lintelL = this.project(-1.6, 2.4, z);
    const lintelR = this.project(1.6, 2.4, z);
    const thickness = Math.max(4, 0.25 * this.unit * lintelL.s);
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(lintelL.x, lintelL.y - thickness, lintelR.x - lintelL.x, thickness);

    const centre = this.project(0, 1.5, z);
    this._emoji(shapeEmoji(g.shape), centre.x, centre.y, 0.9 * this.unit * centre.s);

    if (g.arrived && g.progress > 0) {
      const barW = this.w * 0.4;
      const barH = 14;
      const x = (this.w - barW) / 2;
      const y = centre.y + 0.75 * this.unit * centre.s;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      roundRect(ctx, x, y, barW, barH, barH / 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      roundRect(ctx, x, y, barW * Math.min(1, g.progress), barH, barH / 2);
      ctx.fill();
    }
  }

  _drawPlayer() {
    const ctx = this.ctx;
    const p = this.player;
    const duck = p.ducking;
    const bodyH = duck ? 0.55 : 1.1;
    const base = this.project(p.x, p.y, PLAYER_Z);
    const top = this.project(p.x, p.y + bodyH, PLAYER_Z);
    const scale = base.s * this.unit;
    const width = (duck ? 0.5 : 0.36) * scale;
    const height = base.y - top.y;

    ctx.save();
    // Contact shadow keeps the height of a jump readable.
    const shadowY = this.project(p.x, 0, PLAYER_Z).y;
    const shrink = 1 / (1 + p.y * 0.8);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * shrink})`;
    ctx.beginPath();
    ctx.ellipse(base.x, shadowY, width * 0.75 * shrink, width * 0.28 * shrink, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.shield > 0) {
      ctx.strokeStyle = 'rgba(76,201,240,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(base.x, base.y - height * 0.55, width * 1.35, height * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const swing = p.y > 0.01 ? 0.9 : Math.sin(this.runPhase) * 0.9;
    const legLen = height * (duck ? 0.3 : 0.42);

    ctx.strokeStyle = '#123';
    ctx.lineWidth = Math.max(3, width * 0.32);
    ctx.lineCap = 'round';
    for (const dir of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(base.x, base.y - legLen);
      ctx.lineTo(base.x + dir * swing * width * 0.8, base.y);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffd166';
    roundRect(ctx, base.x - width / 2, base.y - height, width, height - legLen * 0.2, width * 0.35);
    ctx.fill();

    // Arms go overhead on a jump, which mirrors what the child just did.
    ctx.strokeStyle = '#e0a832';
    ctx.lineWidth = Math.max(3, width * 0.28);
    const shoulderY = base.y - height * 0.78;
    for (const dir of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(base.x + dir * width * 0.35, shoulderY);
      if (p.y > 0.01) {
        ctx.lineTo(base.x + dir * width * 0.9, shoulderY - height * 0.42);
      } else {
        // Each arm stays on its own side and swings a little, rather than
        // crossing the body.
        ctx.lineTo(base.x + dir * width * (0.55 - swing * 0.25), shoulderY + height * 0.3);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(base.x, base.y - height - width * 0.22, width * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const s of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  _drawPopups() {
    const ctx = this.ctx;
    for (const p of this.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.font = `bold ${Math.round(this.h * 0.06)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ helpers

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fruit(lane, z, y) {
  return {
    kind: 'coin', lane, z, y,
    spin: Math.random() * 6,
    emoji: FRUIT[Math.floor(Math.random() * FRUIT.length)],
  };
}

function shapeEmoji(shape) {
  return { cow: '\u{1F404}', cat: '\u{1F431}', cobra: '\u{1F40D}', star: '⭐' }[shape] || '\u{1F9D8}';
}

function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
