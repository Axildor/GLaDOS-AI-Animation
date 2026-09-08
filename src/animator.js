/**
 * animator.js — GladosAnimator: element refs + motion primitives + resource registry.
 *
 * This class owns every DOM reference and every motion primitive. Behavior
 * modules (idle/dance/talk/bop) drive the SVG exclusively through this class,
 * and MUST schedule timers/RAFs through the tracked helpers so that
 * stopAll() can guarantee zero leaks on teardown or state change.
 */

export class GladosAnimator {
  constructor(shadowRoot) {
    const root = shadowRoot;
    this.el = {
      svg: root.getElementById('glados-svg'),
      head: root.getElementById('glados-head'),
      headGroove: root.getElementById('head-groove'),
      torsoSwivel: root.getElementById('torso-swivel'),
      hitbox: root.getElementById('hitbox'),
      eyeLayerIdle: root.getElementById('eye-layer-idle'),
      eyeLayerListen: root.getElementById('eye-layer-listen'),
      eyeLayerProcess: root.getElementById('eye-layer-process'),
      eyeLayerRespond: root.getElementById('eye-layer-respond'),
      eyeLayerDance: root.getElementById('eye-layer-dance'),
      eyeHalo: root.getElementById('eye-halo'),
      eyeCenter: root.getElementById('eye-center'),
      pupil: root.getElementById('eye-pupil'),
      eyeball: root.getElementById('eyeball-assembly'),
      bellows: root.getElementById('bellows'),
      lidTop: root.getElementById('eye-lid'),
      lidBot: root.getElementById('eye-lid-bottom'),
      dangerRing: root.getElementById('danger-ring'),
      ledMatrices: root.querySelectorAll('.led-matrix'),
    };

    // Mutable visual state (read by bop save/restore, lid loop, etc.)
    this.currentBaseLid = 0;
    this.currentLedColor = '#ffb800';
    this.currentLedOpacity = '0.15';

    // Centralized resource registry: name -> timer/raf id
    this._timers = new Map();
    this._rafs = new Map();
    // Tracked WAAPI animations: name -> Animation object
    this._anims = new Map();
  }

  // ---- Tracked scheduling (the ONLY way behaviors may schedule work) ----

  setTimeout(name, fn, delay) {
    this.clearTimeout(name);
    const id = setTimeout(() => {
      this._timers.delete(name);
      fn();
    }, delay);
    this._timers.set(name, id);
    return id;
  }

  clearTimeout(name) {
    const id = this._timers.get(name);
    if (id !== undefined) {
      clearTimeout(id);
      this._timers.delete(name);
    }
  }

  requestRaf(name, fn) {
    this.cancelRaf(name);
    const id = requestAnimationFrame((now) => {
      this._rafs.delete(name);
      fn(now);
    });
    this._rafs.set(name, id);
    return id;
  }

  cancelRaf(name) {
    const id = this._rafs.get(name);
    if (id !== undefined) {
      cancelAnimationFrame(id);
      this._rafs.delete(name);
    }
  }

  cancelAnim(name) {
    const anim = this._anims.get(name);
    if (anim !== undefined) {
      anim.cancel();
      this._anims.delete(name);
    }
  }

  /**
   * Play a tracked Web Animations API animation. `keyframes` is an array of
   * {transform, offset?, easing?} objects; `opts` is {duration, easing, fill}.
   * Tracked so stopAll() can cancel it — keeps the zero-leak guarantee.
   */
  playAnim(name, el, keyframes, opts) {
    this.cancelAnim(name);
    const anim = el.animate(keyframes, opts);
    // NOTE: finished fill:'forwards' animations keep applying their effect,
    // so they stay tracked until explicitly cancelled or replaced.
    this._anims.set(name, anim);
    return anim;
  }

  /** Tear down every tracked timer, RAF, and WAAPI animation. */
  stopAll() {
    for (const id of this._timers.values()) clearTimeout(id);
    for (const id of this._rafs.values()) cancelAnimationFrame(id);
    for (const anim of this._anims.values()) anim.cancel();
    this._timers.clear();
    this._rafs.clear();
    this._anims.clear();
  }

  // ---- Motion primitives (1:1 ports of the original initGlados closures) ----

  setHead(rot, tx, ty, scale = 1.0, dur, ease = 'cubic-bezier(0.34,1.06,0.64,1)') {
    this.el.head.style.transition = `transform ${dur}s ${ease}`;
    this.el.head.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${scale})`;
  }

  setBodySwivel(rot, sx, dur) {
    this.el.torsoSwivel.style.transition = `transform ${dur || 2.0}s cubic-bezier(0.45,0.05,0.55,0.95)`;
    this.el.torsoSwivel.style.transform = `rotate(${rot}deg) scaleX(${sx || 1})`;
  }

  resetBodySwivel() {
    this.el.torsoSwivel.style.transition = `transform 2.0s cubic-bezier(0.45,0.05,0.55,0.95)`;
    this.el.torsoSwivel.style.transform = '';
  }

  setLid(amount, dur = 0.7) {
    const px = amount * 17;
    this.el.lidTop.style.transition = `transform ${dur}s ease-in-out`;
    this.el.lidBot.style.transition = `transform ${dur}s ease-in-out`;
    this.el.lidTop.style.transform = `translate3d(0, ${px}px, 0)`;
    this.el.lidBot.style.transform = `translate3d(0, ${-px}px, 0)`;
  }

  setBaseLid(amount, dur = 0.7) {
    this.currentBaseLid = amount;
    this.setLid(amount, dur);
  }

  setPupil(px, py) {
    this.el.pupil.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    const ey = py * 1.5;
    this.el.eyeball.style.transform = `translate3d(0, ${ey}px, 0)`;
    this._pupilBellowsY = ey;
    this._applyBellows(0.15);
  }

  /**
   * Keyframed head move over dur seconds. frames is an array of
   * { pose: [rot, tx, ty, scale], offset?: 0..1, easing?: string }.
   * Omitting offset 0 lets the move start from the head's current pose.
   * Played as a tracked WAAPI animation (anticipation -> hit -> settle).
   */
  setHeadKeyframes(frames, dur) {
    const keyframes = frames.map((f) => {
      const p = f.pose;
      const kf = {
        transform: `translate3d(${p[1]}px,${p[2]}px,0) rotate(${p[0]}deg) scale(${p[3]})`,
      };
      if (f.offset !== undefined) kf.offset = f.offset;
      if (f.easing) kf.easing = f.easing;
      return kf;
    });
    return this.playAnim('head-keyframes', this.el.head, keyframes, {
      duration: dur * 1000,
      fill: 'forwards',
    });
  }

  /**
   * Pump the bellows: amount in px (positive = compress upward). Composes
   * with the pupil-driven bellows offset so the two don't clobber each other.
   */
  setBellows(amount, dur = 0.15) {
    this._bellowsPump = amount;
    this._applyBellows(dur);
  }

  _applyBellows(dur) {
    this.el.bellows.style.transition = `transform ${dur}s ease-out`;
    this.el.bellows.style.transform = `translate3d(0, ${(this._pupilBellowsY || 0) - (this._bellowsPump || 0)}px, 0)`;
  }

  /** Reset the groove layer transform (spring layer on the head). */
  resetGroove() {
    this.cancelRaf('dance-groove-raf');
    if (this.el.headGroove) this.el.headGroove.style.transform = '';
  }

  setLEDs(color, opacity) {
    this.currentLedColor = color;
    this.currentLedOpacity = opacity;
    this.el.svg.style.setProperty('--led-color', color);
    this.el.svg.style.setProperty('--led-opacity', opacity);
  }
}