/**
 * verify_dance_smoothness.mjs — End-to-end verification of the dance
 * jerkiness fixes. Runs the real startDanceCycle() with a stubbed animator
 * and asserts, for every tier (60/110/140/180 BPM) and every choreo block:
 *
 *  1. moveDur <= 0.95x beat interval (tiers 1-3) / <= 1.9x beat (tier 0)
 *     -> no move is ever cancelled mid-flight, no dead freeze between beats.
 *  2. The anticipation windup (anti-pose keyframe) only appears on downbeats
 *     for tiers 1-3; tier 0 keeps it on every (2-beat) move.
 *  3. The first move's keyframe 0 equals the live head pose (pose continuity).
 *  4. playAnim cancel-snap guard: cancelling mid-flight freezes the computed
 *     transform into the inline style (no snap-back frame).
 */

import { startDanceCycle, stopDanceCycle } from '../src/behaviors/dance.js';
import { createSpring } from '../src/behaviors/spring.js';

// ---- Minimal DOM/animator stub ----
function makeEl() {
  return {
    style: {},
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    animate() { return { cancel() {} }; },
  };
}

function makeAnimator() {
  const el = {};
  for (const k of ['svg', 'head', 'headGroove', 'torsoSwivel', 'hitbox', 'eyeHalo', 'eyeCenter', 'pupil', 'eyeball', 'bellows', 'lidTop', 'lidBot', 'dangerRing']) el[k] = makeEl();
  el.ledMatrices = [];
  const a = {
    el,
    currentBaseLid: 0,
    currentLedColor: '#ffb800',
    currentLedOpacity: '0.15',
    _timers: new Map(),
    _rafs: new Map(),
    _anims: new Map(),
    _keyframeCalls: [],
    setTimeout(name, fn, delay) { this._timers.set(name, { fn, delay }); return name; },
    clearTimeout(name) { this._timers.delete(name); },
    requestRaf(name, fn) { this._rafs.set(name, fn); return name; },
    cancelRaf(name) { this._rafs.delete(name); },
    cancelAnim(name) { this._anims.delete(name); },
    playAnim(name, elRef, keyframes, opts) {
      this._keyframeCalls.push({ name, keyframes, opts });
      this._anims.set(name, { cancel() {} });
      return { cancel() {} };
    },
    setHead() {}, setBodySwivel() {}, resetBodySwivel() {},
    setHeadKeyframes(frames, dur) {
      this._keyframeCalls.push({ name: 'head-keyframes', keyframes: frames, opts: { duration: dur * 1000 } });
      this._anims.set('head-keyframes', { cancel() {} });
      return { cancel() {} };
    },
    setLid() {}, setBaseLid(v) { this.currentBaseLid = v; },
    setPupil() {}, setBellows() {}, setLEDs(c, o) { this.currentLedColor = c; this.currentLedOpacity = o; },
    resetGroove() { this.cancelRaf('dance-groove-raf'); },
    stopAll() { this._timers.clear(); this._rafs.clear(); this._anims.clear(); },
  };
  return a;
}

function makeCard() {
  return { animator: makeAnimator(), _state: 'dancing', config: {} };
}

// Drive the dance step loop manually: the step timer is stored under
// 'dance-step' with its delay; we invoke it repeatedly, simulating beats.
function runBeats(card, count) {
  const a = card.animator;
  for (let i = 0; i < count; i++) {
    const t = a._timers.get('dance-step');
    if (!t) break;
    a._timers.delete('dance-step');
    t.fn(); // executes one beat's worth of choreography
  }
}

let failures = 0;
const assert = (cond, msg) => {
  if (cond) { console.log(`  PASS: ${msg}`); }
  else { failures++; console.error(`  FAIL: ${msg}`); }
};

const TIERS = [
  { bpm: 70, label: 'tier 0 (chill, 70 BPM)' },
  { bpm: 110, label: 'tier 1 (groovy, 110 BPM)' },
  { bpm: 140, label: 'tier 2 (club, 140 BPM)' },
  { bpm: 180, label: 'tier 3 (hardcore, 180 BPM)' },
];

