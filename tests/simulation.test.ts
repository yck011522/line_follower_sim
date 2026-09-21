import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChassis } from '../src/core/config.ts';
import { parseBoard } from '../src/core/board-config.ts';
import { resolveBoard } from '../src/core/sensing.ts';
import { createSimulation, runToCompletion, stepSimulation } from '../src/core/simulation.ts';

const chassis = parseChassis(readFileSync(new URL('../configs/chassis/T90L91.yaml', import.meta.url), 'utf8'));
const secondChassis = parseChassis(readFileSync(new URL('../configs/chassis/T100L101.yaml', import.meta.url), 'utf8'));
const design = parseBoard(readFileSync(new URL('../configs/boards/board_4_3_loop.yaml', import.meta.url), 'utf8'));
const board = resolveBoard(design, { lineWidthMm: 20, turnRadiusMm: 80 });
const config = { durationS: .4, controlDtS: .02, lineLossGraceS: .1, maxMotionSubstepMm: 2, maxRotationSubstepRad: Math.PI / 90,
  controller: { targetSpeedMmS: 100, accelerationMmS2: 300, decelerationMmS2: 2000, kp: .08, ki: 0, kd: .002, integralLimitMmS: 100, maxYawRateRadS: 3, maxWheelSpeedMmS: 250 } };

test('identical conditions produce identical aggregate summaries without history', () => {
  const a = runToCompletion(createSimulation(chassis, board, { x: 240, y: 120, heading: 0 }, config));
  const b = runToCompletion(createSimulation(chassis, board, { x: 240, y: 120, heading: 0 }, config));
  assert.deepEqual(a, b);
  assert.equal(a.status, 'completed'); assert.equal(a.steps, 20); assert.ok(a.distanceTraveledMm > 0);
  assert.equal('trajectory' in a, false); assert.equal('observations' in a, false); assert.equal('commands' in a, false);
});

test('stepping and tight-loop execution use the same deterministic core', () => {
  const state = createSimulation(chassis, board, { x: 240, y: 120, heading: 0 }, config);
  while (state.status === 'running') stepSimulation(state);
  const expected = runToCompletion(createSimulation(chassis, board, { x: 240, y: 120, heading: 0 }, config));
  assert.deepEqual(runToCompletion(state), expected);
});

test('initial column contact is reported without advancing time', () => {
  const summary = runToCompletion(createSimulation(chassis, board, { x: 240, y: 240, heading: 0 }, config));
  assert.equal(summary.status, 'collision'); assert.equal(summary.actualDurationS, 0); assert.equal(summary.collisionColumnId, 'C1_1');
});

test('baseline PID follows the loop for a 60-second nominal trial with both chassis', () => {
  const baseline = { ...config, durationS: 60, controller: { ...config.controller, targetSpeedMmS: 120 } };
  for (const candidate of [chassis, secondChassis]) {
    const summary = runToCompletion(createSimulation(candidate, board, { x: 240, y: 120, heading: 0 }, baseline));
    assert.equal(summary.status, 'completed', `${candidate.name}: ${JSON.stringify(summary)}`);
    assert.ok(summary.distanceTraveledMm > 6000);
    assert.ok(summary.minimumClearanceMm !== null && summary.minimumClearanceMm > 0);
  }
});
