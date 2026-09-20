/**
 * The spoken half of the game.
 *
 * A five-year-old who is two metres back from the screen and mid-movement is
 * not reading instructions, so every prompt is also said out loud through the
 * browser's built-in speech synthesiser. No audio files, no network, and it
 * falls back silently on devices that have no voices installed.
 */
export class Coach {
  constructor() {
    this.enabled = 'speechSynthesis' in window;
    this.voice = null;
    this.muted = false;
    if (this.enabled) {
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer an English voice; beyond that let the platform decide.
        this.voice = voices.find((v) => /en[-_]AU/i.test(v.lang))
          || voices.find((v) => /^en/i.test(v.lang))
          || voices[0] || null;
      };
      pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    }
  }

  /**
   * Say something. `interrupt` cancels whatever is queued, which is what you
   * want for a new instruction and not what you want for praise.
   */
  say(text, { interrupt = true, rate = 0.95, pitch = 1.15 } = {}) {
    if (!this.enabled || this.muted || !text) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* a voice that refuses to speak must not take the game down */
    }
  }

  stop() {
    if (!this.enabled) return;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

/** Short, varied praise, so the tenth success does not sound like the first. */
const PRAISE = ['Great job!', 'Well done!', 'Perfect!', 'Nice one!', 'You did it!', 'Awesome!'];
export const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

const ENCOURAGE = [
  'Almost! Try again.',
  'Have another go.',
  'Nearly there!',
  'One more try.',
];
export const encourage = () => ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
