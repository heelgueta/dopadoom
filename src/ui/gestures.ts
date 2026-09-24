/**
 * Swipe recogniser (Pointer Events → works for touch, mouse and pen).
 * Feel ported from slik: axis lock after a few px, commit past a distance
 * threshold, plus a velocity flick so quick thumbs don't need the full drag.
 * All thresholds live in CFG (feel group) so they're tweakable on the phone.
 */
import { CFG } from '../config';
import type { Dir } from '../types';

export interface GestureHandlers {
  onStart?(): void;
  /** live drag, already axis-locked (the other axis is 0) */
  onMove(dx: number, dy: number, dir: Dir | null): void;
  /** dir = committed swipe, null = cancelled/snap back */
  onEnd(dir: Dir | null): void;
}

interface Sample { t: number; x: number; y: number }

export class Gestures {
  private pointer: number | null = null;
  private x0 = 0;
  private y0 = 0;
  private axis: 'x' | 'y' | null = null;
  private samples: Sample[] = [];

  constructor(private el: HTMLElement, private h: GestureHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancelEv);
  }

  /** abort the current drag (e.g. the game forced a swipe underneath you) */
  cancel(): void {
    this.pointer = null;
    this.axis = null;
  }

  get dragging(): boolean {
    return this.pointer !== null && this.axis !== null;
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointer = e.pointerId;
    this.x0 = e.clientX;
    this.y0 = e.clientY;
    this.axis = null;
    this.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.h.onStart?.();
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.x0;
    const dy = e.clientY - this.y0;
    if (!this.axis && Math.max(Math.abs(dx), Math.abs(dy)) > CFG.AXIS_LOCK_PX) {
      this.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    this.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (this.samples.length > 2 && e.timeStamp - this.samples[0].t > 100) this.samples.shift();
    if (!this.axis) return;
    if (this.axis === 'x') this.h.onMove(dx, 0, dx < 0 ? 'left' : 'right');
    else this.h.onMove(0, dy, dy < 0 ? 'up' : 'down');
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    const axis = this.axis;
    this.axis = null;
    if (!axis) { this.h.onEnd(null); return; }

    const d = axis === 'x' ? e.clientX - this.x0 : e.clientY - this.y0;
    const first = this.samples[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const v = axis === 'x' ? (e.clientX - first.x) / dt : (e.clientY - first.y) / dt;

    const far = Math.abs(d) >= CFG.SWIPE_THRESHOLD_PX;
    const flick = Math.abs(d) >= 25 && Math.abs(v) >= CFG.FLICK_VELOCITY && Math.sign(v) === Math.sign(d);
    if (!far && !flick) { this.h.onEnd(null); return; }

    const dir: Dir = axis === 'x' ? (d < 0 ? 'left' : 'right') : d < 0 ? 'up' : 'down';
    this.h.onEnd(dir);
  };

  private cancelEv = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.axis = null;
    this.h.onEnd(null);
  };
}
