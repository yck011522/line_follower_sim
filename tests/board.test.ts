import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { parseBoard } from '../src/core/board-config.ts';
import type { Board, TileType } from '../src/core/board-config.ts';
import { boardPrimitives, columnCenters, tileCenter, tilePrimitives, topology, primitiveLength } from '../src/core/board.ts';
import type { Primitive } from '../src/core/board.ts';
import type { Point } from '../src/core/geometry.ts';

const fixture = (name = 'loop') => parseBoard(readFileSync(new URL(`../configs/boards/board_4_3_${name}.yaml`, import.meta.url), 'utf8'));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const nearPoint = (a: Point, b: Point) => { near(a[0], b[0]); near(a[1], b[1]); };
function endpoints(p: Primitive): [Point, Point] {
  if (p.kind === 'line') return [p.from, p.to];
  const point = (angle: number): Point => [p.center[0] + p.radius_mm * Math.cos(angle), p.center[1] + p.radius_mm * Math.sin(angle)];
  return [point(p.start_angle_rad), point(p.start_angle_rad + p.sweep_angle_rad)];
}
function unit(p: Point): Point { const length = Math.hypot(...p); return [p[0] / length, p[1] / length]; }
function tangents(p: Primitive): [Point, Point] {
  if (p.kind === 'line') { const tangent = unit([p.to[0] - p.from[0], p.to[1] - p.from[1]]); return [tangent, tangent]; }
  const sign = Math.sign(p.sweep_angle_rad);
  const tangent = (a: number): Point => [-Math.sin(a) * sign, Math.cos(a) * sign];
  return [tangent(p.start_angle_rad), tangent(p.start_angle_rad + p.sweep_angle_rad)];
}

test('reference boards have the intended closed-loop topology, dimensions and column centers', () => {
  for (const [name, active, turns] of [['loop', 10, 4], ['elle', 10, 6], ['snake', 12, 8]] as const) {
    const board = fixture(name), result = topology(board);
    assert.equal(board.tiles.length, 3); assert.equal(board.tiles[0].length, 4);
    assert.equal(board.grid_size_mm, 240); assert.equal(result.singleClosedLoop, true);
    assert.equal(result.activeTiles, active); assert.equal(result.components, 1);
    assert.deepEqual(result.issues, []);
    assert.equal(boardPrimitives(board).filter(p => p.kind === 'arc').length, turns);
    assert.equal(columnCenters(board).length, 20);
    assert.deepEqual(columnCenters(board)[0], { id: 'C0_0', center: [0, 0] });
    assert.deepEqual(columnCenters(board).at(-1), { id: 'C4_3', center: [960, 720] });
    nearPoint(tileCenter(board, 0, 0), [120, 600]);
    nearPoint(tileCenter(board, 2, 3), [840, 120]);
  }
});

test('all four turns maintain edge midpoints, tangent continuity, and quarter-circle length across radius sweep', () => {
  const ports: [TileType, Point, Point][] = [
    ['turn_ne', [120, 720], [240, 600]], ['turn_nw', [120, 720], [0, 600]],
    ['turn_se', [120, 480], [240, 600]], ['turn_sw', [120, 480], [0, 600]],
  ];
  for (const [type, start, finish] of ports) for (const radius of [10, 60, 80, 119.5, 120]) {
    const board = fixture(); board.tiles[0][0] = { type, radius_mm: radius };
    const pieces = tilePrimitives(board, 0, 0);
    nearPoint(endpoints(pieces[0])[0], start); nearPoint(endpoints(pieces.at(-1)!)[1], finish);
    for (let i = 1; i < pieces.length; i++) {
      nearPoint(endpoints(pieces[i - 1])[1], endpoints(pieces[i])[0]);
      nearPoint(tangents(pieces[i - 1])[1], tangents(pieces[i])[0]);
    }
    near(pieces.reduce((sum, p) => sum + primitiveLength(p), 0), 240 - 2 * radius + Math.PI * radius / 2);
    assert.equal(pieces.length, radius === 120 ? 1 : 3);
  }
});

