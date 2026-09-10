/**
 * behaviors/dance.js — BPM-synced dance EXECUTION engine (phrase-driven,
 * CSS-transition execution).
 *
 * Choreography (what pose on which beat) lives in behaviors/choreography.js:
 * 16-beat phrases with establish/develop/resolve arcs, a per-tier transition
 * graph, a 64-beat energy arc, seeded determinism, and the GLaDOS physical
 * laws (gravity dip, pendulum coupling, torso lag, on-beat reversals,
 * personality lids). This module only EXECUTES that choreography.
 *
 * EXECUTION MODEL — declarative CSS transitions (the legacy card's model):
 * every beat computes its pose from the phrase engine and issues ONE
 * setHead() write (transition + transform). The browser compositor
 * interpolates the move even when the main thread janks, which is what kept
 * the legacy card smooth on Android WebView (Tab S6 Lite) at high BPM. There
 * is deliberately NO per-frame JS in the dance path:
 *
 *  - No WAAPI keyframes: the old per-beat cancel/create churn, cancel-snap
 *    freeze, and getComputedStyle() live-pose reseeds are gone. CSS
 *    transitions retarget smoothly from the head's CURRENT pose by design,
 *    which eliminates the entire mid-flight-snap problem class.
 *  - No groove spring: a continuous RAF-driven bob is phase-shifted from the
 *    beat and never lands on it — it fought the choreography's PRECISION law
 *    (deliberate, on-beat reversals) and cost a per-frame main-thread loop.
 *    The organic feel comes from the choreography itself: GRAVITY dips,
 *    bellows compression, and FLOW glides.
 *  - Move styles map to easing + duration:
 *      · HIT moves: short duration (<= 0.95x beat) so they finish before the
 *        next beat; downbeats use an overshoot curve (windup->snap->settle
 *        character in a single easing), offbeats a snappy ease-out.
 *      · FLOW moves: long duration (up to 1.9x beat) with ease-in-out —
 *        continuous travel; the next beat's transition retargets from the
 *        live pose with no snap.
 *  - Beat timing uses performance.now() drift correction so moves stay
 *    locked to the music.
 *  - Bop hold: while a tap bop owns the head (_danceHeld) the beat clock
 *    keeps ticking (phase stays synced) but every visual write is skipped;
 *    the first post-hold setHead() retargets from the frozen pose.
 *
 * Tracked resource names: 'dance-step', 'dance-led', 'dance-sync'.
 */

import {
  getEnergy, pickNextPhrase, phraseVariant, getPhraseEntry, getBeatPose,
} from './choreography.js';

// Easing vocabulary (single-write move character):
//  - Downbeat HIT: overshoot curve — eases past the target then settles,
//    approximating the old windup->hit->settle keyframe shape.
//  - Offbeat HIT: fast attack, soft landing.
//  - FLOW: plain ease-in-out glide.
// Exported for the verify script's easing-contract assertions.
export const DANCE_EASINGS = {
  hitDown: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  hitOff: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  flow: 'ease-in-out',
};
const HIT_DOWN_EASE = DANCE_EASINGS.hitDown;
const HIT_OFF_EASE = DANCE_EASINGS.hitOff;
const FLOW_EASE = DANCE_EASINGS.flow;

