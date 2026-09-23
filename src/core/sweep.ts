import type { SimulationSummary } from './simulation';

export type SweepParameter = 'turnRadiusMm' | 'lineWidthMm' | 'kp';
export type SweepMetric = 'minimumClearanceMm' | 'rmsLineErrorMm' | 'maximumAbsoluteLineErrorMm' | 'hfYawRateRmsRadS';
export interface SweepValues { turnRadiusMm: number[]; lineWidthMm: number[]; kp: number[] }
export interface SweepPoint { turnRadiusMm: number; lineWidthMm: number; kp: number }
export interface SweepResult extends SweepPoint { summary: SimulationSummary }

export const SWEEP_LABELS: Record<SweepParameter, string> = {
  turnRadiusMm: 'Turn radius (mm)', lineWidthMm: 'Line width (mm)', kp: 'Kp',
};
export const METRIC_LABELS: Record<SweepMetric, string> = {
  minimumClearanceMm: 'Minimum clearance (mm)', rmsLineErrorMm: 'RMS line error (mm)', maximumAbsoluteLineErrorMm: 'Maximum line error (mm)', hfYawRateRmsRadS:'HF Yaw Rate RMS (rad/s)',
};

export function inclusiveRange(start: number, stop: number, step: number): number[] {
  if (![start, stop, step].every(Number.isFinite) || step <= 0 || stop < start) throw new Error('Sweep range requires finite start/stop values and a positive step');
  const count = Math.floor((stop - start) / step + 1e-9) + 1;
  if (count > 10_000) throw new Error('Sweep range is too large');
  return Array.from({ length: count }, (_, index) => Number((start + index * step).toPrecision(12)));
}

export function expandSweep(values: SweepValues): SweepPoint[] {
  if (!values.turnRadiusMm.length || !values.lineWidthMm.length || !values.kp.length) throw new Error('Every sweep axis needs at least one value');
  const points: SweepPoint[] = [];
  for (const turnRadiusMm of values.turnRadiusMm)
    for (const lineWidthMm of values.lineWidthMm)
      for (const kp of values.kp) points.push({ turnRadiusMm, lineWidthMm, kp });
  return points;
}

export function metricValue(result: SweepResult, metric: SweepMetric): number | null {
  return result.summary[metric];
}

/** Finds a plateau: maximize the worst clearance among a point and its immediate 3D neighbors. */
export function robustClearanceCandidate(results: readonly SweepResult[], values: SweepValues): { result: SweepResult; neighborhoodMinimumMm: number } | null {
  const byKey = new Map(results.map(result => [`${result.turnRadiusMm}|${result.lineWidthMm}|${result.kp}`, result]));
  let best: { result: SweepResult; neighborhoodMinimumMm: number } | null = null;
  for (const result of results) {
    const indices = [values.turnRadiusMm.indexOf(result.turnRadiusMm), values.lineWidthMm.indexOf(result.lineWidthMm), values.kp.indexOf(result.kp)];
    if (indices[0] <= 0 || indices[1] <= 0 || indices[2] <= 0 || indices[0] >= values.turnRadiusMm.length - 1 || indices[1] >= values.lineWidthMm.length - 1 || indices[2] >= values.kp.length - 1) continue;
    let worst = Infinity, complete = true;
    for (let dr = -1; dr <= 1; dr++) for (let dw = -1; dw <= 1; dw++) for (let dk = -1; dk <= 1; dk++) {
      const ri = indices[0] + dr, wi = indices[1] + dw, ki = indices[2] + dk;
      if (ri < 0 || wi < 0 || ki < 0 || ri >= values.turnRadiusMm.length || wi >= values.lineWidthMm.length || ki >= values.kp.length) continue;
      const neighbor = byKey.get(`${values.turnRadiusMm[ri]}|${values.lineWidthMm[wi]}|${values.kp[ki]}`);
      if (!neighbor || neighbor.summary.status !== 'completed' || neighbor.summary.minimumClearanceMm === null) { complete = false; break; }
      worst = Math.min(worst, neighbor.summary.minimumClearanceMm);
    }
    if (complete && Number.isFinite(worst) && (!best || worst > best.neighborhoodMinimumMm)) best = { result, neighborhoodMinimumMm: worst };
  }
  return best;
}
