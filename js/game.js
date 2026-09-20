/**
 * Three-lane endless runner, Subway-Surfers style, rendered with a simple
 * pseudo-3D projection on a 2D canvas (no engine, no asset downloads).
 *
 * Every obstacle type demands one specific whole-body movement:
 *   barrier -> jump      (vestibular input, lower-body heavy work)
 *   low bar -> squat     (core stability, sustained leg strength)
 *   train   -> side step (weight shift, bilateral coordination)
 *   shield  -> stretch   (overhead extension, crossing the midline)
 */

const LANES = [-1, 0, 1];
const DEPTH = 26;          // perspective falloff constant (higher = flatter)
const PLAYER_Z = 3.5;      // the runner sits ahead of the camera, not on it,
                           // so there is visible road under their feet
const FAR = 58;            // spawn distance, in world units
const ROAD_FAR = 260;      // the road itself is drawn well past that, so it
                           // converges into the horizon instead of stopping short
// A floatier arc than a grown-up runner would use: it widens the window in
// which the child is above a barrier to roughly 0.65 s, which absorbs both a
// slightly early take-off and the tracking latency before it.
const GRAVITY = 18;        // world units / s^2
const JUMP_V = 6.6;        // initial upward velocity
const DUCK_HOLD = 0.55;    // min seconds a duck stays latched

const OBSTACLES = {
  barrier: { h0: 0, h1: 0.62, w: 0.78, depth: 0.5, face: '#ef476f', top: '#ff7d9c' },
  bar:     { h0: 0.92, h1: 1.35, w: 0.95, depth: 0.5, face: '#f78c6b', top: '#ffb59b' },
  train:   { h0: 0, h1: 2.0, w: 0.86, depth: 2.6, face: '#3a86ff', top: '#7fb0ff' },
};

export class RunnerGame {
  constructor(canvas, sfx, onEvent = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.onEvent = onEvent;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.reset();
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
    this.distance = 0;
    this.coins = 0;
    this.speed = 9;
    this.obstacles = [];
    this.pickups = [];
    this.particles = [];
    this.sinceSpawn = 0;
    this.nextGap = 14;
    this.shield = 0;
    this.runPhase = 0;
    this.shake = 0;
    this.flash = 0;
    this.player = { lane: 0, x: 0, y: 0, vy: 0, ducking: false, duckTimer: 0 };
    this.stats = { jumps: 0, ducks: 0, lanes: 0, reaches: 0 };
  }

  start() {
    this.reset();
    this.running = true;
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    dt = Math.min(dt, 0.05); // a backgrounded tab must not teleport the player
    if (!this.running) { this.render(); return; }

    // Deliberately gentle ramp: the limit here is a five-year-old's reaction
    // time plus a few frames of tracking latency, not screen speed.
    this.speed = Math.min(15, 8 + this.distance * 0.007);
    this.distance += this.speed * dt;
    this.runPhase += dt * (this.speed * 0.9);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 3);

