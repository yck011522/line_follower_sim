import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateDifferential } from '../src/core/dynamics.ts';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('equal wheel speeds integrate a straight line exactly', () => {
  const pose = integrateDifferential({ x: 2, y: 3, heading: 0 }, 100, 100, 80, .5);
  near(pose.x, 52); near(pose.y, 3); near(pose.heading, 0);
});

test('opposite wheel speeds rotate about the axle midpoint', () => {
  const pose = integrateDifferential({ x: 2, y: 3, heading: 0 }, -40, 40, 80, 1);
  near(pose.x, 2); near(pose.y, 3); near(pose.heading, 1);
});

test('one stopped wheel follows the analytic circular arc', () => {
  const pose = integrateDifferential({ x: 0, y: 0, heading: 0 }, 0, 80, 80, Math.PI / 2);
  near(pose.heading, Math.PI / 2); near(pose.x, 40); near(pose.y, 40);
});
