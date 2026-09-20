import { parseDocument } from 'yaml';
import { fail, object, number, string, array } from './validation';

export const TILE_TYPES = ['empty', 'straight_ew', 'straight_ns', 'turn_ne', 'turn_nw', 'turn_se', 'turn_sw'] as const;
export type TileType = typeof TILE_TYPES[number];
export interface Tile { type: TileType; radius_mm?: number }
export interface Board {
  schema_version: 1;
  name: string;
  units: 'mm';
  source: string;
  grid_size_mm: number;
  line: { default_width_mm: number; default_turn_radius_mm: number };
  columns: { placement: 'grid_intersections'; display_diameter_mm: number; collision_reference: 'center' };
  tiles: Tile[][];
}
export function isTurn(type: TileType): boolean { return type.startsWith('turn_'); }

export function parseBoard(text: string): Board {
  if (text.length > 200_000) fail('YAML', 'file exceeds 200 KB limit');
  const doc = parseDocument(text, { uniqueKeys: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(e => e.message).join('\n'));
  const o = object(doc.toJS({ maxAliasCount: 0 }), 'board', ['schema_version', 'name', 'units', 'source', 'grid_size_mm', 'line', 'columns', 'tiles']);
  if (o.schema_version !== 1) fail('schema_version', 'only version 1 is supported');
  if (o.units !== 'mm') fail('units', 'must be mm');
  const grid = number(o.grid_size_mm, 'grid_size_mm', true);
  const radius = (v: unknown, path: string) => {
    const r = number(v, path, true);
    if (r > grid / 2) fail(path, `must not exceed half the grid size (${grid / 2} mm)`);
    return r;
  };
  const line = object(o.line, 'line', ['default_width_mm', 'default_turn_radius_mm']);
  const columns = object(o.columns, 'columns', ['placement', 'display_diameter_mm', 'collision_reference']);
  if (columns.placement !== 'grid_intersections') fail('columns.placement', 'must be grid_intersections');
  if (columns.collision_reference !== 'center') fail('columns.collision_reference', 'must be center; display diameter is visual only');
  const diameter = number(columns.display_diameter_mm, 'columns.display_diameter_mm');
  if (diameter < 0) fail('columns.display_diameter_mm', 'must be zero or positive');
  const rows = array(o.tiles, 'tiles');
  if (!rows.length || rows.length > 32) fail('tiles', 'must have 1 to 32 rows');
  let width = 0;
  const tiles: Tile[][] = rows.map((row, r) => {
    const cells = array(row, `tiles[${r}]`);
    if (r === 0) width = cells.length;
    if (!cells.length || cells.length > 32 || cells.length !== width) fail(`tiles[${r}]`, 'rows must have the same length, from 1 to 32 tiles');
    return cells.map((cell, c) => {
      const path = `tiles[${r}][${c}]`;
      const tile = typeof cell === 'string' ? { type: cell } : object(cell, path, ['type', 'radius_mm']);
      const type = string(tile.type, `${path}.type`) as TileType;
      if (!TILE_TYPES.includes(type)) fail(path, `unknown tile type ${type}`);
      if ('radius_mm' in tile) {
        if (!isTurn(type)) fail(path, 'radius_mm is only valid on a turn');
        return { type, radius_mm: radius(tile.radius_mm, `${path}.radius_mm`) };
      }
      return { type };
    });
  });
  return {
    schema_version: 1, name: string(o.name, 'name'), units: 'mm', source: o.source === undefined ? '' : string(o.source, 'source'),
    grid_size_mm: grid,
    line: { default_width_mm: number(line.default_width_mm, 'line.default_width_mm', true), default_turn_radius_mm: radius(line.default_turn_radius_mm, 'line.default_turn_radius_mm') },
    columns: { placement: 'grid_intersections', display_diameter_mm: diameter, collision_reference: 'center' }, tiles,
  };
}
