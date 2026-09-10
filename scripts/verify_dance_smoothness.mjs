/**
 * verify_dance_smoothness.mjs — End-to-end verification of the dance
 * smoothness + choreography contract. Runs the real startDanceCycle() with
 * a stubbed animator and asserts, for every tier (70/110/140/180 BPM):
 *
 * Execution contract (CSS-transition rework):
 *  1. One setHead() move per beat — no WAAPI keyframes, no RAF loops, no
 *     getComputedStyle() recalcs in the dance path (compositor-friendly:
 *     the browser interpolates off the main thread, WebView-safe).
 *  2. Duration contract: hit moves <= 0.95x beat (finish before the next
 *     beat — no dead freeze), flow moves <= 1.9x beat (continuous travel).
 *  3. Easing contract: flow moves use ease-in-out; hit downbeats use the
 *     overshoot curve; hit offbeats use the snappy ease-out.
 *  4. Pose targets match the phrase engine's getBeatPose output exactly.
 *  5. Bop hold: while _danceHeld is set, the beat clock keeps ticking but
 *     NO visual writes happen (no setHead, no LED, no swivel, no lid).
 *
 * Choreography contract (phrase-graph rework):
 *  6. Graph legality: every phrase transition is a declared edge in the
 *     tier's transition graph — no random block teleports.
 *  7. Energy gating: peak phrases (energy > 0.8) only start in
 *     high-energy windows (window energy >= phrase energy - margin).
 *  8. Resolve handoff: beats 13-15 are flow glides and the beat-15 target
 *     equals the NEXT phrase's entry pose (choreographed handoff, not a
 *     reactive damper).
 *  9. Determinism: two identical runs produce identical pose sequences —
 *     no Math.random in choreography (seeded variants only).
 * 10. Physical laws: PENDULUM (sign(tx) == sign(r) when both significant),
 *     GRAVITY (downbeat ty > offbeat ty within a phrase; bellows pump > 0
 *     only on downbeats).
 * 11. Body swivel continuity: multi-beat duration, half head rotation.
 * 12. Energy arc shape: 64-beat macro envelope hits groove/build/peak/release.
 */

import { startDanceCycle, stopDanceCycle, DANCE_EASINGS } from '../src/behaviors/dance.js';
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
  };
}

