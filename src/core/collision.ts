import type { Board } from './board-config';
import { columnCenters } from './board';
import type { Chassis } from './chassis';
import type { Point, Pose } from './geometry';
import { localToWorld } from './geometry';

export interface ColumnClearance {
  columnId: string;
  columnCenter: Point;
  nearestBoundaryPoint: Point;
  clearanceMm: number;
  inside: boolean;
  collision: boolean;
}

const EPSILON = 1e-9;

function nearestPointOnSegment(point: Point, from: Point, to: Point): { point: Point; distance: number } {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared));
  const nearest: Point = [from[0] + t * dx, from[1] + t * dy];
  return { point: nearest, distance: Math.hypot(point[0] - nearest[0], point[1] - nearest[1]) };
}

/** Boundary is handled separately, so ray casting can remain a strict inside test. */
function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > point[1]) !== (yj > point[1])) {
      const crossingX = xi + (point[1] - yi) * (xj - xi) / (yj - yi);
      if (point[0] < crossingX) inside = !inside;
    }
  }
  return inside;
}

export function signedPointPolygonClearance(point: Point, polygon: readonly Point[]): { clearanceMm: number; nearestBoundaryPoint: Point; inside: boolean } {
  if (polygon.length < 3) throw new Error('collision polygon must contain at least three vertices');
  let distance = Infinity, nearestBoundaryPoint: Point = polygon[0];
  for (let i = 0; i < polygon.length; i++) {
    const candidate = nearestPointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length]);
    if (candidate.distance < distance) { distance = candidate.distance; nearestBoundaryPoint = candidate.point; }
  }
  if (distance <= EPSILON) return { clearanceMm: 0, nearestBoundaryPoint, inside: false };
  const inside = pointInPolygon(point, polygon);
  return { clearanceMm: inside ? -distance : distance, nearestBoundaryPoint, inside };
}

export function columnClearances(board: Board, chassis: Chassis, pose: Pose): ColumnClearance[] {
  const polygon = chassis.collision.outline_xy_mm.map(point => localToWorld(point, pose));
  return columnCenters(board).map(column => {
    const result = signedPointPolygonClearance(column.center, polygon);
    return {
      columnId: column.id, columnCenter: column.center,
      nearestBoundaryPoint: result.nearestBoundaryPoint,
      clearanceMm: result.clearanceMm, inside: result.inside,
      collision: result.clearanceMm <= 0,
    };
  }).sort((a, b) => a.clearanceMm - b.clearanceMm || a.columnId.localeCompare(b.columnId));
}

export function closestColumnClearance(board: Board, chassis: Chassis, pose: Pose): ColumnClearance | undefined {
  return columnClearances(board, chassis, pose)[0];
}
