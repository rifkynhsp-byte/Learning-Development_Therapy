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
    this.voiceId = null;
    this.muted = false;
    if (this.enabled) {
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer an English voice; beyond that let the platform decide.
        this.voice = voices.find((v) => /en[-_]AU/i.test(v.lang))
          || voices.find((v) => /^en/i.test(v.lang))
          || voices[0] || null;
        // Indonesian is reported as id-ID, a bare id, or -- on Android and
        // anything built on older Java -- in-ID, the language's original code.
        this.voiceId = voices.find((v) => isIndonesian(v)) || null;
      };
      pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    }
  }

  /**
   * Say something. `interrupt` cancels whatever is queued, which is what you
   * want for a new instruction and not what you want for praise. `lang` is
   * 'en' (the default) or 'id' for Bahasa Indonesia.
   */
  say(text, { interrupt = true, rate = 0.95, pitch = 1.15, lang = 'en' } = {}) {
    if (!this.enabled || this.muted || !text) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (lang === 'id') {
        utterance.lang = 'id-ID';
        if (this.voiceId) utterance.voice = this.voiceId;
        utterance.rate = rate * 0.95;
      } else {
        if (this.voice) utterance.voice = this.voice;
        utterance.rate = rate;
      }
      utterance.pitch = pitch;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* a voice that refuses to speak must not take the game down */
    }
  }

  /**
   * Say a lesson line from lessons.js in the chosen language: 'id', 'en', or
   * 'both' (Indonesian first, then English, as in the rest of the app).
   */
  sayPair(pair, lang = 'both', { interrupt = true } = {}) {
    if (!pair) return;
    if (lang === 'en') { this.say(pair.en, { interrupt }); return; }
    this.say(pair.id, { interrupt, lang: 'id' });
    if (lang === 'both') this.say(pair.en, { interrupt: false });
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

function isIndonesian(voice) {
  const lang = String(voice.lang || '').replace('_', '-').toLowerCase();
  if (/^(id|in|ind)(-|$)/.test(lang)) return true;
  return /indonesia|bahasa/i.test(voice.name || '');
}
