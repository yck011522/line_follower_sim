import { parseDocument } from 'yaml';
import type { Axle, Chassis, Sensor } from './chassis';
import { polygonError } from './geometry';
import type { Point } from './geometry';

function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`); }
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected a mapping');
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  return record;
}
function number(value: unknown, path: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  if (positive && value <= 0) fail(path, 'must be greater than zero');
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a nonempty string');
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  return value;
}
function strings(value: unknown, path: string): string[] {
  return array(value, path).map((v, i) => string(v, `${path}[${i}]`));
}
function axle(value: unknown, path: string, front = false): Axle {
  const o = object(value, path, ['track_width_mm', 'wheel_diameter_mm', 'tire_width_mm', ...(front ? ['x_mm', 'wheel_type'] : [])]);
  const result = {
    track_width_mm: number(o.track_width_mm, `${path}.track_width_mm`, true),
    wheel_diameter_mm: number(o.wheel_diameter_mm, `${path}.wheel_diameter_mm`, true),
    tire_width_mm: number(o.tire_width_mm, `${path}.tire_width_mm`, true),
  };
  if (result.tire_width_mm >= result.track_width_mm) fail(path, 'left and right wheel envelopes must not overlap');
  return result;
}

export function parseChassis(text: string): Chassis {
  if (text.length > 200_000) fail('YAML', 'file exceeds 200 KB limit');
  const doc = parseDocument(text, { uniqueKeys: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(e => e.message).join('\n'));
  const o = object(doc.toJS({ maxAliasCount: 0 }), 'chassis', [
    'schema_version', 'name', 'units', 'source', 'review_notes', 'drive_axle', 'front_axle', 'sensors', 'collision',
  ]);
  if (o.schema_version !== 1) fail('schema_version', 'only version 1 is supported');
  if (o.units !== 'mm') fail('units', 'must be mm');
  const drive = axle(o.drive_axle, 'drive_axle');
  const front = axle(o.front_axle, 'front_axle', true);
  const f = o.front_axle as Record<string, unknown>;
  if (f.wheel_type !== 'passive_omni') fail('front_axle.wheel_type', 'must be passive_omni');
  const sensorInput = object(o.sensors, 'sensors', ['left_to_right_ids', 'positions']);
  const ids = strings(sensorInput.left_to_right_ids, 'sensors.left_to_right_ids');
  const positions: Sensor[] = array(sensorInput.positions, 'sensors.positions').map((v, i) => {
    const path = `sensors.positions[${i}]`;
    const s = object(v, path, ['id', 'x_mm', 'y_mm']);
    return { id: string(s.id, `${path}.id`), x_mm: number(s.x_mm, `${path}.x_mm`), y_mm: number(s.y_mm, `${path}.y_mm`) };
  });
  if (positions.length !== 8 || ids.length !== 8) fail('sensors', 'exactly eight positions and eight ordered IDs are required');
  if (new Set(ids).size !== 8 || new Set(positions.map(s => s.id)).size !== 8) fail('sensors', 'IDs must be unique');
  if (ids.some(id => !positions.some(s => s.id === id))) fail('sensors', 'ordered IDs must match position IDs');
  const ordered = ids.map(id => positions.find(s => s.id === id)!);
  if (ordered.some((s, i) => i > 0 && s.y_mm > ordered[i - 1].y_mm))
    fail('sensors.left_to_right_ids', 'must follow decreasing local y (left is +y)');
  const c = object(o.collision, 'collision', ['mode', 'include_wheels', 'outline_xy_mm']);
  if (c.mode !== 'explicit_polygon') fail('collision.mode', 'must be explicit_polygon');
  if (c.include_wheels !== false) fail('collision.include_wheels', 'must be false; the supplied polygon is authoritative');
  const polygon: Point[] = array(c.outline_xy_mm, 'collision.outline_xy_mm').map((v, i) => {
    const path = `collision.outline_xy_mm[${i}]`;
    const pair = array(v, path);
    if (pair.length !== 2) fail(path, 'expected [x, y]');
    return [number(pair[0], `${path}.x`), number(pair[1], `${path}.y`)];
  });
  if (polygon.length > 256) fail('collision.outline_xy_mm', 'maximum 256 vertices');
  const error = polygonError(polygon);
  if (error) fail('collision.outline_xy_mm', error);
  return {
    schema_version: 1, name: string(o.name, 'name'), units: 'mm',
    source: o.source === undefined ? '' : string(o.source, 'source'),
    review_notes: o.review_notes === undefined ? [] : strings(o.review_notes, 'review_notes'),
    drive_axle: drive,
    front_axle: { ...front, x_mm: number(f.x_mm, 'front_axle.x_mm', true), wheel_type: 'passive_omni' },
    sensors: { left_to_right_ids: ids, positions },
    collision: { mode: 'explicit_polygon', include_wheels: false, outline_xy_mm: polygon },
  };
}
