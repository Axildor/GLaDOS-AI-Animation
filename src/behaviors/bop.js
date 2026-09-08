/**
 * behaviors/bop.js — Spring-physics tap bop.
 *
 * Fixed-timestep damped harmonic oscillator drives the head; LED brightness
 * tracks displacement. Interruptible: re-tapping mid-bop injects velocity.
 * On settle, restores saved LED/lid state and restarts idle behaviors.
 *
 * Tracked resource name: 'bop-raf'.
 */

import { startLidBehavior, stopLidBehavior, startIdleCycle } from './idle.js';

export function bopHead(card) {
  const a = card.animator;
  const config = card.config;

  const backendSpeed = config.tap_speed !== undefined ? parseFloat(config.tap_speed) : 0.5;
  const bounces = Math.max(1, Math.min(20, config.tap_bounces !== undefined ? parseInt(config.tap_bounces) : 5));
  const intensity = config.tap_intensity !== undefined ? parseFloat(config.tap_intensity) : 1.0;

  const maxAmp = 15 * intensity;
  const omega = 0.28 * Math.max(0.01, backendSpeed);
  const dampingRatio = Math.min(0.7, 0.6 / bounces);
  const damping = 2 * omega * dampingRatio;
  const stiffness = omega * omega;
  const initialVelocity = maxAmp * omega * 1.8;

  if (card._bopping) {
    card._bopVelocity = initialVelocity;
    return;
  }

  card._bopping = true;
  stopIdleCycle(card);
  stopLidBehavior(card);

  const savedLedColor = a.currentLedColor;
  const savedLedOpacity = a.currentLedOpacity;
  const savedBaseLid = a.currentBaseLid;

  card._bopPosition = 0;
  card._bopVelocity = initialVelocity;

  let lastTime = performance.now();
  let accumulator = 0;
  const TIME_STEP = 16.666;
  let lastLedUpdate = 0;

  a.cancelRaf('bop-raf');

  const animate = (now) => {
    if (!card._bopping) return;

    let frameTime = now - lastTime;
    lastTime = now;
    if (frameTime > 100) frameTime = 16.666;

    accumulator += frameTime;

    while (accumulator >= TIME_STEP) {
      const force = -stiffness * card._bopPosition - damping * card._bopVelocity;
      card._bopVelocity += force;
      card._bopPosition += card._bopVelocity;
      accumulator -= TIME_STEP;
    }

    if (Math.abs(card._bopPosition) < 0.08 && Math.abs(card._bopVelocity) < 0.08) {
      card._bopping = false;
      a.el.head.style.transition = 'transform 0.4s ease-out';
      a.el.head.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
      a.setLEDs(savedLedColor, savedLedOpacity);
      a.setLid(savedBaseLid, 0.4);
      if (card._state === 'idle') { startLidBehavior(card); startIdleCycle(card); }
      return;
    }

    const ty = card._bopPosition;
    const rot = card._bopPosition * 0.15;
    const scale = 1.0 - Math.abs(card._bopPosition) * 0.003;
    a.el.head.style.transition = 'none';
    a.el.head.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

    if (now - lastLedUpdate > 60) {
      lastLedUpdate = now;
      const normPos = Math.min(1, Math.abs(card._bopPosition) / maxAmp);
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