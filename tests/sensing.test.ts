import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoard } from '../src/core/board-config.ts';
import { parseChassis } from '../src/core/config.ts';
import type { Primitive } from '../src/core/board.ts';
import { observeSensors, pointPrimitiveDistance, prepareLine, resolveBoard } from '../src/core/sensing.ts';

const board = () => parseBoard(readFileSync(new URL('../configs/boards/board_4_3_loop.yaml', import.meta.url), 'utf8'));
const chassis = () => parseChassis(readFileSync(new URL('../configs/chassis/T90L91.yaml', import.meta.url), 'utf8'));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('point-to-segment distance clamps to finite endpoints', () => {
  const line: Primitive = { kind: 'line', from: [0, 0], to: [10, 0], row: 0, col: 0 };
  near(pointPrimitiveDistance([5, 3], line), 3);
  near(pointPrimitiveDistance([-4, 3], line), 5);
  near(pointPrimitiveDistance([14, 3], line), 5);
});

test('point-to-arc distance respects angular limits and endpoints', () => {
  const arc: Primitive = { kind: 'arc', center: [0, 0], radius_mm: 10, start_angle_rad: 0, sweep_angle_rad: Math.PI / 2, row: 0, col: 0 };
  near(pointPrimitiveDistance([7 * Math.SQRT1_2, 7 * Math.SQRT1_2], arc), 3);
  near(pointPrimitiveDistance([-10, 0], arc), Math.sqrt(200));
  const clockwise: Primitive = { ...arc, start_angle_rad: 0, sweep_angle_rad: -Math.PI / 2 };
  near(pointPrimitiveDistance([0, -13], clockwise), 3);
});

test('ideal point readings include the exact stroke boundary', () => {
  const resolved = resolveBoard(board(), { lineWidthMm: 20, turnRadiusMm: 80 });
  const robot = chassis();
  robot.sensors.positions = [
    { id: 's0', x_mm: 0, y_mm: 0 }, { id: 's1', x_mm: 0, y_mm: 9.999 },
    { id: 's2', x_mm: 0, y_mm: 10 }, { id: 's3', x_mm: 0, y_mm: 10.001 },
    { id: 's4', x_mm: 0, y_mm: 30 }, { id: 's5', x_mm: 0, y_mm: -10 },
    { id: 's6', x_mm: 0, y_mm: -10.001 }, { id: 's7', x_mm: 0, y_mm: 50 },
  ];
  const values = observeSensors(robot, { x: 400, y: 120, heading: 0 }, prepareLine(resolved)).map(o => o.value);
  assert.deepEqual(values, [1, 1, 1, 0, 0, 1, 0, 0]);
});

test('sensor world transform follows chassis pose and preserves left-to-right order', () => {
  const observations = observeSensors(chassis(), { x: 100, y: 200, heading: Math.PI / 2 }, prepareLine(resolveBoard(board(), { lineWidthMm: 20, turnRadiusMm: 80 })));
  assert.deepEqual(observations.map(o => o.id), ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
  near(observations[0].world[0], 100 - 39.025); near(observations[0].world[1], 248);
});

test('simulation parameters replace design defaults and all per-corner overrides without mutating source', () => {
  const source = board(); source.tiles[0][0].radius_mm = 40;
  const resolved = resolveBoard(source, { lineWidthMm: 25, turnRadiusMm: 10 });
  assert.equal(source.line.default_width_mm, 20); assert.equal(source.tiles[0][0].radius_mm, 40);
  assert.equal(resolved.line.default_width_mm, 25); assert.equal(resolved.line.default_turn_radius_mm, 10);
  assert.ok(resolved.tiles.flat().every(tile => tile.radius_mm === undefined));
  assert.throws(() => resolveBoard(source, { lineWidthMm: 0, turnRadiusMm: 10 }), /lineWidthMm/);
  assert.throws(() => resolveBoard(source, { lineWidthMm: 20, turnRadiusMm: 121 }), /turnRadiusMm/);
});

test('zoom and drawing configuration are absent from analytical observation inputs', () => {
  const line = prepareLine(resolveBoard(board(), { lineWidthMm: 20, turnRadiusMm: 80 }));
  const first = observeSensors(chassis(), { x: 240, y: 120, heading: 0 }, line);
  const second = observeSensors(chassis(), { x: 240, y: 120, heading: 0 }, line);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(o => o.value), [0, 0, 0, 1, 1, 0, 0, 0]);
});
