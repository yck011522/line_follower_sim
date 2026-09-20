import type { Board } from './board-config';
import { boardPrimitives } from './board';
import type { Primitive } from './board';
import type { Chassis } from './chassis';
import { sensorsLeftToRight } from './chassis';
import type { Point, Pose } from './geometry';
import { localToWorld } from './geometry';

export interface BoardOverrides { lineWidthMm: number; turnRadiusMm: number }
export interface PreparedLine { primitives: Primitive[]; halfWidthMm: number }
export interface SensorObservation {
  id: string;
  world: Point;
  centerlineDistanceMm: number;
  signedEdgeDistanceMm: number;
  value: 0 | 1;
}

/** Simulation overrides replace every board-level and per-tile design default. */
export function resolveBoard(board: Board, overrides: BoardOverrides): Board {
  const resolved = structuredClone(board);
  if (!Number.isFinite(overrides.lineWidthMm) || overrides.lineWidthMm <= 0) throw new Error('lineWidthMm must be greater than zero');
  if (!Number.isFinite(overrides.turnRadiusMm) || overrides.turnRadiusMm <= 0 || overrides.turnRadiusMm > board.grid_size_mm / 2)
    throw new Error(`turnRadiusMm must be greater than zero and at most ${board.grid_size_mm / 2}`);
  resolved.line.default_width_mm = overrides.lineWidthMm;
  resolved.line.default_turn_radius_mm = overrides.turnRadiusMm;
  for (const row of resolved.tiles) for (const tile of row) delete tile.radius_mm;
  return resolved;
}

export function prepareLine(board: Board): PreparedLine {
  return { primitives: boardPrimitives(board), halfWidthMm: board.line.default_width_mm / 2 };
}

function pointSegmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to[0] - from[0], dy = to[1] - from[1], lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - from[0], point[1] - from[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (from[0] + t * dx), point[1] - (from[1] + t * dy));
}

function normalizeAngle(angle: number): number {
  const full = 2 * Math.PI;
  return ((angle % full) + full) % full;
}

function angleOnSweep(angle: number, start: number, sweep: number): boolean {
  const epsilon = 1e-12;
  if (sweep >= 0) return normalizeAngle(angle - start) <= sweep + epsilon;
  return normalizeAngle(start - angle) <= -sweep + epsilon;
}

function arcPoint(arc: Extract<Primitive, { kind: 'arc' }>, angle: number): Point {
  return [arc.center[0] + arc.radius_mm * Math.cos(angle), arc.center[1] + arc.radius_mm * Math.sin(angle)];
}

export function pointPrimitiveDistance(point: Point, primitive: Primitive): number {
  if (primitive.kind === 'line') return pointSegmentDistance(point, primitive.from, primitive.to);
  const dx = point[0] - primitive.center[0], dy = point[1] - primitive.center[1];
  const angle = Math.atan2(dy, dx);
  if (angleOnSweep(angle, primitive.start_angle_rad, primitive.sweep_angle_rad)) return Math.abs(Math.hypot(dx, dy) - primitive.radius_mm);
  const endAngle = primitive.start_angle_rad + primitive.sweep_angle_rad;
  return Math.min(Math.hypot(point[0] - arcPoint(primitive, primitive.start_angle_rad)[0], point[1] - arcPoint(primitive, primitive.start_angle_rad)[1]),
    Math.hypot(point[0] - arcPoint(primitive, endAngle)[0], point[1] - arcPoint(primitive, endAngle)[1]));
}

export function pointLineDistance(point: Point, line: PreparedLine): number {
  let best = Infinity;
  for (const primitive of line.primitives) best = Math.min(best, pointPrimitiveDistance(point, primitive));
  return best;
}

export function observeSensors(chassis: Chassis, pose: Pose, line: PreparedLine): SensorObservation[] {
  return sensorsLeftToRight(chassis).map(sensor => {
    const world = localToWorld([sensor.x_mm, sensor.y_mm], pose);
    const centerlineDistanceMm = pointLineDistance(world, line);
    const signedEdgeDistanceMm = centerlineDistanceMm - line.halfWidthMm;
    return { id: sensor.id, world, centerlineDistanceMm, signedEdgeDistanceMm, value: signedEdgeDistanceMm <= 1e-9 ? 1 : 0 };
  });
}