test('centerline primitive endpoints match at every neighboring tile join', () => {
  for (const name of ['loop', 'elle', 'snake']) for (const radius of [10, 120]) {
    const board = fixture(name); board.line.default_turn_radius_mm = radius;
    const endpointsByTile = board.tiles.flatMap((row, r) => row.flatMap((tile, c) => {
      if (tile.type === 'empty') return [];
      const p = tilePrimitives(board, r, c); return [endpoints(p[0])[0], endpoints(p.at(-1)!)[1]];
    }));
    for (const point of endpointsByTile) {
      assert.equal(endpointsByTile.filter(q => Math.hypot(q[0] - point[0], q[1] - point[1]) < 1e-8).length, 2);
    }
  }
});

test('column display diameter and line width do not alter physical centerline or column center data', () => {
  const board = fixture(), columns = columnCenters(board), paths = boardPrimitives(board);
  board.columns.display_diameter_mm = 100;
  board.line.default_width_mm = 25;
  assert.deepEqual(columnCenters(board), columns); assert.deepEqual(boardPrimitives(board), paths);
  assert.ok(columnCenters(board).every(c => !('radius' in c) && !('radius_mm' in c)));
  board.line.default_turn_radius_mm = 10;
  assert.equal(parseBoard(stringify(board)).line.default_width_mm, 25, 'thick strokes at small radii are allowed');
});

test('per-corner overrides persist through YAML and only affect that corner', () => {
  const original = fixture(), board = fixture(); board.tiles[0][0].radius_mm = 10;
  const loaded = parseBoard(stringify(board));
  assert.equal(loaded.tiles[0][0].radius_mm, 10);
  assert.notDeepEqual(tilePrimitives(loaded, 0, 0), tilePrimitives(original, 0, 0));
  assert.deepEqual(tilePrimitives(loaded, 0, 3), tilePrimitives(original, 0, 3));
  assert.equal(topology(loaded).singleClosedLoop, true);
});

test('open connections, empty layouts and independent loops are reported without preventing visual editing', () => {
  const board = fixture(); board.tiles[0][1] = { type: 'empty' };
  assert.equal(topology(parseBoard(stringify(board))).issues.length, 2);
  const empty = fixture(); empty.tiles.forEach(row => row.forEach(tile => { tile.type = 'empty'; }));
  assert.equal(topology(empty).activeTiles, 0); assert.equal(topology(empty).singleClosedLoop, false);
  const separate = fixture(); separate.tiles = [
    [{ type: 'turn_se' }, { type: 'turn_sw' }, { type: 'turn_se' }, { type: 'turn_sw' }],
    [{ type: 'turn_ne' }, { type: 'turn_nw' }, { type: 'turn_ne' }, { type: 'turn_nw' }],
  ];
  assert.equal(topology(separate).components, 2); assert.equal(topology(separate).issues.length, 0);
  assert.equal(topology(separate).singleClosedLoop, false);
});

test('malformed units, grid, radii, tiles and column semantics are rejected', () => {
  const bad = (change: (board: Board) => void, error: RegExp) => {
    const board = fixture(); change(board); assert.throws(() => parseBoard(stringify(board)), error);
  };
  bad(b => { b.grid_size_mm = 0; }, /grid_size_mm/);
  bad(b => { b.line.default_turn_radius_mm = 121; }, /half the grid/);
  bad(b => { b.line.default_turn_radius_mm = -10; }, /greater than zero/);
  bad(b => { b.tiles[0][0].radius_mm = 121; }, /half the grid/);
  bad(b => { b.tiles[0][1].radius_mm = 80; }, /only valid on a turn/);
  bad(b => { b.tiles[1].pop(); }, /same length/);
  bad(b => { b.line.default_width_mm = NaN; }, /finite number/);
  bad(b => { b.columns.display_diameter_mm = -20; }, /zero or positive/);
  const yaml = stringify(fixture());
  assert.throws(() => parseBoard(yaml.replace('units: mm', 'units: cm')), /units/);
  assert.throws(() => parseBoard(yaml.replace('collision_reference: center', 'collision_reference: surface')), /display diameter is visual only/);
  assert.throws(() => parseBoard(yaml.replace('turn_se', 'turn_invalid')), /unknown tile/);
  assert.throws(() => parseBoard(yaml + '\nname: Duplicate'), /unique/);
});

test('grid spacing is parametric and radius bounds follow it', () => {
  const board = fixture(); board.grid_size_mm = 200;
  nearPoint(columnCenters(parseBoard(stringify(board))).at(-1)!.center, [800, 600]);
  board.line.default_turn_radius_mm = 120;
  assert.throws(() => parseBoard(stringify(board)), /100 mm/);
});
