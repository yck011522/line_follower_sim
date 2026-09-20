export function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`); }
export function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected a mapping');
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  return record;
}
export function number(value: unknown, path: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  if (positive && value <= 0) fail(path, 'must be greater than zero');
  return value;
}
export function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a nonempty string');
  return value;
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  return value;
}
export function strings(value: unknown, path: string): string[] {
  return array(value, path).map((v, i) => string(v, `${path}[${i}]`));
}
