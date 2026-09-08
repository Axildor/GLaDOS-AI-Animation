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

    /**
     * Energy-add kick: boost the spring by one kick's worth of kinetic
     * energy WITHOUT cancelling its current motion. The new velocity keeps
     * the current direction and gains magnitude:
     *   v' = sign(v) * sqrt(v^2 + v0^2)
     * so a tap ALWAYS amplifies the bounce — tapping while the head is
     * rising (negative v) no longer partially cancels the injected energy
     * the way injectVelocity(+v0) did. At the extremes (v = 0) this
     * degenerates to a plain injection.
     *
     * `maxVelocity` (optional) clamps the result so rapid clicking cannot
     * accumulate unbounded amplitude and launch the head off-screen.
     */
    kick(v0, maxVelocity) {
      const v = spring.velocity;
      const sign = v >= 0 ? 1 : -1;
      let boosted = sign * Math.sqrt(v * v + v0 * v0);
      if (maxVelocity !== undefined && Math.abs(boosted) > maxVelocity) {
        boosted = sign * maxVelocity;
      }
      spring.velocity = boosted;
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
      let stepped = false;
      while (spring._accumulator >= TIME_STEP) {
        stepped = true;
        const force = -stiffness * spring.position - damping * spring.velocity;
        spring.velocity += force;
        spring.position += spring.velocity;
        spring._accumulator -= TIME_STEP;
        if (Math.abs(spring.position) >= settleThreshold || Math.abs(spring.velocity) >= settleThreshold) {
          settled = false;
        }
      }
      // No sub-step ran (dt < TIME_STEP): the spring hasn't moved yet, so it
      // cannot be settled. Reporting settled here would terminate the bop on
      // its first frame before any motion is visible.
      return settled && stepped;
    },
  };

  return spring;
}