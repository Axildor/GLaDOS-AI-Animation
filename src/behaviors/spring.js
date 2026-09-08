/**
 * behaviors/spring.js — Shared fixed-timestep damped harmonic oscillator.
 *
 * Extracted from bop.js so both the tap bop and the dance groove layer can
 * drive organic spring motion. The integrator runs at a fixed 16.666ms step
 * (frame-rate independent); callers drive it from a RAF loop and read
 * position/velocity each frame.
 */

const TIME_STEP = 16.666;

/**
 * Create a damped spring oscillator.
 *
 * @param {object} opts
 * @param {number} opts.omega       Natural frequency (rad/step), e.g. 0.28.
 * @param {number} opts.dampingRatio 1 = critically damped, <1 = bouncy.
 * @param {number} [opts.settleThreshold=0.08]  |pos| and |vel| below this = settled.
 * @returns {{
 *   position: number, velocity: number,
 *   injectVelocity(v: number): void,
 *   step(dtMs: number): boolean,   // advance physics; returns true when settled
 *   reset(): void
 * }}
 */
export function createSpring({ omega, dampingRatio, settleThreshold = 0.08 }) {
  const stiffness = omega * omega;
  const damping = 2 * omega * dampingRatio;

  const spring = {
    position: 0,
    velocity: 0,
    _accumulator: 0,

    injectVelocity(v) {
      spring.velocity += v;
    },

    reset() {
      spring.position = 0;
      spring.velocity = 0;
      spring._accumulator = 0;
    },

    /**
     * Advance the simulation by dtMs of wall time using fixed sub-steps.
     * Returns true once the spring has settled (pos & vel below threshold).
     */
    step(dtMs) {
      spring._accumulator += dtMs;
      let settled = true;
      while (spring._accumulator >= TIME_STEP) {
        const force = -stiffness * spring.position - damping * spring.velocity;
        spring.velocity += force;
        spring.position += spring.velocity;
        spring._accumulator -= TIME_STEP;
        if (Math.abs(spring.position) >= settleThreshold || Math.abs(spring.velocity) >= settleThreshold) {
          settled = false;
        }
      }
      return settled;
    },
  };

  return spring;
}