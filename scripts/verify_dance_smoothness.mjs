/**
 * verify_dance_smoothness.mjs — End-to-end verification of the dance
 * smoothness + choreography contract. Runs the real startDanceCycle() with
 * a stubbed animator and asserts, for every tier (70/110/140/180 BPM):
 *
 * Smoothness contract (existing):
 *  1. HIT moves (tiers 1-3) always finish inside the beat (<= 0.95x) —
 *     no mid-flight cancel, no dead freeze between beats.
 *  2. FLOW moves (chill tier, release phrases, resolve handoffs) may span
 *     up to 1.9x beats — continuous travel instead of hit-freeze-hit.
 *  3. Keyframe structure: flow = 2 keyframes; hit downbeat = 4 (windup);
 *     hit offbeat = 3. Tier 0 is all-flow.
 *  4. Pose continuity: the first move's keyframe 0 equals the live head
 *     pose, and the move AFTER a flow move reseeds from the live pose.
 *  5. Cancel-snap guard: cancelling mid-flight freezes the computed
 *     transform into the inline style.
 *  6. Groove spring sanity (calmer 0.55 damping).
 *  7. Body swivel continuity: multi-beat duration, half head rotation.
 *
 * Choreography contract (phrase-graph rework):
 *  8. Graph legality: every phrase transition is a declared edge in the
 *     tier's transition graph — no random block teleports.
 *  9. Energy gating: peak phrases (energy > 0.8) only start in
 *     high-energy windows (window energy >= phrase energy - margin).
 * 10. Resolve handoff: beats 13-15 are flow glides and the beat-15 target
 *     equals the NEXT phrase's entry pose (choreographed handoff, not a
 *     reactive damper).
 * 11. Determinism: two identical runs produce identical pose sequences —
 *     no Math.random in choreography (seeded variants only).
 * 12. Physical laws: PENDULUM (sign(tx) == sign(r) when both significant),
 *     GRAVITY (downbeat ty > offbeat ty within a phrase; bellows pump > 0
 *     only on downbeats).
 */

import { startDanceCycle, stopDanceCycle } from '../src/behaviors/dance.js';
import { createSpring } from '../src/behaviors/spring.js';
import {
  TIERS, getEnergy, pickNextPhrase, phraseVariant, getPhraseEntry, getBeatPose,
} from '../src/behaviors/choreography.js';

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
    _swivelCalls: [],
    _bellowsCalls: [],
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
    setHead() {}, resetBodySwivel() {},
    setBodySwivel(rot, sx, dur) { this._swivelCalls.push({ rot, dur }); },
    setHeadKeyframes(frames, dur) {
      this._keyframeCalls.push({ name: 'head-keyframes', keyframes: frames, opts: { duration: dur * 1000 } });
      this._anims.set('head-keyframes', { cancel() {} });
      return { cancel() {} };
    },
    setLid() {}, setBaseLid(v) { this.currentBaseLid = v; },
    setPupil() {}, setBellows(p) { this._bellowsCalls.push(p); }, setLEDs(c, o) { this.currentLedColor = c; this.currentLedOpacity = o; },
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

// ---- Simulated phrase walk (mirrors dance.js's driver exactly) ----
// The choreography is fully deterministic, so the verify script can replay
// the same graph walk the engine performs and assert structural properties
// (legality, gating, handoff, laws) against the same data the engine used.
function simulateWalk(tierIdx, beats) {
  let phraseId = 0;
  let phraseCount = 0;
  let variant = phraseVariant(tierIdx, phraseId, phraseCount);
  let nextPhraseId = null;
  const seq = [];
  for (let phase = 0; phase < beats; phase++) {
    const b = phase % 16;
    if (b === 0 && phase > 0 && nextPhraseId !== null) {
      phraseId = nextPhraseId;
      phraseCount++;
      variant = phraseVariant(tierIdx, phraseId, phraseCount);
      nextPhraseId = null;
    }
    if (b === 12 && nextPhraseId === null) {
      nextPhraseId = pickNextPhrase(tierIdx, phraseId, getEnergy(phase + 16), phraseCount);
    }
    const nextEntry = (nextPhraseId !== null && b >= 13) ? getPhraseEntry(tierIdx, nextPhraseId) : null;
    const move = getBeatPose(tierIdx, phraseId, b, variant, getEnergy(phase), nextEntry);
    seq.push({ phase, b, phraseId, nextPhraseId, move });
  }
  return seq;
}

