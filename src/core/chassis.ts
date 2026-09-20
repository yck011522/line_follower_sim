import type { Point } from './geometry';

export interface Axle {
  track_width_mm: number;
  wheel_diameter_mm: number;
  tire_width_mm: number;
}
export interface Sensor { id: string; x_mm: number; y_mm: number }
export interface Chassis {
  schema_version: 1;
  name: string;
  units: 'mm';
  source: string;
  review_notes: string[];
  drive_axle: Axle;
  front_axle: Axle & { x_mm: number; wheel_type: 'passive_omni' };
  sensors: { left_to_right_ids: string[]; positions: Sensor[] };
  collision: { mode: 'explicit_polygon'; include_wheels: false; outline_xy_mm: Point[] };
}
export interface Wheel { id: string; kind: 'drive' | 'omni'; center: Point; outline: Point[] }

export function wheels(chassis: Chassis): Wheel[] {
  return ([['drive', 0, chassis.drive_axle], ['omni', chassis.front_axle.x_mm, chassis.front_axle]] as const)
    .flatMap(([kind, x, axle]) => [1, -1].map(side => {
      const y = side * axle.track_width_mm / 2;
      const dx = axle.wheel_diameter_mm / 2, dy = axle.tire_width_mm / 2;
      return {
        id: `${kind}-${side === 1 ? 'left' : 'right'}`, kind,
        center: [x, y] as Point,
        outline: [[x - dx, y - dy], [x + dx, y - dy], [x + dx, y + dy], [x - dx, y + dy]] as Point[],
      };
    }));
}

export function sensorsLeftToRight(chassis: Chassis): Sensor[] {
  return chassis.sensors.left_to_right_ids.map(id => chassis.sensors.positions.find(s => s.id === id)!);
}
