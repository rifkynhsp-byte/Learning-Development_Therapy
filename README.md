# Sensory Runner

A motion-tracked endless runner — Subway Surfers style — that a child plays with
their whole body instead of a controller. It runs entirely in the browser on an
iPad, laptop or Smart TV, needs no install and no special hardware beyond a
webcam, and after the first load it works offline.

Every movement the game asks for is an occupational-therapy movement:

| In the game | The child does | What it targets |
| --- | --- | --- |
| Red barrier row | **Jumps** with both feet | Vestibular input, lower-body heavy work |
| Low orange bar | **Squats** low and holds | Core stability, sustained leg strength (STNR) |
| Blue train | **Steps sideways** into the open lane | Weight shift, bilateral coordination, crossing the midline (ATNR) |
| Blue shield | **Stretches both arms overhead** | Upper-body extension, midline awareness |
| Rest screen | Follows the breathing circle | Coming back down after exertion |

A child who cannot yet jump with both feet can drive the same mechanic by
**marching** — lifting one knee high counts as a jump.

## Playing it

1. Open the site on a device with a camera.
2. Tap **Start with camera** and allow camera access.
3. Stand back 2–3 m so the whole body fits in the small preview in the corner.
4. Hold still for the three-second countdown — that is the calibration, and
   everything afterwards is measured against it.
5. Run.

**Play with keyboard instead** skips the camera entirely: arrow keys or WASD to
move and duck, space to jump, shift to stretch. Useful for showing a child what
the game wants before they try it with their body, and for testing.

Nothing is recorded and nothing is uploaded. The camera frames are read into
the tracker and discarded; the only thing that ever leaves the device is the
one-off download of the tracking model.

### On a television

Smart TV browsers generally cannot run the tracker. Run the game on an iPad or
laptop and mirror the screen to the TV over AirPlay or Chromecast — the tracking
and physics still run locally, so the mirroring lag affects only what is
displayed, not the timing of the game. A 5 GHz Wi-Fi network keeps that lag
small.

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
js/pose.js    camera + MediaPipe pose landmarks -> four gestures
js/game.js    three-lane runner, pseudo-3D projection on a 2D canvas
js/audio.js   sound effects synthesised at runtime, no audio files
js/app.js     screen flow, keyboard fallback, wake lock, service worker
sw.js         offline cache for the app shell, the tracker and the model
```

**Tracking.** MediaPipe's `pose_landmarker_lite` model runs on-device through
WebAssembly, in `VIDEO` mode so it keeps temporal state between frames and
stays steady during fast movement. It is loaded from a CDN on first run and
then cached by the service worker.

**Gestures.** The three-second calibration records where the child's hips,
shoulders and knees sit while standing, and how long their torso is. Every
threshold afterwards is expressed in torso lengths, so the same numbers work for
a child standing one metre from a laptop or three metres from a TV, and for a
different child entirely. Hips rising above the baseline is a jump; hips
dropping below it is a squat; the shoulder midpoint travelling sideways picks a
lane; both wrists above the shoulders is a stretch. Squats and lanes use
hysteresis so a wobble cannot make them flicker.

The image is mirrored once, in `_measure`, so a step to the child's right moves
the runner right on screen.

**Difficulty.** Deliberately gentle. Speed is capped, gaps between obstacles
never fall below roughly a second at top speed, the jump arc is floaty enough to
absorb an early take-off plus tracking latency, and the first stretch of every
run is a warm-up with one movement at a time and no lane changes.

**Screen sleep.** No one touches the screen during a run, so tablets dim and
kill the tracking loop. The app holds a `screen` wake lock for the session and
re-acquires it when the tab becomes visible again.

## Tuning it

Two places hold every number worth adjusting:

* `TUNING` in `js/pose.js` — how big a movement has to be before it counts.
  Raise `jumpRise` if small bounces trigger jumps; lower `laneEnter` if the
  child cannot travel far enough sideways; raise `duckEnter` (toward zero) if
  squatting all the way down is too hard.
* The constants at the top of `js/game.js` — speed, jump arc, obstacle sizes,
  and the spawn mix in `_spawn`.

After changing either, run the tests: they check that the course stays beatable
and that each obstacle type still forces the movement it is meant to.

```
npm test
```

## Notes

This is a movement game built around one child's occupational-therapy goals. It
is not a medical device, not a diagnostic tool, and not a substitute for advice
from a therapist.