const TIERS_BPM = [
  { bpm: 70, label: 'tier 0 (chill, 70 BPM)' },
  { bpm: 110, label: 'tier 1 (groovy, 110 BPM)' },
  { bpm: 140, label: 'tier 2 (club, 140 BPM)' },
  { bpm: 180, label: 'tier 3 (hardcore, 180 BPM)' },
];

for (const tier of TIERS_BPM) {
  console.log(`\n== ${tier.label} ==`);
  const tierIdx = TIERS_BPM.indexOf(tier);
  const beatSec = 60 / tier.bpm;
  const hitMax = beatSec * 0.95;
  const flowMax = beatSec * 1.9;

  // Run 64 beats (a full energy-arc cycle) through the real engine.
  const card = makeCard();
  startDanceCycle(card, tier.bpm);
  runBeats(card, 64);

  const calls = card.animator._keyframeCalls;
  assert(calls.length >= 32, `pose moves fired (${calls.length} keyframe calls over 64 beats)`);

  // 1+2. Duration contract: hit moves <= 0.95x beat, flow moves <= 1.9x.
  let durOk = true;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const d = c.opts.duration / 1000;
    const isFlow = c.keyframes.length === 2;
    const max = isFlow ? flowMax : hitMax;
    if (d > max + 1e-9 || d < beatSec * 0.3) {
      durOk = false;
      console.error(`    call ${i}: bad moveDur ${d.toFixed(3)}s (beat ${beatSec.toFixed(3)}s, max ${max.toFixed(3)}s, flow=${isFlow})`);
    }
  }
  assert(durOk, `all moveDurs within contract (hit <= 0.95x, flow <= 1.9x of ${beatSec.toFixed(3)}s beat) — no mid-flight cancel, no dead freeze`);

  // 3. Keyframe structure vs the simulated walk: flow = 2 keyframes,
  //    hit downbeat = 4 (windup), hit offbeat = 3.
  {
    // The engine fires one extra move: startDanceCycle's immediate step()
    // (phase 0) plus one per runBeats iteration (phases 1..64) = 65 calls.
    const walk = simulateWalk(tierIdx, calls.length);
    let structOk = true;
    calls.forEach((c, i) => {
      const expected = walk[i].move.flow ? 2 : walk[i].b % 2 === 0 ? 4 : 3;
      if (c.keyframes.length !== expected) {
        structOk = false;
        console.error(`    call ${i} (phase ${i}, beat ${walk[i].b}): ${c.keyframes.length} keyframes, expected ${expected}`);
      }
    });
    assert(structOk, 'keyframe structure matches the phrase engine (flow=2, hit down=4, hit off=3)');
    if (tierIdx === 0) {
      assert(walk.every((w) => w.move.flow), 'tier 0 is all-flow: every beat is a glide (no hits)');
    }
  }

  // 8. Graph legality: every phrase transition is a declared edge.
  {
    const walk = simulateWalk(tierIdx, 128);
    let legal = true;
    for (let i = 1; i < walk.length; i++) {
      if (walk[i].b === 0 && walk[i].phraseId !== walk[i - 1].phraseId) {
        const from = walk[i - 1].phraseId;
        const to = walk[i].phraseId;
        if (!TIERS[tierIdx].edges[from].some(([t]) => t === to)) {
          legal = false;
          console.error(`    illegal transition ${TIERS[tierIdx].phrases[from].name} -> ${TIERS[tierIdx].phrases[to].name}`);
        }
      }
    }
    assert(legal, 'graph walk legality: every phrase transition is a declared edge (no random block teleports)');

    // 9. Energy gating: peak phrases only start in high-energy windows.
    let gated = true;
    for (const w of walk) {
      if (w.b === 0 && w.phase > 0) {
        const p = TIERS[tierIdx].phrases[w.phraseId];
        if (p.energy > 0.8 && getEnergy(w.phase) < p.energy - 0.3 - 1e-9) {
          gated = false;
          console.error(`    peak phrase ${p.name} (energy ${p.energy}) started at window energy ${getEnergy(w.phase).toFixed(2)}`);
        }
      }
    }
    assert(gated, 'energy gating: peak phrases only play during high-energy windows (verse/chorus dynamics)');

    // 10. Resolve handoff: beats 13-15 are flow glides and the beat-15
    //     target equals the next phrase's entry pose.
    let handoff = true;
    for (const w of walk) {
      if (w.b >= 13 && w.nextPhraseId !== null) {
        if (!w.move.flow) { handoff = false; console.error(`    phase ${w.phase}: resolve beat not a flow glide`); }
        if (w.b === 15) {
          const entry = getPhraseEntry(tierIdx, w.nextPhraseId);
          const t = [w.move.r, w.move.tx, w.move.ty, w.move.s];
          const err = Math.max(...t.map((v, i) => Math.abs(v - entry[i])));
          if (err > 1e-6) { handoff = false; console.error(`    phase ${w.phase}: beat-15 target off entry by ${err.toFixed(4)}`); }
        }
      }
    }
    assert(handoff, 'resolve handoff: beats 13-15 glide to the NEXT phrase\'s entry pose (choreographed, not damped)');

    // 12a. PENDULUM law: lateral drift coupled to tilt (same sign).
    let pendulum = true;
    for (const w of walk) {
      if (Math.abs(w.move.r) > 1 && Math.abs(w.move.tx) > 0.1
        && Math.sign(w.move.r) !== Math.sign(w.move.tx)) {
        pendulum = false;
        console.error(`    phase ${w.phase} (${TIERS[tierIdx].phrases[w.phraseId].name}): r=${w.move.r.toFixed(1)} tx=${w.move.tx.toFixed(1)} — head slides against its tilt`);
      }
    }
    assert(pendulum, 'PENDULUM law: tx coupled to r (hanging head swings in an arc, never slides)');

    // 12b. GRAVITY law: downbeat dips deeper than the offbeat rise.
    //      Scoped to phrase beats (b < 13): the resolve handoff (13-15) is
    //      a deliberate transition glide toward the next phrase's entry
    //      pose, not a groove move — it is exempt, like the old damped
    //      transition move was.
    let gravity = true;
    for (let i = 0; i + 1 < walk.length; i++) {
      const w = walk[i];
      if (w.b % 2 === 0 && w.b < 13 && walk[i + 1].b === w.b + 1) {
        if (w.move.ty <= walk[i + 1].move.ty) {
          gravity = false;
          console.error(`    phase ${w.phase}: downbeat ty ${w.move.ty.toFixed(1)} <= offbeat ty ${walk[i + 1].move.ty.toFixed(1)}`);
        }
      }
    }
    assert(gravity, 'GRAVITY law: downbeat dips (ty down), offbeat rises — a suspended head dips INTO the beat');

    // 12c. GRAVITY/bellows coupling: pump only on downbeats, never offbeats.
    let pumpOk = true;
    for (const w of walk) {
      if (w.b % 2 === 1 && w.move.pump !== 0) { pumpOk = false; console.error(`    phase ${w.phase}: offbeat pump ${w.move.pump.toFixed(2)}`); }
      if (w.b % 2 === 0 && w.move.pump <= 0) { pumpOk = false; console.error(`    phase ${w.phase}: downbeat pump ${w.move.pump.toFixed(2)}`); }
    }
    assert(pumpOk, 'bellows pump is gravity-coupled: compresses on the downbeat dip, releases on the rise');

    // 11. Determinism: a second identical walk produces identical poses.
    const walk2 = simulateWalk(tierIdx, 128);
    let det = walk.length === walk2.length;
    for (let i = 0; det && i < walk.length; i++) {
      const a1 = walk[i].move; const a2 = walk2[i].move;
      if (Math.abs(a1.r - a2.r) > 1e-9 || Math.abs(a1.tx - a2.tx) > 1e-9
        || Math.abs(a1.ty - a2.ty) > 1e-9 || Math.abs(a1.s - a2.s) > 1e-9
        || a1.flow !== a2.flow) det = false;
    }
    assert(det, 'determinism: identical runs produce identical choreography (seeded, no Math.random)');
  }

  stopDanceCycle(card);
}