for (const tier of TIERS) {
  console.log(`\n== ${tier.label} ==`);
  const beatSec = 60 / tier.bpm;
  const beatMs = beatSec * 1000;
  const maxDur = tier.bpm < 90 ? beatSec * 1.9 : beatSec * 0.95;

  // Run 32 beats (4 routine rotations) to cover all 8 choreo blocks.
  const card = makeCard();
  startDanceCycle(card, tier.bpm);
  runBeats(card, 32);

  const calls = card.animator._keyframeCalls;
  assert(calls.length >= 16, `pose moves fired (${calls.length} keyframe calls over 32 beats)`);

  // 1. Duration clamp: every move within [0.5x, maxDur] of the beat interval.
  let durOk = true;
  for (const c of calls) {
    const d = c.opts.duration / 1000;
    if (d > maxDur + 1e-9 || d < beatSec * 0.4) { durOk = false; console.error(`    bad moveDur ${d.toFixed(3)}s (beat ${beatSec.toFixed(3)}s, max ${maxDur.toFixed(3)}s)`); }
  }
  assert(durOk, `all moveDurs within (0.4x, ${(maxDur / beatSec).toFixed(2)}x) of beat interval — no mid-flight cancel, no dead freeze`);

  // 2. Windup gating: anti-pose (4-keyframe moves) only on downbeats for tiers 1-3.
  //    Downbeats are even dancePhase; the first step() call is phase 0 (downbeat).
  if (tier.bpm < 90) {
    assert(calls.every((c) => c.keyframes.length === 4), 'tier 0 keeps expressive windup on every 2-beat move');
  } else {
    // Reconstruct which calls were downbeats: calls alternate down/off per beat
    // except tier 0. For tiers 1-3 every beat produces a pose move.
    let windupOk = true;
    calls.forEach((c, i) => {
      const isDown = i % 2 === 0; // phase 0, 2, 4... are downbeats
      const hasAnti = c.keyframes.length === 4;
      if (isDown !== hasAnti) { windupOk = false; console.error(`    call ${i}: downbeat=${isDown} but windup=${hasAnti}`); }
    });
    assert(windupOk, 'windup (anti-pose) fires on downbeats only; offbeats move directly');
  }

  stopDanceCycle(card);
}

// 3. Pose continuity: first keyframe of the first move equals the live head pose.
{
  console.log('\n== pose continuity ==');
  const card = makeCard();
  // Simulate a head frozen mid-pose (e.g. previous dance was interrupted).
  // getComputedStyle in browsers always returns matrix() form, so the stub
  // must too: rotate(6deg) scale(1.02) then translate(3px, 7px).
  // matrix(a,b,c,d,e,f) with a=cos(6)*1.02, b=sin(6)*1.02.
  const c6 = Math.cos(6 * Math.PI / 180) * 1.02;
  const s6 = Math.sin(6 * Math.PI / 180) * 1.02;
  globalThis.getComputedStyle = () => ({ transform: `matrix(${c6.toFixed(6)}, ${s6.toFixed(6)}, 0, ${c6.toFixed(6)}, 3, 7)` });
  startDanceCycle(card, 120);
  const first = card.animator._keyframeCalls[0];
  const p0 = first.keyframes[0].pose;
  const poseOk = Math.abs(p0[0] - 6) < 0.5 && Math.abs(p0[1] - 3) < 0.5
    && Math.abs(p0[2] - 7) < 0.5 && Math.abs(p0[3] - 1.02) < 0.02;
  assert(poseOk, `first move eases from live pose [rot=${p0[0].toFixed(1)}, tx=${p0[1].toFixed(1)}, ty=${p0[2].toFixed(1)}, s=${p0[3].toFixed(2)}]`);
  stopDanceCycle(card);
}

// 4. Cancel-snap guard in stopDanceCycle: live pose frozen into inline style.
{
  console.log('\n== cancel-snap guard ==');
  const card = makeCard();
  globalThis.getComputedStyle = (el) => ({ transform: el.style.transform || 'translate3d(2px,4px,0) rotate(3deg) scale(1.01)' });
  startDanceCycle(card, 120);
  runBeats(card, 2);
  stopDanceCycle(card);
  const frozen = card.animator.el.head.style.transform;
  assert(typeof frozen === 'string' && frozen.includes('matrix') || (frozen || '').includes('translate3d'), `live pose frozen into inline style before cancel ("${frozen}")`);
}

// 5. Spring sanity: groove spring still bounces (regression check).
{
  console.log('\n== groove spring regression ==');
  const s = createSpring({ omega: 0.2, dampingRatio: 0.35, settleThreshold: 0.05 });
  s.injectVelocity(0.5);
  let peak = 0;
  for (let i = 0; i < 200; i++) { s.step(16.666); peak = Math.max(peak, Math.abs(s.position)); }
  assert(peak > 1 && peak < 20, `groove spring produces visible bounce (peak ${peak.toFixed(2)} px)`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);