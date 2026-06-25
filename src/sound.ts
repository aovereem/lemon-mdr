/**
 * Tiny Web Audio fanfares for the celebrations — no audio files. A kazoo-ish buzz
 * (square wave + vibrato). "dud" deflates (a sad descending womp); "big" is a rising
 * four-note horn fanfare. Browsers block audio until a user gesture, so we resume the
 * context on the first click/keypress.
 */
let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

const unlock = (): void => {
  ac().resume();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

/** One kazoo-ish note, optionally bending (semitone factor) over its life. */
function honk(freq: number, t0: number, dur: number, gainv: number, type: OscillatorType, bend: number): void {
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * Math.pow(2, bend)), t0 + dur);
  // vibrato gives the kazoo its buzz
  const lfo = a.createOscillator();
  const lg = a.createGain();
  lfo.frequency.value = 17;
  lg.gain.value = freq * 0.03;
  lfo.connect(lg).connect(o.frequency);
  lfo.start(t0);
  lfo.stop(t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainv, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** A bass-drum thump. */
function thump(t0: number): void {
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t0);
  o.frequency.exponentialRampToValueAtTime(50, t0 + 0.12);
  g.gain.setValueAtTime(0.45, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + 0.22);
}

/** A snare hit (filtered noise burst). */
function snare(t0: number, gain = 0.22): void {
  const a = ac();
  const len = 0.1;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = a.createBufferSource();
  src.buffer = buf;
  const hp = a.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1100;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(hp).connect(g).connect(a.destination);
  src.start(t0);
}

/** A steady marching-band cadence for the Music Dance Experience: bass drum on every
 *  beat under a driving sixteenth-note snare line, accented on the downbeats. */
function drumline(): void {
  const a = ac();
  if (a.state === "suspended") void a.resume();
  const start = a.currentTime + 0.05;
  const six = 0.13; // a sixteenth note (~115 bpm)
  const snareHits = [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1]; // one bar of sixteenths
  const bars = 2;
  for (let s = 0; s < bars * 16; s++) {
    const t = start + s * six;
    if (s % 4 === 0) thump(t); // bass on every beat — the steady pulse
    if (snareHits[s % 16]) snare(t, s % 4 === 0 ? 0.3 : 0.15); // accent the downbeats
  }
}

export function fanfare(tier: "dud" | "mid" | "dance" | "big"): void {
  const a = ac();
  if (a.state === "suspended") void a.resume();
  const t = a.currentTime + 0.02;
  if (tier === "dud") {
    honk(300, t, 0.55, 0.15, "sawtooth", -0.95); // sad descending womp
  } else if (tier === "mid") {
    honk(392, t, 0.15, 0.16, "square", 0);
    honk(523, t + 0.15, 0.3, 0.16, "square", 0.05);
  } else if (tier === "dance") {
    drumline();
  } else {
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) =>
      honk(f, t + i * 0.13, i === notes.length - 1 ? 0.55 : 0.16, 0.2, "square", i === notes.length - 1 ? 0.04 : 0),
    );
  }
}