    this._applyInput(dt, input);
    this._movePlayer(dt);
    this._spawn(dt);
    this._advanceWorld(dt);
    this._collide();
    this.render();
  }

  _applyInput(dt, input) {
    const p = this.player;

    if (input.lane !== p.lane) {
      p.lane = input.lane;
      this.stats.lanes++;
      this.sfx.lane();
      this.onEvent(input.lane < 0 ? 'Left!' : input.lane > 0 ? 'Right!' : 'Middle');
    }

    if (input.jump && p.y <= 0.001) {
      p.vy = JUMP_V;
      p.ducking = false;
      p.duckTimer = 0;
      this.stats.jumps++;
      this.sfx.jump();
      this.onEvent('Jump!');
    }

    // A squat is held as long as the child stays low, but latches briefly so a
    // fast bob still carries them under the bar.
    if (input.ducking && p.y <= 0.001) {
      if (!p.ducking) {
        this.stats.ducks++;
        this.sfx.duck();
        this.onEvent('Duck!');
      }
      p.ducking = true;
      p.duckTimer = DUCK_HOLD;
    } else if (p.ducking) {
      p.duckTimer -= dt;
      if (p.duckTimer <= 0) p.ducking = false;
    }

    if (input.reach) {
      this.stats.reaches++;
      this.onEvent('Big stretch!');
      this._grabHighPickups();
    }
  }

  _movePlayer(dt) {
    const p = this.player;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    // Ease across lanes instead of snapping: the slide reads as a body shift.
    p.x += (p.lane - p.x) * Math.min(1, dt * 11);
  }

  _spawn(dt) {
    this.sinceSpawn += this.speed * dt;
    if (this.sinceSpawn < this.nextGap) return;
    this.sinceSpawn = 0;
    // Gaps shrink as the run speeds up, but never below a beatable reaction
    // window: at top speed this still leaves over a second between moves.
    this.nextGap = Math.max(15, 20 - this.distance * 0.004) + Math.random() * 5;

    // Warm-up: the first stretch is only single barriers, bars and coins, so
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

  _spawnBarrier(single = false) {
    // A barrier in one lane can be side-stepped, which is fine variety but
    // never actually asks for a jump. A full-width row leaves only one answer:
    // get both feet off the floor.
    if (Math.random() < 0.5) {
      for (const lane of LANES) this.obstacles.push({ type: 'barrier', lane, z: FAR });
      return;
    }
    const lane = pick(LANES);
    this.obstacles.push({ type: 'barrier', lane, z: FAR });
    if (!single && Math.random() < 0.35) {
      const other = pick(LANES.filter((l) => l !== lane));
      this.obstacles.push({ type: 'barrier', lane: other, z: FAR });
    }
  }

  _spawnBar() {
    // Full-width bar: the only way through is to get low.
    for (const lane of LANES) this.obstacles.push({ type: 'bar', lane, z: FAR });
  }

  _spawnTrains() {
    const free = pick(LANES);
    for (const lane of LANES) {
      if (lane === free) continue;
      if (Math.random() < 0.7) this.obstacles.push({ type: 'train', lane, z: FAR });
    }
    // Reward the side step with a coin trail down the open lane.
    for (let i = 0; i < 4; i++) {
      this.pickups.push({ kind: 'coin', lane: free, z: FAR + i * 1.6, y: 0.75, spin: Math.random() * 6 });
    }
  }

  _spawnCoins() {
    const lane = pick(LANES);
    const arc = Math.random() < 0.5;
    for (let i = 0; i < 6; i++) {
      // An arc sits high enough that the child has to jump through it.
      const y = arc ? 0.6 + Math.sin((i / 5) * Math.PI) * 1.1 : 0.75;
      this.pickups.push({ kind: 'coin', lane, z: FAR + i * 1.5, y, spin: Math.random() * 6 });
    }
  }

  _spawnShield() {
    this.pickups.push({ kind: 'shield', lane: pick(LANES), z: FAR, y: 2.1, spin: 0 });
  }

  _advanceWorld(dt) {
    const d = this.speed * dt;
    for (const o of this.obstacles) o.z -= d;
    for (const p of this.pickups) { p.z -= d; p.spin += dt * 4; }
    this.obstacles = this.obstacles.filter((o) => o.z > -6);
    this.pickups = this.pickups.filter((p) => p.z > -6 && !p.taken);

    for (const s of this.particles) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
    }
    this.particles = this.particles.filter((s) => s.life > 0);
  }

  /** Overhead stretch sweeps up any shield hanging within reach. */
  _grabHighPickups() {
    for (const p of this.pickups) {
      if (p.kind !== 'shield' || p.taken) continue;
      if (p.z > PLAYER_Z + 16 || p.z < PLAYER_Z - 2) continue;
      if (p.lane !== this.player.lane) continue;
      p.taken = true;
      this.shield = 1;
      this.flash = 1;
      this.sfx.shield();
      this.onEvent('Shield!');
      this._burst(p, '#ffd166', 22);
    }
  }

  _collide() {
    const p = this.player;
    const headroom = p.ducking ? 0.62 : 1.25;   // player height, world units
    const feet = p.y;

    for (const o of this.obstacles) {
      if (o.hit) continue;
      const spec = OBSTACLES[o.type];
      const rel = o.z - PLAYER_Z;
      const near = rel - 0.45;
      const far = rel + spec.depth + 0.45;
      if (near > 0 || far < 0) continue;              // not level with the player yet
      if (Math.abs(o.lane - p.x) > 0.5) continue;    // in a different lane

      const clearsOver = feet >= spec.h1 - 0.1;                 // jumped it
      const clearsUnder = feet + headroom <= spec.h0 + 0.1;     // ducked under it
      if (clearsOver || clearsUnder) continue;

      o.hit = true;
      if (this.shield > 0) {
        this.shield = 0;
        this.shake = 0.6;
        this.sfx.block();
        this.onEvent('Shield saved you!');
        this._burst({ lane: o.lane, z: Math.max(o.z, PLAYER_Z), y: 0.9 }, '#4cc9f0', 18);
        continue;
      }
      this._gameOver();
      return;
    }

    for (const q of this.pickups) {
      if (q.taken || q.kind !== 'coin') continue;
      if (Math.abs(q.z - PLAYER_Z) > 0.9) continue;
      if (Math.abs(q.lane - p.x) > 0.5) continue;
      const low = feet;
      const high = feet + headroom;
      if (q.y < low - 0.25 || q.y > high + 0.25) continue;
      q.taken = true;
      this.coins++;
      this.sfx.coin();
      this._burst(q, '#ffd166', 8);
    }
  }

  _gameOver() {
    this.running = false;
    this.over = true;
    this.shake = 1;
    this.sfx.crash();
    this.onEvent('Oops!');
    this.onEvent('__gameover__');
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
      ...this.obstacles.map((o) => ({ z: o.z, draw: () => this._drawObstacle(o) })),
      ...this.pickups.filter((p) => !p.taken).map((p) => ({ z: p.z, draw: () => this._drawPickup(p) })),
      { z: PLAYER_Z, draw: () => this._drawPlayer() },
    ].sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    this._drawParticles();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,209,102,${this.flash * 0.28})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }

  _drawSky() {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
    sky.addColorStop(0, '#12263f');
    sky.addColorStop(0.6, '#1b4965');
    sky.addColorStop(1, '#5fa8d3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.horizon + 40);

    // Parallax skyline: shifts opposite the player's lane so a side step reads.
    const shift = -this.player.x * this.w * 0.03 - (this.distance * 1.6) % (this.w + 240);
    ctx.fillStyle = 'rgba(8,18,32,0.75)';
    for (let i = 0; i < 26; i++) {
      const bw = 40 + ((i * 37) % 60);
      const bh = 26 + ((i * 53) % 90);
      const bx = ((i * 96 + shift) % (this.w + 240)) - 120;
      ctx.fillRect(bx, this.horizon - bh, bw, bh);
    }
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, this.horizon, this.w, this.h - this.horizon);
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
    ctx.fillStyle = '#16222f';
    quad(ctx, groundL, groundFL, groundFR, groundR);

    const road = ctx.createLinearGradient(0, this.horizon, 0, this.h);
    road.addColorStop(0, '#20303f');
    road.addColorStop(1, '#2f4457');
    ctx.fillStyle = road;
    ctx.beginPath();
    ctx.moveTo(nearL.x, nearL.y);
    ctx.lineTo(farL.x, farL.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.closePath();
    ctx.fill();

    // Sleepers scrolling toward the camera give the sense of speed.
    const spacing = 3;
    const offset = this.distance % spacing;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let z = FAR; z > -1; z -= spacing) {
      const zz = z - offset;
      if (zz < -1) continue;
      const a = this.project(-1.6, 0, zz);
      const b = this.project(1.6, 0, zz);
      const c = this.project(1.6, 0, zz + 0.7);
      const d = this.project(-1.6, 0, zz + 0.7);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }

    // Distance haze: softens the point where the road meets the skyline.
    const haze = ctx.createLinearGradient(0, this.horizon - 10, 0, this.horizon + this.h * 0.14);
    haze.addColorStop(0, 'rgba(95,168,211,0.55)');
    haze.addColorStop(1, 'rgba(95,168,211,0)');
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

  _drawObstacle(o) {
    const spec = OBSTACLES[o.type];
    this._box(o.lane, o.z, spec, o.hit ? '#7b8794' : spec.face, o.hit ? '#9aa5b1' : spec.top);
    if (o.type === 'barrier') {
      // Hazard stripes double as a form-constancy cue: same shape, any distance.
      const a = this.project(o.lane - spec.w / 2, spec.h1 * 0.55, o.z);
      const b = this.project(o.lane + spec.w / 2, spec.h1 * 0.55, o.z);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      this.ctx.lineWidth = Math.max(2, 10 * a.s);
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
  }

  _box(lane, z, spec, face, top) {
    const ctx = this.ctx;
    if (z > FAR + 4 || z < -5) return;
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
    const ctx = this.ctx;
    if (p.z > FAR + 4 || p.z < -4) return;
    const pos = this.project(p.lane, p.y, Math.max(p.z, -0.8));
    if (p.kind === 'coin') {
      const r = Math.max(2, 0.17 * this.unit * pos.s);
      const squash = Math.abs(Math.cos(p.spin)); // cheap spin, no sprite needed
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, Math.max(1, r * squash), r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c99a20';
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.stroke();
    } else {
      const r = Math.max(3, 0.32 * this.unit * pos.s);
      const bob = Math.sin(p.spin * 1.6) * r * 0.25;
      ctx.save();
      ctx.translate(pos.x, pos.y + bob);
      ctx.fillStyle = '#4cc9f0';
      ctx.shadowColor = '#4cc9f0';
      ctx.shadowBlur = r;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, -r * 0.4);
      ctx.lineTo(r * 0.8, r * 0.35);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, r * 0.35);
      ctx.lineTo(-r * 0.8, -r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Arrow prompt: this one is collected by stretching, not by running into it.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(9, r * 0.8)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('↑', pos.x, pos.y - r * 1.5);
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

    // Arms go overhead on a stretch, which mirrors what the child just did.
    ctx.strokeStyle = '#e0a832';
    ctx.lineWidth = Math.max(3, width * 0.28);
    const shoulderY = base.y - height * 0.78;
    for (const dir of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(base.x + dir * width * 0.35, shoulderY);
      if (p.y > 0.01) ctx.lineTo(base.x + dir * width * 0.9, shoulderY - height * 0.42);
      else ctx.lineTo(base.x + dir * -swing * width * 0.7, shoulderY + height * 0.3);
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
}

// ------------------------------------------------------------------ helpers

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
