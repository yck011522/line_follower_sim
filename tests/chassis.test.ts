import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { parseChassis } from '../src/core/config.ts';
import { wheels, sensorsLeftToRight } from '../src/core/chassis.ts';
import { bounds, localToWorld, polygonError } from '../src/core/geometry.ts';

const yaml = readFileSync(new URL('../configs/chassis/T90L91.yaml', import.meta.url), 'utf8');
const fixture = () => parseChassis(yaml);
const secondYaml = readFileSync(new URL('../configs/chassis/T100L101.yaml', import.meta.url), 'utf8');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('T90L91 drawing dimensions and user-confirmed optical centers', () => {
  const chassis = fixture(), b = bounds(chassis.collision.outline_xy_mm);
  near(b.maxY - b.minY, 118); near(b.maxX - b.minX, 166.73);
  near(chassis.front_axle.x_mm, 91);
  const sensors = sensorsLeftToRight(chassis);
  assert.equal(sensors.length, 8);
  sensors.forEach((s, i) => {
    assert.equal(s.x_mm, 48);
    near(s.y_mm, (3.5 - i) * 11.15);
  });
  assert.equal(chassis.collision.include_wheels, false);
});

test('wheel geometry uses center spacing and diameter, without changing collision vertices', () => {
  const chassis = fixture(), polygon = structuredClone(chassis.collision.outline_xy_mm);
  const model = wheels(chassis);
  assert.equal(model.length, 4);
  const left = model.find(w => w.id === 'drive-left')!;
  assert.deepEqual(left.center, [0, 45.18]);
  const b = bounds(left.outline);
  near(b.maxX - b.minX, 65); near(b.maxY - b.minY, 26.04);
  assert.deepEqual(chassis.collision.outline_xy_mm, polygon);
});

test('pose transform preserves axle origin and gives left/up placement in front-up view', () => {
  const pose = { x: 20, y: 30, heading: Math.PI / 2 };
  assert.deepEqual(localToWorld([0, 0], pose), [20, 30]);
  const forward = localToWorld([48, 0], pose), left = localToWorld([0, 39.025], pose);
  near(forward[0], 20); near(forward[1], 78);
  near(left[0], -19.025); near(left[1], 30);
});

test('concave polygons remain unchanged and either winding is accepted', () => {
  const chassis = fixture();
  const notch = [[0, 0], [6, 0], [6, 6], [3, 2], [0, 6]] as [number, number][];
  chassis.collision.outline_xy_mm = notch;
  assert.deepEqual(parseChassis(stringify(chassis)).collision.outline_xy_mm, notch);
  assert.equal(polygonError([...notch].reverse()), undefined);
});

test('rejects crossed, repeated, collinear and backtracking polygons', () => {
  for (const polygon of [
    [[0, 0], [4, 4], [0, 4], [4, 0]],
    [[0, 0], [4, 0], [4, 4], [0, 0]],
    [[0, 0], [2, 0], [4, 0]],
    [[0, 0], [4, 0], [2, 0], [2, 4], [0, 4]],
  ] as [number, number][][]) assert.ok(polygonError(polygon));
});

test('invalid dimensions, units, unsupported collision mode and unknown fields fail clearly', () => {
  assert.throws(() => parseChassis(yaml.replace('units: mm', 'units: cm')), /units: must be mm/);
  assert.throws(() => parseChassis(yaml.replace('track_width_mm: 90.36', 'track_width_mm: -1')), /drive_axle.track_width_mm/);
  assert.throws(() => parseChassis(yaml.replace('track_width_mm: 90.36', 'track_width_mm: .nan')), /finite number/);
  assert.throws(() => parseChassis(yaml.replace('include_wheels: false', 'include_wheels: true')), /collision.include_wheels/);
  assert.throws(() => parseChassis(yaml + '\ntrack_wdth: 90\n'), /unknown field/);
  assert.throws(() => parseChassis(yaml + '\nname: duplicate\n'), /unique/);
});

test('sensor IDs, count and explicit ordering are validated; positions list order is independent', () => {
  const chassis = fixture();
  chassis.sensors.positions.reverse();
  assert.equal(sensorsLeftToRight(parseChassis(stringify(chassis)))[0].id, 's0');
  chassis.sensors.left_to_right_ids.reverse();
  assert.throws(() => parseChassis(stringify(chassis)), /decreasing local y/);
  const duplicate = fixture(); duplicate.sensors.positions[1].id = 's0';
  assert.throws(() => parseChassis(stringify(duplicate)), /unique/);
  const missing = fixture(); missing.sensors.positions.pop();
  assert.throws(() => parseChassis(stringify(missing)), /exactly eight/);
});

test('exported configuration roundtrips without losing precision or review notes', () => {
  assert.deepEqual(parseChassis(stringify(fixture())), fixture());
});

test('both chassis use symmetrical collision polygons and equal front wheels flush with their outlines', () => {
  for (const source of [yaml, secondYaml]) {
    const chassis = parseChassis(source), polygon = chassis.collision.outline_xy_mm;
    assert.deepEqual(chassis.review_notes, []);
    const b = bounds(polygon), front = wheels(chassis).filter(w => w.kind === 'omni');
    near(bounds(front[0].outline).maxY, b.maxY);
    near(bounds(front[1].outline).minY, b.minY);
    polygon.forEach(([x, y]) => assert.ok(polygon.some(p => p[0] === x && p[1] === -y)));
  }
});

test('T100L101 uses its own drawing dimensions and the shared sensor pitch', () => {
  const chassis = parseChassis(secondYaml), b = bounds(chassis.collision.outline_xy_mm);
  near(b.maxY - b.minY, 128); near(b.maxX - b.minX, 176.73);
  near(chassis.drive_axle.track_width_mm, 100.36);
  near(chassis.front_axle.track_width_mm, 92.6);
  near(chassis.front_axle.x_mm, 101);
  sensorsLeftToRight(chassis).forEach((s, i) => {
    near(s.x_mm, 56); near(s.y_mm, (3.5 - i) * 11.15);
  });
});
