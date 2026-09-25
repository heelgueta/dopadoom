/**
 * Tiny WebAudio bleeps + vibration. No assets. Every sound is a couple of
 * oscillator notes so it loads instantly; swap for real samples later.
 * iOS needs unlockAudio() inside a user gesture (done on first pointerdown).
 */
import { CFG } from '../config';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
let ac: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    if (!ac) {
      const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!AC) return;
      ac = new AC();
    }
    if (ac.state === 'suspended') void ac.resume();
  } catch {
    /* no audio, no problem */
  }
}

function tone(freq: number, dur = 0.07, type: OscillatorType = 'square', vol = 0.04, slideTo?: number, delay = 0): void {
  if (!CFG.SOUND || !ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function buzz(pattern: number | number[]): void {
  if (!CFG.HAPTICS) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/** pitch climbs with the size of the gain (log scale), like balatro chips */
function gainPitch(n: number): number {
  return 440 * Math.pow(2, Math.min(2, Math.log2(1 + Math.abs(n)) / 2.5));
}

export const sfx = {
  swipe() { tone(220, 0.04, 'triangle', 0.03); buzz(8); },
  gain(n: number) {
    if (n > 0) { tone(gainPitch(n), 0.08, 'square', 0.035); if (n >= 10) tone(gainPitch(n) * 1.5, 0.1, 'square', 0.03, undefined, 0.06); }
    else if (n < 0) tone(180, 0.12, 'sawtooth', 0.03, 110);
  },
  chip(i: number) { tone(520 * Math.pow(2, (i * 2) / 12), 0.06, 'square', 0.03); buzz(6); },
  deny() { tone(110, 0.16, 'sawtooth', 0.05, 70); buzz([25, 30, 25]); },
  save() { tone(660, 0.06, 'square', 0.035); tone(990, 0.09, 'square', 0.035, undefined, 0.06); buzz(15); },
  reject() { tone(300, 0.12, 'triangle', 0.04, 120); buzz(15); },
  notif() { tone(1320, 0.05, 'sine', 0.05); tone(1760, 0.08, 'sine', 0.05, undefined, 0.07); buzz([10, 40, 10]); },
  boss() { tone(80, 0.6, 'sawtooth', 0.05, 55); tone(82, 0.6, 'sawtooth', 0.04, 57, 0.05); buzz([60, 40, 60]); },
  hour() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.03, undefined, i * 0.08)); buzz(30); },
  adDone() { tone(880, 0.06, 'triangle', 0.04); tone(1175, 0.08, 'triangle', 0.04, undefined, 0.05); },
  sleep() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, undefined, i * 0.22)); buzz(200); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.15, 'square', 0.035, undefined, i * 0.1)); },
  click() { tone(700, 0.03, 'square', 0.025); },
};
