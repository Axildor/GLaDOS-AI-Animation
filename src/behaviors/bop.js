/**
 * behaviors/bop.js — Spring-physics tap bop.
 *
 * Fixed-timestep damped harmonic oscillator (shared spring.js) drives the
 * head; LED brightness tracks displacement. Interruptible: re-tapping
 * mid-bop injects velocity. On settle, restores saved LED/lid state and
 * restarts idle behaviors.
 *
 * Tracked resource name: 'bop-raf'.
 */

import { startLidBehavior, stopLidBehavior, startIdleCycle, stopIdleCycle } from './idle.js';
import { createSpring } from './spring.js';

export function bopHead(card) {
  const a = card.animator;
  const config = card.config;

  const backendSpeed = config.tap_speed !== undefined ? parseFloat(config.tap_speed) : 0.5;
  const bounces = Math.max(1, Math.min(20, config.tap_bounces !== undefined ? parseInt(config.tap_bounces) : 5));
  const intensity = config.tap_intensity !== undefined ? parseFloat(config.tap_intensity) : 1.0;

  const maxAmp = 15 * intensity;
  const omega = 0.28 * Math.max(0.01, backendSpeed);
  const dampingRatio = Math.min(0.7, 0.6 / bounces);
  const initialVelocity = maxAmp * omega * 1.8;

  if (card._bopping && card._bopSpring) {
    card._bopSpring.injectVelocity(initialVelocity);
    return;
  }

  stopIdleCycle(card);
  stopLidBehavior(card);

  // Cancel any lingering fill:'forwards' WAAPI animation (dance keyframes) —
  // active WAAPI animations override inline style.transform writes, so the
  // bop below would be invisible while one is running.
  a.cancelAnim('head-keyframes');

  const savedLedColor = a.currentLedColor;
  const savedLedOpacity = a.currentLedOpacity;
  const savedBaseLid = a.currentBaseLid;

  const spring = createSpring({ omega, dampingRatio });
  // Seed the oscillator: a fresh spring starts at rest and would settle on
  // the first frame with zero visible motion. Mirrors the dance groove kick.
  spring.injectVelocity(initialVelocity);
  card._bopSpring = spring;
  // Mark the bop active only after the spring exists: if anything above
  // throws, _bopping must stay false or every future tap would take the
  // re-tap branch against a null spring.
  card._bopping = true;

  let lastTime = performance.now();
  let lastLedUpdate = 0;

  a.cancelRaf('bop-raf');

  const animate = (now) => {
    if (!card._bopping) return;

    let frameTime = now - lastTime;
    lastTime = now;
    if (frameTime > 100) frameTime = 16.666;

    const settled = spring.step(frameTime);

    if (settled) {
      card._bopping = false;
      a.el.head.style.transition = 'transform 0.4s ease-out';
      a.el.head.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
      a.setLEDs(savedLedColor, savedLedOpacity);
      a.setLid(savedBaseLid, 0.4);
      if (card._state === 'idle') { startLidBehavior(card); startIdleCycle(card); }
      return;
    }

    const ty = spring.position;
    const rot = spring.position * 0.15;
    const scale = 1.0 - Math.abs(spring.position) * 0.003;
    a.el.head.style.transition = 'none';
    a.el.head.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

    if (now - lastLedUpdate > 60) {
      lastLedUpdate = now;
      const normPos = Math.min(1, Math.abs(spring.position) / maxAmp);
      const baseOp = parseFloat(savedLedOpacity) || 0.15;
      const ledOp = baseOp + (1 - baseOp) * normPos;
      a.el.svg.style.setProperty('--led-color', savedLedColor);
      a.el.svg.style.setProperty('--led-opacity', ledOp.toFixed(2));
    }

    a.requestRaf('bop-raf', animate);
  };
  a.requestRaf('bop-raf', animate);
}

export function stopBop(card) {
  card._bopping = false;
  card.animator.cancelRaf('bop-raf');
}