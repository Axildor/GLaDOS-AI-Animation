/**
 * behaviors/dance.js — BPM-synced choreography engine.
 *
 * Four tempo tiers (<90, <125, <160, 160+ BPM), each with 8 choreo blocks.
 * Every 16 beats a new random routine is chosen. Beat timing uses
 * performance.now() drift correction so moves stay locked to the music.
 *
 * Tracked resource names: 'dance-step', 'dance-led'.
 */

export function startDanceCycle(card, bpm) {
  const a = card.animator;
  stopDanceCycle(card);

  let dancePhase = 0;
  let currentRoutine = Math.floor(Math.random() * 8);
  const currentBpm = Math.max(60, Math.min(200, bpm));
  const beatMs = (60 / currentBpm) * 1000;
  const beatSec = beatMs / 1000;
  let expectedNextTick = performance.now() + beatMs;

  const step = () => {
    if (card._state !== 'dancing') return;

    if (dancePhase > 0 && dancePhase % 16 === 0) {
      let nextRoutine;
      do { nextRoutine = Math.floor(Math.random() * 8); } while (nextRoutine === currentRoutine);
      currentRoutine = nextRoutine;
    }

    const choreoBlock = currentRoutine;
    const isDownBeat = dancePhase % 2 === 0;
    const isQuadBeat = dancePhase % 4 === 0;
    const phaseMod4 = dancePhase % 4;
    const phaseMod8 = dancePhase % 8;
    const dirX = isDownBeat ? 1 : -1;

    a.setLEDs('#1DB954', '1');
    a.el.eyeHalo.style.opacity = (choreoBlock === 7) ? '0.8' : '0.5';
    a.el.eyeCenter.style.transform = 'scale(1.2)';
    a.setTimeout('dance-led', () => {
      if (card._state === 'dancing') {
        a.setLEDs('#1DB954', '0.15');
        a.el.eyeHalo.style.opacity = '0.05';
        a.el.eyeCenter.style.transform = 'scale(1)';
      }
    }, beatMs * 0.3);

    let r = 0, tx = 0, ty = 0, s = 1.0, lid = 0.0, ease = 'ease-in-out';
    let moveDur = beatSec;
    let bodyDur = beatSec * 2;

    const executeTick = () => {
      dancePhase++;
      const now = performance.now();
      if (now > expectedNextTick + beatMs) { expectedNextTick = now; } else { expectedNextTick += beatMs; }
      const delay = Math.max(0, expectedNextTick - now);
      a.setTimeout('dance-step', step, delay);
    };

    if (currentBpm < 90) {
      // Chill & Soulful: fluid, heavily relaxed movements
      moveDur = beatSec * 2; bodyDur = beatSec * 4; ease = 'ease-in-out'; lid = 0.4;
      if (choreoBlock === 0) { r = isQuadBeat ? 8 : -8; tx = isQuadBeat ? 5 : -5; ty = 2; }
      else if (choreoBlock === 1) { r = 0; tx = 0; ty = isQuadBeat ? 15 : -5; }
      else if (choreoBlock === 2) { r = Math.sin(dancePhase * Math.PI / 2) * 6; tx = Math.sin(dancePhase * Math.PI / 2) * 5; ty = Math.cos(dancePhase * Math.PI / 4) * 8 + 4; }
      else if (choreoBlock === 3) { r = (phaseMod8 < 4) ? 10 : -10; tx = (phaseMod8 < 4) ? 4 : -4; ty = 5; }
      else if (choreoBlock === 4) { r = Math.sin(dancePhase * Math.PI / 4) * 12; tx = 0; ty = 0; }
      else if (choreoBlock === 5) { r = isQuadBeat ? 4 : -4; tx = 0; ty = isQuadBeat ? 12 : 2; s = isQuadBeat ? 1.03 : 1.0; }
      else if (choreoBlock === 6) { r = (phaseMod8 === 0) ? 12 : (phaseMod8 === 4) ? -6 : 0; tx = r * 0.5; ty = 8; }
      else { r = 0; tx = 0; ty = 2; s = 1.05; lid = 0.5 + Math.sin(dancePhase * Math.PI / 2) * 0.3; }
      if (!isDownBeat) return executeTick();
    } else if (currentBpm < 125) {
      // Groovy & Pop: confident and bouncy
      moveDur = beatSec * 0.8; ease = 'cubic-bezier(0.34, 1.06, 0.64, 1)'; lid = 0.2;
      if (choreoBlock === 0) { r = isDownBeat ? 7 : -7; ty = isDownBeat ? 8 : -2; s = isDownBeat ? 1.02 : 1.0; }
      else if (choreoBlock === 1) { const side = (phaseMod4 < 2) ? 1 : -1; r = side * 8; tx = side * 4; ty = isDownBeat ? 10 : 2; }
      else if (choreoBlock === 2) { r = (phaseMod4 === 0) ? 10 : (phaseMod4 === 2) ? -10 : 0; ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 12 : 0; ease = 'ease-in-out'; }
      else if (choreoBlock === 3) { r = [10, 5, -10, -5][phaseMod4]; ty = [0, 8, 0, 8][phaseMod4]; }
      else if (choreoBlock === 4) { r = 0; tx = isDownBeat ? 8 : -8; ty = 4; }
      else if (choreoBlock === 5) { r = isDownBeat ? 10 : -10; tx = isDownBeat ? 5 : -5; ty = isDownBeat ? 10 : -5; }
      else if (choreoBlock === 6) { r = dirX * 6; ty = !isDownBeat ? 14 : 0; s = !isDownBeat ? 1.04 : 1.0; }
      else { const side = (dancePhase % 3 === 0) ? -1 : 1; r = side * 8; ty = isDownBeat ? 8 : 0; }
    } else if (currentBpm < 160) {
      // Upbeat & Club: sharp, high-energy snaps
      moveDur = beatSec * 0.6; ease = 'cubic-bezier(0.25, 0.8, 0.25, 1)'; lid = isDownBeat ? 0.1 : 0.0;
      if (choreoBlock === 0) { r = isDownBeat ? 12 : -12; tx = isDownBeat ? 6 : -6; ty = isDownBeat ? 10 : -8; s = 1.03; }
      else if (choreoBlock === 1) { r = 0; tx = [8, 0, -8, 0][phaseMod4]; ty = isDownBeat ? 5 : -5; if (phaseMod4 === 3) lid = 0.6; }
      else if (choreoBlock === 2) { r = isDownBeat ? 5 : -5; ty = isDownBeat ? 5 : -2; s = 1.0 + (phaseMod4 * 0.03); lid = 0.4 - (phaseMod4 * 0.1); }
      else if (choreoBlock === 3) { r = isDownBeat ? 15 : -15; tx = isDownBeat ? 5 : -5; ty = 8; }
      else if (choreoBlock === 4) { r = [10, 10, -10, -10][phaseMod4]; tx = [5, 5, -5, -5][phaseMod4]; ty = [8, -2, 8, -2][phaseMod4]; }
      else if (choreoBlock === 5) { r = dirX * 10; ty = isDownBeat ? 12 : 4; s = 1.02; moveDur = beatSec * 0.4; ease = 'linear'; }
      else if (choreoBlock === 6) { r = (phaseMod4 === 1 || phaseMod4 === 3) ? 0 : (phaseMod4 === 0 ? 12 : -12); ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 14 : -2; }
      else { r = isDownBeat ? 12 : 12; tx = isDownBeat ? 8 : 8; ty = isDownBeat ? 8 : -4; if (isDownBeat) moveDur = beatSec * 0.1; else moveDur = beatSec * 0.8; }
      if (isDownBeat && choreoBlock !== 2) a.setPupil((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
    } else {
      // Intense & Hardcore: aggressive and chaotic
      moveDur = beatSec * 0.8; ease = 'linear'; lid = isQuadBeat ? 0.4 : 0.0;
      if (choreoBlock === 0) { r = 0; tx = 0; ty = isDownBeat ? 20 : -10; s = isDownBeat ? 1.08 : 0.95; ease = 'ease-out'; }
      else if (choreoBlock === 1) { r = (Math.random() - 0.5) * 30; tx = (Math.random() - 0.5) * 15; ty = (Math.random() - 0.5) * 15; moveDur = beatSec * 0.5; }
      else if (choreoBlock === 2) { r = isDownBeat ? 18 : -18; tx = isDownBeat ? 10 : -10; ty = 12; }
      else if (choreoBlock === 3) { r = isDownBeat ? 10 : -10; tx = (Math.random() - 0.5) * 20; ty = 15; s = 1.1; a.el.eyeHalo.style.opacity = '0.8'; }
      else if (choreoBlock === 4) { r = isDownBeat ? 25 : -25; tx = isDownBeat ? 15 : -15; ty = isDownBeat ? 15 : -15; }
      else if (choreoBlock === 5) { r = 0; tx = 0; ty = isDownBeat ? 12 : 2; moveDur = beatSec * 0.3; }
      else if (choreoBlock === 6) { r = Math.sin(dancePhase * Math.PI) * 20; tx = Math.sin(dancePhase * Math.PI) * 12; ty = Math.cos(dancePhase * Math.PI / 2) * 15 + 5; }
      else {
        if (phaseMod4 === 0) { r = 15; ty = 10; s = 1.1; moveDur = beatSec * 0.1; }
        else { r = 15; ty = 10; s = 1.1; moveDur = beatSec * 1.5; }
        a.el.eyeCenter.setAttribute('fill', (dancePhase % 2 === 0) ? '#ff0000' : '#ffffff');
      }
      a.setPupil((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
    }

    a.setHead(r, tx, ty, s, moveDur, ease);
    a.setBodySwivel(r * -0.8, 1, bodyDur);
    a.setBaseLid(lid, beatSec * 0.5);
    executeTick();
  };

  step();
}

export function stopDanceCycle(card) {
  card.animator.clearTimeout('dance-step');
  card.animator.clearTimeout('dance-led');
}