export function startDanceCycle(card, bpm) {
  const a = card.animator;
  stopDanceCycle(card);

  let dancePhase = 0;
  const currentBpm = Math.max(60, Math.min(200, bpm));
  const beatMs = (60 / currentBpm) * 1000;
  const beatSec = beatMs / 1000;
  let expectedNextTick = performance.now() + beatMs;

  const tierIdx = currentBpm < 90 ? 0 : currentBpm < 125 ? 1 : currentBpm < 160 ? 2 : 3;
  const eyeHitScale = [1.06, 1.1, 1.18, 1.25][tierIdx];   // tier-scaled eye pulse

  // ---- Phrase driver state ----
  // The dance always opens on phrase 0 (the tier's base groove move) — a
  // musical establish — then walks the transition graph from there.
  let phraseId = 0;
  let phraseCount = 0;
  let variant = phraseVariant(tierIdx, phraseId, phraseCount);
  let nextPhraseId = null; // picked at beat 12 so beats 13-15 can resolve

  // Redundant-write guards: the LED color never changes during a dance and
  // the halo only changes on peak phrases — skip identical style writes.
  let lastLedOpacity = null;
  let lastHalo = null;

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
    // visual move is skipped. bop.js clears the flag at the meld point
    // (tap_bop_resume threshold) or on settle; the first post-hold setHead()
    // then retargets from the head's frozen pose with no snap.
    if (card._danceHeld) { executeTick(); return; }

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

    // ---- Choreography: this beat's pose from the phrase engine ----
    // At beat 12 the graph walker picks the NEXT phrase (energy-gated,
    // seeded); beats 13-15 then resolve toward its entry pose.
    if (b === 12 && nextPhraseId === null) {
      nextPhraseId = pickNextPhrase(tierIdx, phraseId, getEnergy(dancePhase + 16), phraseCount);
    }
    const nextEntry = (nextPhraseId !== null && b >= 13)
      ? getPhraseEntry(tierIdx, nextPhraseId) : null;
    const move = getBeatPose(tierIdx, phraseId, b, variant, energy, nextEntry);

    // LED/eye accents (redundant-write guarded — identical values are skipped).
    if (lastLedOpacity !== '1') { a.setLEDs('#1DB954', '1'); lastLedOpacity = '1'; }
    // Eye halo: peak phrases burn brighter (personality law).
    const halo = move.halo ? String(move.halo) : '0.5';
    if (lastHalo !== halo) { a.el.eyeHalo.style.opacity = halo; lastHalo = halo; }
    // Eye pulse: #eye-center carries a short CSS transform transition (see
    // template.js), so this write pulses the pupil organically instead of
    // snapping it open/closed every beat.
    a.el.eyeCenter.style.transform = `scale(${eyeHitScale})`;
    // Bellows pump: GRAVITY-COUPLED — the phrase compresses on the downbeat
    // dip and releases (0) on the rise. No flat per-tier pump.
    a.setBellows(move.pump, 0.12);
    a.setTimeout('dance-led', () => {
      if (card._state === 'dancing') {
        if (lastLedOpacity !== '0.15') { a.setLEDs('#1DB954', '0.15'); lastLedOpacity = '0.15'; }
        a.el.eyeHalo.style.opacity = '0.05';
        lastHalo = '0.05';
        a.el.eyeCenter.style.transform = 'scale(1)';
        a.setBellows(0, 0.3);
      }
    }, beatMs * 0.3);

    // Syncopation: half-beat "and" pupil accent for tier 1 only — at club/
    // hardcore tempos the pose hits already fill every beat, and an extra
    // half-beat timer per beat is main-thread work the tablet can't spare.
    if (tierIdx === 1) {
      a.setTimeout('dance-sync', () => {
        if (card._state !== 'dancing') return;
        a.setPupil((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
      }, beatMs * 0.5);
    }

    // Move-duration clamp: hit moves must finish before the next beat
    // (<= 0.95x) so the head always lands on the beat and never freezes dead
    // between beats. Flow moves are ALLOWED to outlive the beat (up to 1.9x)
    // — continuous travel — and the next beat's transition simply retargets
    // from wherever the head is (CSS transitions are snap-free by design).
    let moveDur = move.durBeats * beatSec;
    if (move.flow) {
      moveDur = Math.min(moveDur, beatSec * 1.9);
    } else {
      moveDur = Math.min(moveDur, beatSec * 0.95);
    }

    // THE move: one transition + one transform write. The compositor
    // interpolates off the main thread; retargeting mid-flight eases from
    // the head's CURRENT pose (no cancel, no snap, no style recalc).
    const ease = move.flow ? FLOW_EASE : (isDownBeat ? HIT_DOWN_EASE : HIT_OFF_EASE);
    a.setHead(move.r, move.tx, move.ty, move.s, moveDur, ease);

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
  // CSS transitions complete on their own — there is no WAAPI animation to
  // cancel and no fill:forwards snap. The head glides to its last target and
  // the next state's setHead() retargets it from there.
  a.setBellows(0, 0.3);
}