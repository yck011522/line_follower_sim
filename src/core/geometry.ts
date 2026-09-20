export type Point = readonly [number, number];
export interface Pose { x: number; y: number; heading: number }

export function localToWorld([x, y]: Point, pose: Pose): Point {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return [pose.x + c * x - s * y, pose.y + s * x + c * y];
}

export function bounds(points: readonly Point[]) {
  return {
    minX: Math.min(...points.map(p => p[0])),
    maxX: Math.max(...points.map(p => p[0])),
    minY: Math.min(...points.map(p => p[1])),
    maxY: Math.max(...points.map(p => p[1])),
  };
}

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

const EPS = 1e-8;
function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.abs(cross(a, b, p)) <= EPS &&
    p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
      ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) ||
    onSegment(c, d, a) || onSegment(c, d, b);
}

/** Returns a useful error for invalid simple polygons; preserves concavity and winding. */
export function polygonError(points: readonly Point[]): string | undefined {
  if (points.length < 3) return 'must contain at least three vertices';
  if (new Set(points.map(p => `${p[0]},${p[1]}`)).size !== points.length)
    return 'contains duplicate vertices (do not repeat the first vertex)';
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const previous = points[(i + points.length - 1) % points.length];
    if (onSegment(previous, a, b) || onSegment(a, b, previous))
      return 'contains overlapping adjacent edges';
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length]))
        return 'contains intersecting edges';
    }
  }
  const twiceArea = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  if (Math.abs(twiceArea) <= EPS) return 'must have nonzero area';
}
