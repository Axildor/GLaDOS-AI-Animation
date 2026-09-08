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

  /** Tear down every tracked timer and RAF. */
  stopAll() {
    for (const id of this._timers.values()) clearTimeout(id);
    for (const id of this._rafs.values()) cancelAnimationFrame(id);
    this._timers.clear();
    this._rafs.clear();
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
    this.el.bellows.style.transform = `translate3d(0, ${ey}px, 0)`;
  }

  setLEDs(color, opacity) {
    this.currentLedColor = color;
    this.currentLedOpacity = opacity;
    this.el.svg.style.setProperty('--led-color', color);
    this.el.svg.style.setProperty('--led-opacity', opacity);
  }
}