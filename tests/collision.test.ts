import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoard } from '../src/core/board-config.ts';
import { parseChassis } from '../src/core/config.ts';
import { closestColumnClearance, columnClearances, signedPointPolygonClearance } from '../src/core/collision.ts';

const board = () => parseBoard(readFileSync(new URL('../configs/boards/board_4_3_loop.yaml', import.meta.url), 'utf8'));
const chassis = () => parseChassis(readFileSync(new URL('../configs/chassis/T90L91.yaml', import.meta.url), 'utf8'));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('signed point-to-polygon clearance is positive outside, zero at contact, and negative inside', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
  const outside = signedPointPolygonClearance([13, 4], square);
  near(outside.clearanceMm, 3); assert.deepEqual(outside.nearestBoundaryPoint, [10, 4]); assert.equal(outside.inside, false);
  const boundary = signedPointPolygonClearance([10, 4], square);
  near(boundary.clearanceMm, 0); assert.deepEqual(boundary.nearestBoundaryPoint, [10, 4]);
  const inside = signedPointPolygonClearance([4, 6], square);
  near(inside.clearanceMm, -4); assert.equal(inside.inside, true);
});

test('concave notches are not replaced by a convex hull', () => {
  const concave = [[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]] as const;
  const notch = signedPointPolygonClearance([5, 8], concave);
  near(notch.clearanceMm, 1); assert.equal(notch.inside, false);
  const body = signedPointPolygonClearance([3, 8], concave);
  near(body.clearanceMm, -1); assert.equal(body.inside, true);
});

test('column clearance uses centers only and returns all centers sorted by signed clearance', () => {
  const gameBoard = board(), robot = chassis();
  gameBoard.columns.display_diameter_mm = 200;
  const clearances = columnClearances(gameBoard, robot, { x: 240, y: 120, heading: 0 });
  assert.equal(clearances.length, 20);
  assert.ok(clearances.every((item, index) => index === 0 || clearances[index - 1].clearanceMm <= item.clearanceMm));
  const closest = clearances[0];
  assert.equal(closest.columnId, 'C1_0'); near(closest.clearanceMm, 61);
  const originalDiameter = gameBoard.columns.display_diameter_mm;
  gameBoard.columns.display_diameter_mm = 0;
  assert.deepEqual(columnClearances(gameBoard, robot, { x: 240, y: 120, heading: 0 }), clearances);
  assert.equal(originalDiameter, 200);
});

test('column center containment is collision with negative clearance', () => {
  const closest = closestColumnClearance(board(), chassis(), { x: 240, y: 240, heading: 0 })!;
  assert.equal(closest.columnId, 'C1_1'); near(closest.clearanceMm, -39.5);
  assert.equal(closest.inside, true); assert.equal(closest.collision, true);
});

test('column center touching a collision polygon reports zero clearance', () => {
  const closest = closestColumnClearance(board(), chassis(), { x: 112.77, y: 181, heading: 0 })!;
  assert.equal(closest.columnId, 'C1_1'); near(closest.clearanceMm, 0);
  assert.equal(closest.collision, true);
});

test('rotation is applied before column clearance', () => {
  const robot = chassis(), gameBoard = board();
  const zero = closestColumnClearance(gameBoard, robot, { x: 240, y: 120, heading: 0 })!;
  const rotated = closestColumnClearance(gameBoard, robot, { x: 240, y: 120, heading: Math.PI / 2 })!;
  assert.notEqual(zero.clearanceMm, rotated.clearanceMm);
  assert.equal(rotated.columnId, 'C1_1');
  near(rotated.clearanceMm, -7.23);
  assert.equal(rotated.collision, true);
});
