/**
 * behaviors/dance.js — BPM-synced dance EXECUTION engine (phrase-driven).
 *
 * Choreography (what pose on which beat) lives in behaviors/choreography.js:
 * 16-beat phrases with establish/develop/resolve arcs, a per-tier transition
 * graph, a 64-beat energy arc, seeded determinism, and the GLaDOS physical
 * laws (gravity dip, pendulum coupling, torso lag, on-beat reversals,
 * personality lids). This module only EXECUTES that choreography:
 *
 *  - Beat timing uses performance.now() drift correction so moves stay
 *    locked to the music.
 *  - Groove spring layer (head-groove wrapper): continuous Y-bob driven by
 *    the shared damped oscillator; velocity is injected every beat
 *    (downbeats harder, tier 0 downbeats only) and at half-beat syncopation
 *    accents for tiers >= 125 BPM... er, >= 90 BPM (tier 1+).
 *  - Keyframed pose moves (WAAPI on the head): two move styles —
 *      · HIT moves: anticipation -> overshoot hit -> settle (downbeats),
 *        direct ease-in-out through a soft overshoot on offbeats.
 *      · FLOW moves: plain two-keyframe glide with ease-in-out, spanning
 *        up to ~1.9 beats (chill tier, release phrases, resolve handoffs).
 *  - Bellows pump is GRAVITY-COUPLED: the phrase's pump value compresses on
 *    the downbeat dip and releases on the rise (no flat per-tier pump).
 *  - Phrase driver: every 16 beats the graph walker picks the next phrase
 *    (energy-gated, seeded); beats 13-15 of each phrase resolve toward the
 *    next phrase's entry pose — a choreographed handoff, no damper needed.
 *
 * Smoothness guarantees (the anti-jerkiness contract):
 *  1. No move is ever cancelled mid-flight without a live-pose reseed: the
 *     next move starts from where the head ACTUALLY is (readHeadPose) whenever
 *     the previous move was a flow move that outlived its beat.
 *  2. Hit moves always finish inside the beat (<= 0.95x) so the head never
 *     freezes dead between beats.
 *  3. Phrase switches ease through the resolve handoff instead of jumping
 *     to the new phrase's full pose.
 *
 * Tracked resource names: 'dance-step', 'dance-led', 'dance-sync',
 * 'dance-sync-led', 'dance-groove-raf', 'head-keyframes' (WAAPI).
 */

import { createSpring } from './spring.js';
import {
  getEnergy, pickNextPhrase, phraseVariant, getPhraseEntry, getBeatPose,
} from './choreography.js';

/**
 * Read the head's live pose [rot, tx, ty, scale] from its computed transform.
 * Used to seed choreography so a (re)start — or the move after a flow move
 * that was cut short — eases from where the head actually is instead of
 * snapping to a stale target. Defensive: returns neutral in stub
 * environments where getComputedStyle is unavailable.
 */
function readHeadPose(a) {
  try {
    const t = getComputedStyle(a.el.head).transform;
    if (!t || t === 'none') return [0, 0, 0, 1];
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 1];
    const [m11, m12, , , e, f] = m[1].split(',').map(Number);
    const scale = Math.sqrt(m11 * m11 + m12 * m12) || 1;
    const rot = (Math.atan2(m12, m11) * 180) / Math.PI;
    return [rot, e, f, scale];
  } catch (err) {
    return [0, 0, 0, 1];
  }
}