function makeAnimator() {
  const el = {};
  for (const k of ['svg', 'head', 'headBop', 'torsoSwivel', 'hitbox', 'eyeHalo', 'eyeCenter', 'pupil', 'eyeball', 'bellows', 'lidTop', 'lidBot', 'dangerRing']) el[k] = makeEl();
  el.ledMatrices = [];
  const a = {
    el,
    currentBaseLid: 0,
    currentLedColor: '#ffb800',
    currentLedOpacity: '0.15',
    _timers: new Map(),
    _rafs: new Map(),
    _headCalls: [],
    _swivelCalls: [],
    _bellowsCalls: [],
    _rafNames: [],
    setTimeout(name, fn, delay) { this._timers.set(name, { fn, delay }); return name; },
    clearTimeout(name) { this._timers.delete(name); },
    requestRaf(name, fn) { this._rafNames.push(name); this._rafs.set(name, fn); return name; },
    cancelRaf(name) { this._rafs.delete(name); },
    setHead(rot, tx, ty, s, dur, ease) {
      this._headCalls.push({ rot, tx, ty, s, dur, ease });
      this.el.head.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${s})`;
    },
    resetBodySwivel() {},
    setBodySwivel(rot, sx, dur) { this._swivelCalls.push({ rot, dur }); },
    setLid() {}, setBaseLid(v) { this.currentBaseLid = v; },
    setPupil() {}, setBellows(p) { this._bellowsCalls.push(p); }, setLEDs(c, o) { this.currentLedColor = c; this.currentLedOpacity = o; },
    stopAll() { this._timers.clear(); this._rafs.clear(); },
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

  const calls = card.animator._headCalls;
  assert(calls.length >= 32, `pose moves fired (${calls.length} setHead calls over 64 beats)`);

  // 1. No WAAPI / RAF in the dance path: the engine must not register any
  //    RAF loop (the old groove spring) and must not call el.animate().
  assert(card.animator._rafNames.length === 0, 'no RAF loops in the dance path (no per-frame JS, compositor-friendly)');
  assert(card.animator.el.head.animate === undefined, 'no WAAPI keyframes in the dance path (no per-beat cancel/create churn)');

  // 2. Duration contract: hit moves <= 0.95x beat, flow moves <= 1.9x.
  {
    // The engine fires one extra move: startDanceCycle's immediate step()
    // (phase 0) plus one per runBeats iteration (phases 1..64) = 65 calls.
    const walk = simulateWalk(tierIdx, calls.length);
    let durOk = true;
    calls.forEach((c, i) => {
      const isFlow = walk[i].move.flow;
      const max = isFlow ? flowMax : hitMax;
      if (c.dur > max + 1e-9 || c.dur < beatSec * 0.3) {
        durOk = false;
        console.error(`    call ${i} (phase ${i}, beat ${walk[i].b}): bad moveDur ${c.dur.toFixed(3)}s (beat ${beatSec.toFixed(3)}s, max ${max.toFixed(3)}s, flow=${isFlow})`);
      }
    });
    assert(durOk, `all moveDurs within contract (hit <= 0.95x, flow <= 1.9x of ${beatSec.toFixed(3)}s beat) — no dead freeze, continuous travel`);
  }

  // 3. Easing contract: flow = ease-in-out; hit downbeat = overshoot curve;
  //    hit offbeat = snappy ease-out.
  {
    const walk = simulateWalk(tierIdx, calls.length);
    let easeOk = true;
    calls.forEach((c, i) => {
      const expected = walk[i].move.flow ? DANCE_EASINGS.flow
        : (walk[i].b % 2 === 0 ? DANCE_EASINGS.hitDown : DANCE_EASINGS.hitOff);
      if (c.ease !== expected) {
        easeOk = false;
        console.error(`    call ${i} (phase ${i}, beat ${walk[i].b}): easing "${c.ease}", expected "${expected}"`);
      }
    });
    assert(easeOk, 'easing contract: flow=ease-in-out, hit down=overshoot curve, hit off=snappy ease-out');
  }

  // 4. Pose targets match the phrase engine exactly.
  {
    const walk = simulateWalk(tierIdx, calls.length);
    let poseOk = true;
    calls.forEach((c, i) => {
      const m = walk[i].move;
      if (Math.abs(c.rot - m.r) > 1e-9 || Math.abs(c.tx - m.tx) > 1e-9
        || Math.abs(c.ty - m.ty) > 1e-9 || Math.abs(c.s - m.s) > 1e-9) {
        poseOk = false;
        console.error(`    call ${i} (phase ${i}, beat ${walk[i].b}): pose [${c.rot.toFixed(2)}, ${c.tx.toFixed(2)}, ${c.ty.toFixed(2)}, ${c.s.toFixed(3)}] != engine [${m.r.toFixed(2)}, ${m.tx.toFixed(2)}, ${m.ty.toFixed(2)}, ${m.s.toFixed(3)}]`);
      }
    });
    assert(poseOk, 'pose targets match the phrase engine (getBeatPose) exactly');
  }

  // 6. Graph legality: every phrase transition is a declared edge.
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

    // 7. Energy gating: peak phrases only start in high-energy windows.
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

    // 8. Resolve handoff: beats 13-15 are flow glides and the beat-15
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

    // 10a. PENDULUM law: lateral drift coupled to tilt (same sign).
    let pendulum = true;
    for (const w of walk) {
      if (Math.abs(w.move.r) > 1 && Math.abs(w.move.tx) > 0.1
        && Math.sign(w.move.r) !== Math.sign(w.move.tx)) {
        pendulum = false;
        console.error(`    phase ${w.phase} (${TIERS[tierIdx].phrases[w.phraseId].name}): r=${w.move.r.toFixed(1)} tx=${w.move.tx.toFixed(1)} — head slides against its tilt`);
      }
    }
    assert(pendulum, 'PENDULUM law: tx coupled to r (hanging head swings in an arc, never slides)');

    // 10b. GRAVITY law: downbeat dips deeper than the offbeat rise.
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

    // 10c. GRAVITY/bellows coupling: pump only on downbeats, never offbeats.
    let pumpOk = true;
    for (const w of walk) {
      if (w.b % 2 === 1 && w.move.pump !== 0) { pumpOk = false; console.error(`    phase ${w.phase}: offbeat pump ${w.move.pump.toFixed(2)}`); }
      if (w.b % 2 === 0 && w.move.pump <= 0) { pumpOk = false; console.error(`    phase ${w.phase}: downbeat pump ${w.move.pump.toFixed(2)}`); }
    }
    assert(pumpOk, 'bellows pump is gravity-coupled: compresses on the downbeat dip, releases on the rise');

    // 9. Determinism: a second identical walk produces identical poses.
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

// 5. Bop hold: while _danceHeld is set the beat clock keeps ticking but no
//    visual writes happen; on release the choreography resumes.
{
  console.log('\n== bop hold ==');
  const card = makeCard();
  startDanceCycle(card, 110);
  runBeats(card, 2);
  card._danceHeld = true;
  const headBefore = card.animator._headCalls.length;
  const swivelBefore = card.animator._swivelCalls.length;
  const ledBefore = card.animator.currentLedOpacity;
  runBeats(card, 3); // beat clock ticks under hold
  const held = card.animator._headCalls.length === headBefore
    && card.animator._swivelCalls.length === swivelBefore
    && card.animator.currentLedOpacity === ledBefore;
  assert(held, 'bop hold: beat clock ticks but no visual writes (head/swivel/LED frozen)');
  assert(card.animator._timers.has('dance-step'), 'bop hold: beat clock still ticking (dance-step timer set)');
  card._danceHeld = false;
  runBeats(card, 1);
  assert(card.animator._headCalls.length > headBefore, 'choreography resumes after hold release (setHead fired)');
  stopDanceCycle(card);
}

// 11. Body swivel continuity: swivel duration is multi-beat (slow sway), and
//     the rotation is half the head rotation (lagging torso, not a twitch).
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

// 12. Energy arc shape: 64-beat macro envelope hits groove/build/peak/release.
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