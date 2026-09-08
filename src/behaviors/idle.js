/**
 * behaviors/idle.js — Weighted idle behavior engine, lid loop, pupil darting.
 *
 * All functions take `card` (the GladosCard instance) which exposes:
 *   card.animator  — GladosAnimator (motion primitives + tracked scheduling)
 *   card._state    — current internal state ('idle' | 'listening' | ...)
 *   card.config    — sanitized config
 *
 * Tracked resource names used here: 'idle-behavior', 'idle-pupil',
 * 'idle-blink', 'idle-glitch', 'lid-loop'.
 */

// ---- Lid behavior loop (double rAF kinetic reflow companion) ----

function lidLoop(card, now) {
  const a = card.animator;
  const st = card._state; // post-G9 tracker
  if (st !== 'idle' && st !== 'processing') return; // state changed -> loop exits, applyState restarts it
  if (now >= a._nextLidAt) {
    if (st === 'idle') {
      const val = Math.max(0, Math.min(1, a.currentBaseLid + (Math.random() - 0.5) * 0.15));
      a.setLid(val, 0.5 + Math.random() * 0.8);
      a._nextLidAt = now + 1500 + Math.random() * 2500;
    } else {
      const val = 0.5 + Math.random() * 0.35;
      a.setLid(val, 0.15 + Math.random() * 0.25);
      a._nextLidAt = now + 120 + Math.random() * 280;
    }
  }
  a.requestRaf('lid-loop', (t) => lidLoop(card, t));
}

export function startLidBehavior(card) {
  stopLidBehavior(card);
  card.animator._nextLidAt = 0;
  card.animator.requestRaf('lid-loop', (now) => lidLoop(card, now));
}

export function stopLidBehavior(card) {
  card.animator.cancelRaf('lid-loop');
}

// ---- Weighted idle behaviors ----

const IDLE_BEHAVIORS = [
  {
    name: 'passive',
    exec(card, a) { a.setHead(0, 0, 0, 1.0, 2.4); a.setBaseLid(0, 1.0); a.resetBodySwivel(); },
    min: 6000, max: 13000, weight: 4,
  },
  {
    name: 'scan_right',
    exec(card, a) { a.setHead(12, 0, -5, 0.98, 1.4); a.setBaseLid(0, 1.0); a.setBodySwivel(-2, 1, 1.8); },
    min: 3500, max: 7000, weight: 1.5,
  },
  {
    name: 'scan_left',
    exec(card, a) { a.setHead(-12, 0, -5, 0.98, 1.4); a.setBaseLid(0, 1.0); a.setBodySwivel(2, 1, 1.8); },
    min: 3500, max: 7000, weight: 1.5,
  },
  {
    name: 'curious',
    exec(card, a) { a.setHead(8, 0, -20, 1.05, 1.2); a.setBaseLid(0, 0.8); a.setBodySwivel(-2, 1, 1.6); },
    min: 4000, max: 8000, weight: 2,
  },
  {
    name: 'contemptuous',
    exec(card, a) {
      a.setHead(-6, 0, 15, 0.95, 1.8); a.setBaseLid(0.65, 1.0); a.setBodySwivel(1.5, 1, 2.0);
      a.setTimeout('idle-blink', () => { if (card._state === 'idle') a.setBaseLid(0, 1.5); }, 1500);
    },
    min: 5000, max: 10000, weight: 2,
  },
  {
    name: 'alert',
    exec(card, a) { a.setHead(0, 0, -25, 1.08, 0.28); a.setBaseLid(0, 0.2); a.setBodySwivel(-1, 1, 0.4); },
    min: 1500, max: 3000, weight: 1,
  },
  {
    name: 'bored',
    exec(card, a) {
      a.setHead(2, 0, 20, 0.96, 2.8); a.setBaseLid(0.7, 1.5); a.setBodySwivel(1, 1, 3.0);
      a.setTimeout('idle-blink', () => { if (card._state === 'idle') a.setBaseLid(0, 1.5); }, 1500);
    },
    min: 7000, max: 14000, weight: 1.5,
  },
  {
    name: 'full_swivel',
    exec(card, a) {
      a.setBodySwivel(-6, 0.96, 2.5);
      a.setTimeout('idle-blink', () => { a.setHead(6, 0, -3, 1.02, 1.2); a.setBaseLid(0, 0.8); }, 600);
    },
    min: 4000, max: 8000, weight: 0.8,
  },
  {
    name: 'glitch',
    exec(card, a) {
      let count = 0, lastTime = 0;
      a.cancelRaf('idle-glitch');
      const glitchLoop = (timestamp) => {
        if (!lastTime) lastTime = timestamp;
        if (timestamp - lastTime > 60) {
          lastTime = timestamp;
          if (card._state !== 'idle' || count > 12) {
            a.cancelRaf('idle-glitch');
            if (card._state === 'idle') {
              a.el.eyeHalo.setAttribute('fill', 'url(#haloGradIdle)');
              a.el.eyeCenter.setAttribute('fill', '#ffcc00');
              a.setHead(0, 0, 0, 1.0, 0.4);
            }
            return;
          }
          a.setHead((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 1.0, 0.05, 'linear');
          if (count % 2 === 0) {
            a.el.eyeHalo.setAttribute('fill', '#110000');
            a.el.eyeCenter.setAttribute('fill', '#884400');
          } else {
            a.el.eyeHalo.setAttribute('fill', '#ffb800');
            a.el.eyeCenter.setAttribute('fill', '#ffffff');
          }
          count++;
        }
        a.requestRaf('idle-glitch', glitchLoop);
      };
      a.requestRaf('idle-glitch', glitchLoop);
    },
    min: 4000, max: 7000, weight: 0.3,
  },
];

// ---- Pupil darting + behavior scheduler ----

function dartPupil(card) {
  if (card._state === 'idle') {
    const max = 7;
    card.animator.setPupil((Math.random() - 0.5) * max * 2, (Math.random() - 0.5) * max * 2);
    card.animator.setTimeout('idle-pupil', () => dartPupil(card), 600 + Math.random() * 2500);
  }
}

function runNextIdleBehavior(card) {
  if (card._state !== 'idle') return;
  const a = card.animator;
  let r = Math.random() * IDLE_BEHAVIORS.reduce((s, b) => s + b.weight, 0);
  let chosen = IDLE_BEHAVIORS[0];
  for (const b of IDLE_BEHAVIORS) {
    r -= b.weight;
    if (r <= 0) { chosen = b; break; }
  }
  try { chosen.exec(card, a); } catch (err) { /* behavior failure must never kill the cycle */ }
  a.setTimeout('idle-behavior', () => runNextIdleBehavior(card), chosen.min + Math.random() * (chosen.max - chosen.min));
}

export function startIdleCycle(card) {
  stopIdleCycle(card);
  dartPupil(card);
  card.animator.setTimeout('idle-behavior', () => runNextIdleBehavior(card), 2000 + Math.random() * 3000);
}

export function stopIdleCycle(card) {
  card.animator.clearTimeout('idle-behavior');
  card.animator.clearTimeout('idle-pupil');
  card.animator.clearTimeout('idle-blink');
  card.animator.cancelRaf('idle-glitch');
}