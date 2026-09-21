import type { Pose } from './geometry';

export interface DifferentialMotion { forwardMmS: number; yawRateRadS: number }

export function wheelMotion(leftMmS: number, rightMmS: number, trackWidthMm: number): DifferentialMotion {
  if (!(trackWidthMm > 0)) throw new Error('Drive track width must be greater than zero');
  return { forwardMmS: (leftMmS + rightMmS) / 2, yawRateRadS: (rightMmS - leftMmS) / trackWidthMm };
}

export function normalizeHeading(angle: number): number {
  const full = 2 * Math.PI;
  return ((angle + Math.PI) % full + full) % full - Math.PI;
}

/** Exact integration while both wheel rim speeds remain constant. */
export function integrateDifferential(pose: Pose, leftMmS: number, rightMmS: number, trackWidthMm: number, dtS: number): Pose {
  if (!(dtS >= 0)) throw new Error('Motion timestep must be zero or greater');
  const { forwardMmS: v, yawRateRadS: omega } = wheelMotion(leftMmS, rightMmS, trackWidthMm);
  const nextHeading = pose.heading + omega * dtS;
  if (Math.abs(omega) < 1e-10) {
    return { x: pose.x + v * dtS * Math.cos(pose.heading), y: pose.y + v * dtS * Math.sin(pose.heading), heading: normalizeHeading(nextHeading) };
  }
  const radius = v / omega;
  return {
    x: pose.x + radius * (Math.sin(nextHeading) - Math.sin(pose.heading)),
    y: pose.y - radius * (Math.cos(nextHeading) - Math.cos(pose.heading)),
    heading: normalizeHeading(nextHeading),
  };
}
