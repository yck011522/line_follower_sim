export interface NoiseConfig { seed: number; severity: number }

function hash(seed: number, channel: number, index: number): number {
  let x = (seed ^ Math.imul(channel + 1, 0x9e3779b1) ^ Math.imul(index + 0x7fffffff, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

/** Bounded deterministic value noise with smooth transitions between random knots. */
export function correlatedNoise(seed: number, channel: number, timeS: number, correlationS: number): number {
  const position = timeS / correlationS, index = Math.floor(position), fraction = position - index;
  const smooth = fraction * fraction * (3 - 2 * fraction);
  const a = hash(seed, channel, index) * 2 - 1, b = hash(seed, channel, index + 1) * 2 - 1;
  return a + (b - a) * smooth;
}

export function sensorEdgeOffsets(sensorIds: readonly string[], timeS: number, config?: NoiseConfig): Record<string, number> | undefined {
  if (!config || config.severity === 0) return undefined;
  const common = .5 * config.severity * correlatedNoise(config.seed, 0, timeS, 10);
  return Object.fromEntries(sensorIds.map((id, index) => [id, common + config.severity * correlatedNoise(config.seed, 10 + index, timeS, 2)]));
}

export function motionNoise(timeS: number, commandedForwardMmS: number, commandedYawRadS: number, maxYawRadS: number, config?: NoiseConfig) {
  if (!config || config.severity === 0) return { forwardMmS: commandedForwardMmS, yawRadS: commandedYawRadS };
  const turnFraction = maxYawRadS > 0 ? Math.min(1, Math.abs(commandedYawRadS) / maxYawRadS) : 0;
  const forwardLoss = .03 * config.severity * (.25 + .75 * turnFraction) * (correlatedNoise(config.seed, 30, timeS, 3) + 1) / 2;
  const yawScale = 1 + .05 * config.severity * turnFraction * correlatedNoise(config.seed, 31, timeS, 2);
  return { forwardMmS: commandedForwardMmS * (1 - forwardLoss), yawRadS: commandedYawRadS * yawScale };
}
