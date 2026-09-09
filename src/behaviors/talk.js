/**
 * behaviors/talk.js — Responding-state talk animation.
 * Cycles through TALK_MOVES while AXiDOS "speaks".
 *
 * Tracked resource name: 'talk-step'.
 */

const TALK_MOVES = [
  { r: -10, tx: -8, ty: -18, s: 1.02, dur: 1.8, lid: 0.1, px: 0, py: -2 },
  { r: 4, tx: 0, ty: 16, s: 1.08, dur: 1.2, lid: 0.85, px: 0, py: 4 },
  { r: 2, tx: 0, ty: 10, s: 1.04, dur: 1.0, lid: 0.5, px: 0, py: 2 },
  { r: 12, tx: 10, ty: -12, s: 0.96, dur: 2.2, lid: 0.1, px: 0, py: -1 },
  { r: 0, tx: 0, ty: 25, s: 1.10, dur: 1.8, lid: 0.9, px: 0, py: 5 },
  { r: -6, tx: 6, ty: -22, s: 0.98, dur: 1.0, lid: 0.1, px: 0, py: -3 },
  { r: 4, tx: -3, ty: 6, s: 1.03, dur: 2.0, lid: 0.4, px: 0, py: 1 },
  { r: -3, tx: 0, ty: 22, s: 1.15, dur: 1.2, lid: 0.95, px: 0, py: 6 },
  { r: 6, tx: 3, ty: -6, s: 1.0, dur: 1.5, lid: 0.2, px: 0, py: 0 },
];

export function startTalkAnim(card) {
  const a = card.animator;
  a.clearTimeout('talk-step');
  let talkPhase = 0;
  const step = () => {
    const m = TALK_MOVES[talkPhase % TALK_MOVES.length];
    a.setHead(m.r, m.tx, m.ty, m.s, m.dur, 'ease-in-out');
    a.setLid(m.lid, m.dur);
    a.setPupil(m.px, m.py);
    a.setBodySwivel(m.r * -0.6, 1, m.dur);
    talkPhase++;
    a.setTimeout('talk-step', step, m.dur * 1000);
  };
  step();
}

export function stopTalkAnim(card) {
  card.animator.clearTimeout('talk-step');
}