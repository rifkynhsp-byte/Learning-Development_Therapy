/** Minimal DOM stubs so the game and tracker modules run under plain Node. */

const noop = () => {};

export function stubCanvas(width = 1280, height = 720) {
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (prop === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set() { return true; },
  });
  return { clientWidth: width, clientHeight: height, width: 0, height: 0, getContext: () => ctx };
}

export function stubWindow(width = 1280, height = 720) {
  globalThis.window = { devicePixelRatio: 1, addEventListener: noop, innerWidth: width, innerHeight: height };
}

export const silentSfx = new Proxy({}, { get: () => noop });

/** A generic standing child, in MediaPipe's normalised landmark space. */
export function body({ dy = 0, dx = 0, wristY = 0.60, kneeDy = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (i, x, y) => { lm[i] = { x: x + dx, y: y + dy, visibility: 1 }; };
  set(0, 0.50, 0.28);                             // nose
  set(11, 0.45, 0.35); set(12, 0.55, 0.35);       // shoulders
  set(15, 0.44, wristY); set(16, 0.56, wristY);   // wrists
  set(23, 0.46, 0.55); set(24, 0.54, 0.55);       // hips
  lm[25] = { x: 0.46 + dx, y: 0.75 + dy + kneeDy, visibility: 1 };
  lm[26] = { x: 0.54 + dx, y: 0.75 + dy + kneeDy, visibility: 1 };
  set(27, 0.46, 0.95); set(28, 0.54, 0.95);       // ankles
  return lm;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
