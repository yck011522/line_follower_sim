import type { Board, TileType } from './board-config';
import type { Point } from './geometry';

export type Edge = 'n' | 'e' | 's' | 'w';
export const PORTS: Record<TileType, Edge[]> = {
  empty: [], straight_ew: ['e', 'w'], straight_ns: ['n', 's'],
  turn_ne: ['n', 'e'], turn_nw: ['n', 'w'], turn_se: ['s', 'e'], turn_sw: ['s', 'w'],
};
const DIRECTIONS: Record<Edge, Point> = { n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] };
const NEIGHBORS: Record<Edge, readonly [number, number, Edge]> = { n: [-1, 0, 's'], e: [0, 1, 'w'], s: [1, 0, 'n'], w: [0, -1, 'e'] };
export type Primitive =
  | { kind: 'line'; from: Point; to: Point; row: number; col: number }
  | { kind: 'arc'; center: Point; radius_mm: number; start_angle_rad: number; sweep_angle_rad: number; row: number; col: number };
export interface ColumnCenter { id: string; center: Point }

export function tileCenter(board: Board, row: number, col: number): Point {
  return [(col + .5) * board.grid_size_mm, (board.tiles.length - row - .5) * board.grid_size_mm];
}

/** All dimensions in mm; analytical primitives are shared with later sensing. */
export function tilePrimitives(board: Board, row: number, col: number): Primitive[] {
  const tile = board.tiles[row][col], ports = PORTS[tile.type];
  if (!ports.length) return [];
  const center = tileCenter(board, row, col), half = board.grid_size_mm / 2;
  const u = DIRECTIONS[ports[0]], v = DIRECTIONS[ports[1]];
  const along = (direction: Point, distance: number): Point => [center[0] + direction[0] * distance, center[1] + direction[1] * distance];
  const from = along(u, half), to = along(v, half);
  if (tile.type.startsWith('straight')) return [{ kind: 'line', from, to, row, col }];
  const radius = tile.radius_mm ?? board.line.default_turn_radius_mm;
  const tangentA = along(u, radius), tangentB = along(v, radius);
  const arcCenter: Point = [center[0] + (u[0] + v[0]) * radius, center[1] + (u[1] + v[1]) * radius];
  const start = Math.atan2(tangentA[1] - arcCenter[1], tangentA[0] - arcCenter[0]);
  const end = Math.atan2(tangentB[1] - arcCenter[1], tangentB[0] - arcCenter[0]);
  const sweep = ((end - start + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const result: Primitive[] = [];
  if (radius < half) result.push({ kind: 'line', from, to: tangentA, row, col });
  result.push({ kind: 'arc', center: arcCenter, radius_mm: radius, start_angle_rad: start, sweep_angle_rad: sweep, row, col });
  if (radius < half) result.push({ kind: 'line', from: tangentB, to, row, col });
  return result;
}

/** Column display diameter is deliberately absent from physical column data. */
export function columnCenters(board: Board): ColumnCenter[] {
  const result: ColumnCenter[] = [];
  for (let y = 0; y <= board.tiles.length; y++) {
    for (let x = 0; x <= board.tiles[0].length; x++) result.push({ id: `C${x}_${y}`, center: [x * board.grid_size_mm, y * board.grid_size_mm] });
  }
  return result;
}

export function boardPrimitives(board: Board): Primitive[] {
  return board.tiles.flatMap((row, r) => row.flatMap((_, c) => tilePrimitives(board, r, c)));
}
export function primitiveLength(p: Primitive): number {
  return p.kind === 'line' ? Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]) : p.radius_mm * Math.abs(p.sweep_angle_rad);
}

export function topology(board: Board) {
  const issues: string[] = [], active = new Set<string>();
  let components = 0;
  board.tiles.forEach((row, r) => row.forEach((tile, c) => {
    if (tile.type === 'empty') return;
    active.add(`${r},${c}`);
    for (const edge of PORTS[tile.type]) {
      const [dr, dc, opposite] = NEIGHBORS[edge], neighbor = board.tiles[r + dr]?.[c + dc];
      if (!neighbor || !PORTS[neighbor.type].includes(opposite)) issues.push(`Row ${r + 1}, column ${c + 1}: ${edge.toUpperCase()} edge has no matching connection.`);
    }
  }));
  const seen = new Set<string>();
  for (const key of active) {
    if (seen.has(key)) continue;
    components++;
    const pending = [key];
    while (pending.length) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const [r, c] = current.split(',').map(Number);
      for (const edge of PORTS[board.tiles[r][c].type]) {
        const [dr, dc, opposite] = NEIGHBORS[edge], neighbor = board.tiles[r + dr]?.[c + dc];
        if (neighbor && PORTS[neighbor.type].includes(opposite)) pending.push(`${r + dr},${c + dc}`);
      }
    }
  }
  return { issues, components, activeTiles: active.size, singleClosedLoop: active.size > 0 && components === 1 && issues.length === 0 };
}