export function startDanceCycle(card, bpm) {
  const a = card.animator;
  stopDanceCycle(card);

  let dancePhase = 0;
  const currentBpm = Math.max(60, Math.min(200, bpm));
  const beatMs = (60 / currentBpm) * 1000;
  const beatSec = beatMs / 1000;
  let expectedNextTick = performance.now() + beatMs;

  const tierIdx = currentBpm < 90 ? 0 : currentBpm < 125 ? 1 : currentBpm < 160 ? 2 : 3;

  // ---- Phrase driver state ----
  // The dance always opens on phrase 0 (the tier's base groove move) — a
  // musical establish — then walks the transition graph from there.
  let phraseId = 0;
  let phraseCount = 0;
  let variant = phraseVariant(tierIdx, phraseId, phraseCount);
  let nextPhraseId = null; // picked at beat 12 so beats 13-15 can resolve

  // ---- Groove spring layer (continuous organic bob on head-groove) ----
  // Spring period ~2 beats so each injected beat kick produces one visible
  // bounce that decays into the next. Damping 0.55: the bob sways instead of
  // wobbling — a bouncy spring fighting the snappy pose hits reads as jerky.
  const grooveOmega = Math.max(0.08, Math.min(0.3, (2 * Math.PI * 16.666) / (beatMs * 2)));
  const groove = createSpring({ omega: grooveOmega, dampingRatio: 0.55, settleThreshold: 0.05 });
  // Peak amplitude ~= velocity / omega; scale by tier (calmer tiers bob less).
  const kickDown = (4 + tierIdx * 2) * grooveOmega;
  const kickOff = kickDown * 0.55;

  let lastGrooveTime = performance.now();
  const grooveLoop = (now) => {
    if (card._state !== 'dancing') return;
    let frameTime = now - lastGrooveTime;
    lastGrooveTime = now;
    if (frameTime > 100) frameTime = 16.666;
    // Bop hold: freeze the groove layer entirely — no physics steps, no
    // transform writes — so the residual bob doesn't keep animating the
    // head while the tap bop owns it. The RAF stays alive (just updating
    // lastGrooveTime) so releasing the hold needs no loop restart and the
    // spring resumes from exactly where it froze.
    if (!card._danceHeld) {
      groove.step(frameTime);
      if (a.el.headGroove) {
        a.el.headGroove.style.transform = `translate3d(0, ${groove.position.toFixed(2)}px, 0)`;
      }
    }
    a.requestRaf('dance-groove-raf', grooveLoop);
  };
  a.requestRaf('dance-groove-raf', grooveLoop);

  // ---- Keyframed pose layer state ----
  // Seed from the head's live pose: on dance start (or a mid-dance restart)
  // the first move must ease from where the head actually is, not teleport
  // to a stale neutral pose.
  let lastPose = readHeadPose(a);
  const overshoot = [1.08, 1.12, 1.18, 1.25][tierIdx];    // hit overshoot factor
  const windupFrac = [0.3, 0.25, 0.2, 0.15][tierIdx];     // wind-up share of the move
  const eyeHitScale = [1.06, 1.1, 1.18, 1.25][tierIdx];   // tier-scaled eye pulse

  let wasHeld = false;
  // True when the previous pose move was a FLOW move (duration >= one beat).
  // Such a move is still in flight when the next beat fires, so the next
  // move must reseed from the head's LIVE pose (getComputedStyle) instead of
  // the stale recorded target — otherwise the head snaps mid-glide.
  let prevMoveFlow = false;

  const step = () => {
    if (card._state !== 'dancing') return;

    const executeTick = () => {
      dancePhase++;
      const now = performance.now();
      if (now > expectedNextTick + beatMs) { expectedNextTick = now; } else { expectedNextTick += beatMs; }
      const delay = Math.max(0, expectedNextTick - now);
      a.setTimeout('dance-step', step, delay);
    };

    // Bop hold: while a tap bop owns the head, the beat clock keeps ticking
    // (executeTick above) so phase stays synced to the music, but every
    // visual move is skipped — groove kicks, LED/eye/bellows accents,
    // syncopation, pose keyframes, body swivel, lid. The groove layer is
    // frozen by the groove RAF loop. bop.js clears the flag at the meld
    // point (tap_bop_resume threshold) or on settle.
    if (card._danceHeld) { wasHeld = true; executeTick(); return; }

    // Hold just released: re-seed lastPose from the head's live (frozen)
    // transform so the first post-bop move eases from where the head
    // actually is instead of teleporting to the stale pre-bop target.
    if (wasHeld) {
      lastPose = readHeadPose(a);
      wasHeld = false;
      prevMoveFlow = false;
    }

    const b = dancePhase % 16; // beat within the phrase

    // Phrase rotation every 16 beats: walk the transition graph. The next
    // phrase was already picked at beat 12 (so beats 13-15 resolved toward
    // its entry pose) — here we just step into it.
    if (b === 0 && dancePhase > 0 && nextPhraseId !== null) {
      phraseId = nextPhraseId;
      phraseCount++;
      variant = phraseVariant(tierIdx, phraseId, phraseCount);
      nextPhraseId = null;
    }

    const isDownBeat = b % 2 === 0;
    const energy = getEnergy(dancePhase);

    // Beat kick into the groove spring: strong on the downbeat, softer
    // offbeat. Tier 0 kicks on downbeats ONLY — its offbeat pose glide plus
    // an offbeat spring kick double-bobbed the head (bob-without-dancing).
    if (currentBpm >= 90 || isDownBeat) {
      groove.injectVelocity(isDownBeat ? kickDown : kickOff);
    }

    // ---- Choreography: this beat's pose from the phrase engine ----
    // At beat 12 the graph walker picks the NEXT phrase (energy-gated,
    // seeded); beats 13-15 then resolve toward its entry pose.
    if (b === 12 && nextPhraseId === null) {
      nextPhraseId = pickNextPhrase(tierIdx, phraseId, getEnergy(dancePhase + 16), phraseCount);
    }
    const nextEntry = (nextPhraseId !== null && b >= 13)
      ? getPhraseEntry(tierIdx, nextPhraseId) : null;
    const move = getBeatPose(tierIdx, phraseId, b, variant, energy, nextEntry);

    a.setLEDs('#1DB954', '1');
    // Eye halo: peak phrases burn brighter (personality law).
    a.el.eyeHalo.style.opacity = move.halo ? String(move.halo) : '0.5';
    // Eye pulse: #eye-center carries a short CSS transform transition (see
    // template.js), so this write pulses the pupil organically instead of
    // snapping it open/closed every beat.
    a.el.eyeCenter.style.transform = `scale(${eyeHitScale})`;
    // Bellows pump: GRAVITY-COUPLED — the phrase compresses on the downbeat
    // dip and releases (0) on the rise. No flat per-tier pump.
    a.setBellows(move.pump, 0.12);
    a.setTimeout('dance-led', () => {
      if (card._state === 'dancing') {
        a.setLEDs('#1DB954', '0.15');
        a.el.eyeHalo.style.opacity = '0.05';
        a.el.eyeCenter.style.transform = 'scale(1)';
        a.setBellows(0, 0.3);
      }
    }, beatMs * 0.3);

    // Syncopation: half-beat "and" accent for tier 1+ — a small
    // counter-kick, pupil dart, and LED flicker keep it grooving, not
    // marching. Counter-kick softened (0.35 of the offbeat kick): a hard
    // reverse-kick mid-bounce jerked the groove spring against itself.
    if (tierIdx >= 1) {
      a.setTimeout('dance-sync', () => {
        if (card._state !== 'dancing') return;
        groove.injectVelocity(-kickOff * 0.35);
        a.setPupil((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
        a.setLEDs('#1DB954', '0.5');
        a.setTimeout('dance-sync-led', () => {
          if (card._state === 'dancing') a.setLEDs('#1DB954', '0.15');
        }, beatMs * 0.15);
      }, beatMs * 0.5);
    }

    // Move-duration clamp: hit moves must finish before the next beat
    // (<= 0.95x) so they are never cancelled mid-flight and the head never
    // freezes dead between beats. Flow moves are ALLOWED to outlive the
    // beat (up to 1.9x) — continuous travel — and the prevMoveFlow reseed
    // below keeps the next move snap-free.
    let moveDur = move.durBeats * beatSec;
    if (move.flow) {
      moveDur = Math.min(moveDur, beatSec * 1.9);
    } else {
      moveDur = Math.min(moveDur, beatSec * 0.95);
    }

    // Live-pose reseed: if the previous move was a flow move it was still in
    // flight when this beat fired — the head is somewhere between the
    // recorded lastPose and its target. Read the ACTUAL pose so the new move
    // starts where the head is (no mid-glide snap). Hit moves always finish
    // inside their beat, so the recorded target stays exact for them.
    if (prevMoveFlow) {
      lastPose = readHeadPose(a);
    }

    // Keyframed move construction:
    //  - FLOW: two-keyframe ease-in-out glide from the live pose.
    //  - HIT downbeat: wind up opposite the target (anticipation), snap
    //    through a SOFT overshoot hit, settle on the target.
    //  - HIT offbeat: direct ease-in-out through a soft overshoot.
    const target = [move.r, move.tx, move.ty, move.s];
    let frames;
    if (move.flow) {
      frames = [
        { pose: lastPose, offset: 0, easing: 'ease-in-out' },
        { pose: target },
      ];
    } else {
      const hitPose = [move.r * overshoot, move.tx * overshoot, move.ty * overshoot, 1 + (move.s - 1) * overshoot];
      if (isDownBeat) {
        const wScale = [0.5, 0.3, 0.2, 0.15][tierIdx];
        const windup = [0.22, 0.3, 0.38, 0.45][tierIdx];
        const anti = [
          -move.r * windup * wScale, -move.tx * windup * wScale,
          -move.ty * windup * wScale, 1 - (move.s - 1) * windup * wScale * 0.5,
        ];
        frames = [
          { pose: lastPose, offset: 0, easing: 'ease-in' },
          { pose: anti, offset: windupFrac, easing: 'ease-out' },
          { pose: hitPose, offset: windupFrac + (1 - windupFrac) * 0.55, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
          { pose: target },
        ];
      } else {
        frames = [
          { pose: lastPose, offset: 0, easing: 'ease-in-out' },
          { pose: hitPose, offset: 0.55, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
          { pose: target },
        ];
      }
    }
    // Thread the tracked lastPose through as the frozen transform so the
    // cancel-snap guard in playAnim() doesn't need a getComputedStyle()
    // forced style recalc on every beat (expensive on tablet CPUs).
    a.setHeadKeyframes(frames, moveDur, lastPose);
    lastPose = target;
    prevMoveFlow = move.flow;

    // Pupil dart accent (seeded from the phrase engine, not Math.random).
    if (move.dart) a.setPupil(move.dart[0], move.dart[1]);

    // Body swivel (TORSO LAG law): half the head rotation over a LONG
    // ease-in-out sway (3 beats) — the torso lags behind the head like a
    // slow groove instead of twitching with every beat.
    a.setBodySwivel(move.r * -0.5, 1, beatSec * 3);

    // Chill lids (PERSONALITY law): the phrase supplies the lid attitude;
    // a relaxed floor keeps a whisper of droop so accents still read.
    const lid = Math.max(move.lid, currentBpm < 125 ? 0.15 : 0.08);
    a.setBaseLid(lid, beatSec * 0.5);
    executeTick();
  };

  step();
}

export function stopDanceCycle(card) {
  const a = card.animator;
  a.clearTimeout('dance-step');
  a.clearTimeout('dance-led');
  a.clearTimeout('dance-sync');
  a.clearTimeout('dance-sync-led');
  // Freeze the live head pose into the inline style BEFORE cancelling the
  // keyframe animation: cancelling a fill:'forwards' WAAPI animation makes
  // the element fall back to its stale base transform for a frame (snap).
  try {
    const t = getComputedStyle(a.el.head).transform;
    if (t && t !== 'none') {
      a.el.head.style.transition = 'none';
      a.el.head.style.transform = t;
    }
  } catch (err) { /* stub environments */ }
  a.cancelAnim('head-keyframes');
  a.resetGroove();
  a.setBellows(0, 0.3);
}