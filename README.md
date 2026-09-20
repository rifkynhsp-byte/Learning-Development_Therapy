# Sensory Runner

A motion-tracked endless runner — Subway Surfers style — that a child plays with
their whole body instead of a controller. It runs entirely in the browser on an
iPad, laptop or Smart TV, needs no install and no special hardware beyond a
webcam, and after the first load it works offline.

Every movement the game asks for is an occupational-therapy movement:

| In the game | The child does | What it targets |
| --- | --- | --- |
| 🐊 🐢 🐸 on the ground | **Jumps** with both feet | Vestibular input, lower-body heavy work |
| 🦇 🐝 🦅 flying at head height | **Squats** low and holds | Core stability, sustained leg strength (STNR) |
| 🐯 🐘 🦏 filling a lane | **Steps sideways** into the open lane | Weight shift, bilateral coordination, crossing the midline (ATNR) |
| ⭐ hanging high | **Stretches both arms overhead** | Upper-body extension, midline awareness |
| Yoga gate | **Holds Cow, Cat, Cobra or Star** | Reflex integration: quadruped work (STNR), spinal extension, wide-body Star (spinal Galant) |
| Rest screen | Follows the breathing circle | Coming back down after exertion |

A child who cannot yet jump with both feet can drive the same mechanic by
**marching** — lifting one knee high counts as a jump.

## Playing it

1. Open the site on a device with a camera.
2. Choose a speed, then tap **Start with camera** and allow camera access.
3. The **practice room** opens. It waits until the whole child is in frame,
   takes a three-second standing calibration, then asks for one movement at a
   time — jump, duck, step right, step left, stretch, Cow, Cobra — speaking each
   instruction out loud and ticking it off when it sees it.
4. When the checklist is done, a countdown starts the run.

No drill can trap the child: each one times out after 18 seconds, says something
encouraging, and moves on. The whole practice room can be skipped with a button,
or turned off in the menu.

**Play with keyboard instead** skips the camera entirely: arrow keys or WASD to
move and duck, space to jump, shift to stretch, Enter to pass a yoga gate.
Useful for showing a child what the game wants before they try it with their
body, and for testing.

Nothing is recorded and nothing is uploaded. The camera frames are read into
the tracker and discarded; the only thing that ever leaves the device is the
one-off download of the tracking model.

### Speed

Three settings in the menu, remembered between sessions:

| Setting | Pace | Time between obstacles |
| --- | --- | --- |
| **Slow** | half of Medium | roughly 2× longer |
| **Medium** | the default | the baseline |
| **Fast** | double Medium | roughly half |

Start on Slow. Medium is already brisk for a five-year-old who is learning what
the movements do.

### On a television

Smart TV browsers generally cannot run the tracker. Run the game on an iPad or
laptop and mirror the screen to the TV over AirPlay or Chromecast — the tracking
and physics still run locally, so the mirroring lag affects only what is
displayed, not the timing of the game. A 5 GHz Wi-Fi network keeps that lag
small.

## Statistics

Every run counts jumps, squats, side steps, stretches, poses and fruit, and the
**Progress** screen totals them for today and for all time, with a list of
recent sessions. Everything is stored on the device only, and can be cleared
from that screen.

The calorie figure is an **estimate**. It uses the standard MET equation —
`kcal/min = MET × 3.5 × kg ÷ 200` — with the MET value inferred from how often
the child actually moved rather than from how long the game was open, so a
child standing in front of the camera is credited with close to nothing. The
default profile is a 5-year-old weighing 18 kg; change `CHILD` at the top of
`js/stats.js` for a different child. MET values for children are themselves
approximations and young children move less economically than the adults these
equations were built from, so the number is useful for comparing one session
with another, not as a measurement.

## Deploying it

The site is static files with no build step.

* **GitHub Pages**: enable Pages with *GitHub Actions* as the source. Pushing to
  `main` runs `.github/workflows/pages.yml`, which publishes the repository as
  is. Pages serves over HTTPS, which browsers require before they will hand out
  camera access.
* **Locally**: `npm run serve` and open <http://localhost:8080>. `localhost` is
  treated as a secure origin, so the camera works there too. Opening
  `index.html` as a `file://` URL will not work.

Installing it to the home screen (Safari: Share → Add to Home Screen) gives a
fullscreen, chrome-free session, which is one less thing for a distractible
child to tap out of.

## How it works

```
js/pose.js      camera + MediaPipe landmarks -> jump, duck, lane, stretch
js/shapes.js    held body shapes -> Cow, Cat, Cobra, Star
js/tutorial.js  the practice room: framing, calibration, one drill at a time
js/game.js      three-lane runner, pseudo-3D projection on a 2D canvas
js/coach.js     spoken instructions and praise, via the browser's own voice
js/stats.js     session counts, the exercise estimate, on-device history
js/audio.js     sound effects synthesised at runtime, no audio files
js/app.js       screen flow, keyboard fallback, wake lock, service worker
sw.js           offline cache for the app shell, the tracker and the model
```

**Tracking.** MediaPipe's `pose_landmarker_lite` model runs on-device through
WebAssembly, in `VIDEO` mode so it keeps temporal state between frames and
stays steady during fast movement. It is loaded from a CDN on first run and
then cached by the service worker.

**Gestures.** The three-second calibration records where the child's hips,
shoulders and knees sit while standing, and how long their torso is. Every
threshold afterwards is expressed in torso lengths, so the same numbers work for
a child standing one metre from a laptop or three metres from a TV, and for a
different child entirely. Squats and lanes use hysteresis so a wobble cannot
make them flicker. The image is mirrored once, in `_measure`, so a step to the
child's right moves the runner right on screen.

A **jump** can be earned three ways, because a small child's hop off carpet
barely moves their hips: enough height, enough upward speed, or one knee lifted
high enough that marching on the spot counts.

**Floor poses** are judged from the tilt of the torso and where the hips sit
relative to the lowest thing in frame. Cat and Cow are told apart at the head,
which the model tracks far more reliably than the curve of a small child's
spine, and a neutral table top is accepted for either — getting onto hands and
knees is most of the work.

**Timing tolerance.** A crash is never instant. Jumping up to 0.75 s before an
obstacle still counts, and so does jumping up to 0.3 s after contact, because
the crash is deferred for that long before it becomes final. The same applies to
squats. The point is that the child moved.

**Difficulty.** Speed is capped, gaps between obstacles never fall below roughly
a second at top speed, the jump arc is floaty, and the first stretch of every
run is a warm-up with one movement at a time and no lane changes.

**Screen sleep.** No one touches the screen during a run, so tablets dim and
kill the tracking loop. The app holds a `screen` wake lock for the session and
re-acquires it when the tab becomes visible again.

## Tuning it

Three places hold every number worth adjusting:

* `TUNING` in `js/pose.js` — how big a movement has to be before it counts.
  These are set low on purpose: a missed jump is far worse than an extra one,
  because the child tried and the game ignored them. Raise `jumpRise` only if
  small bounces trigger jumps by accident.
* `TOLERANCE` and the constants at the top of `js/game.js` — timing forgiveness,
  speed presets, jump arc, obstacle sizes, and the spawn mix in `_spawn`.
* `CHILD` in `js/stats.js` — age and weight for the exercise estimate.

After changing any of them, run the tests: they check that the course stays
beatable, that each obstacle type still forces the movement it is meant to, that
early and late movements are still forgiven, and that the practice room can
never dead-end.

```
npm test
```

## Notes

This is a movement game built around one child's occupational-therapy goals. It
is not a medical device, not a diagnostic tool, and not a substitute for advice
from a therapist.