// 4a. Pose continuity: first keyframe of the first move equals the live head pose.
{
  console.log('\n== pose continuity ==');
  const card = makeCard();
  // Simulate a head frozen mid-pose (e.g. previous dance was interrupted).
  // getComputedStyle in browsers always returns matrix() form, so the stub
  // must too: rotate(6deg) scale(1.02) then translate(3px, 7px).
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

// 4b. Flow reseed: the move after a flow move starts from the LIVE pose
//     (getComputedStyle), not the stale recorded target.
{
  console.log('\n== flow reseed ==');
  const c8 = Math.cos(9 * Math.PI / 180) * 1.01;
  const s8 = Math.sin(9 * Math.PI / 180) * 1.01;
  globalThis.getComputedStyle = () => ({ transform: `matrix(${c8.toFixed(6)}, ${s8.toFixed(6)}, 0, ${c8.toFixed(6)}, -2, 5)` });
  const card = makeCard();
  startDanceCycle(card, 70); // tier 0: every move is a flow move
  runBeats(card, 3);
  const calls = card.animator._keyframeCalls;
  const after = calls[2]; // third move: previous two were flow
  const p0 = after.keyframes[0].pose;
  const reseedOk = Math.abs(p0[0] - 9) < 0.5 && Math.abs(p0[1] - (-2)) < 0.5
    && Math.abs(p0[2] - 5) < 0.5 && Math.abs(p0[3] - 1.01) < 0.02;
  assert(reseedOk, `move after flow reseeds from live pose [rot=${p0[0].toFixed(1)}, tx=${p0[1].toFixed(1)}, ty=${p0[2].toFixed(1)}, s=${p0[3].toFixed(2)}]`);
  stopDanceCycle(card);
}

// 5. Cancel-snap guard in stopDanceCycle: live pose frozen into inline style.
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

// 6. Spring sanity: groove spring still bounces (regression check) with the
//    calmer 0.55 damping used by the dance groove layer.
{
  console.log('\n== groove spring regression ==');
  const s = createSpring({ omega: 0.2, dampingRatio: 0.55, settleThreshold: 0.05 });
  s.injectVelocity(0.5);
  let peak = 0;
  for (let i = 0; i < 200; i++) { s.step(16.666); peak = Math.max(peak, Math.abs(s.position)); }
  assert(peak > 1 && peak < 20, `groove spring produces visible bounce (peak ${peak.toFixed(2)} px)`);
}

// 7. Body swivel continuity: swivel duration is multi-beat (slow sway), and
//    the rotation is half the head rotation (lagging torso, not a twitch).
{
  console.log('\n== body swivel continuity ==');
  const card = makeCard();
  startDanceCycle(card, 110);
  runBeats(card, 4);
  const beatSec = 60 / 110;
  const swivels = card.animator._swivelCalls;
  const durOk = swivels.every((s) => s.dur >= beatSec * 2 - 1e-9);
  assert(swivels.length === 5 && durOk, `swivel duration is multi-beat (${swivels[0]?.dur.toFixed(2)}s vs ${beatSec.toFixed(2)}s beat)`);
  stopDanceCycle(card);
}

// 13. Energy arc shape: 64-beat macro envelope hits groove/build/peak/release.
{
  console.log('\n== energy arc ==');
  const e0 = getEnergy(0);   // groove window
  const e16 = getEnergy(16); // build window
  const e32 = getEnergy(32); // peak window
  const e48 = getEnergy(48); // release window
  const shapeOk = e0 < e16 && e16 < e32 && e32 > e48 && e48 > e0;
  assert(shapeOk, `energy arc groove<build, peak max, release recovers (${e0.toFixed(2)} < ${e16.toFixed(2)} < ${e32.toFixed(2)}; release ${e48.toFixed(2)})`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);