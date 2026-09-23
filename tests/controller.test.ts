import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChassis } from '../src/core/config.ts';
import type { SensorObservation } from '../src/core/sensing.ts';
import { estimateLineError, initialControllerState, updateController } from '../src/core/controller.ts';

const chassis = parseChassis(readFileSync(new URL('../configs/chassis/T90L91.yaml', import.meta.url), 'utf8'));
const observations = (active: string[]): SensorObservation[] => chassis.sensors.left_to_right_ids.map(id => ({ id, world: [0, 0], centerlineDistanceMm: 0, signedEdgeDistanceMm: 0, value: active.includes(id) ? 1 : 0 }));
const config = { targetSpeedMmS: 100, accelerationMmS2: 1000, decelerationMmS2: 2000, kp: .1, ki: 0, kd: 0, integralLimitMmS: 100, maxYawRateRadS: 3, maxWheelSpeedMmS: 250 };

test('sensor centroid has an explicit left-positive sign and no-line state', () => {
  assert.equal(estimateLineError(chassis, observations([])), null);
  assert.equal(estimateLineError(chassis, observations(['s0'])), 39.025);
  assert.equal(estimateLineError(chassis, observations(['s3', 's4'])), 0);
});

test('centered line drives equally and a line on the left requests a left turn', () => {
  const centered = updateController(chassis, observations(['s3', 's4']), initialControllerState(), config, .02);
  assert.equal(centered.command.leftMmS, centered.command.rightMmS);
  const left = updateController(chassis, observations(['s0']), initialControllerState(), config, .02);
  assert.ok(left.command.yawRateRadS > 0);
  assert.ok(left.command.rightMmS > left.command.leftMmS);
  assert.ok(Math.max(Math.abs(left.command.leftMmS), Math.abs(left.command.rightMmS)) <= config.maxWheelSpeedMmS);
});

test('loss of all sensors ramps the forward command toward zero', () => {
  const state = { ...initialControllerState(), forwardSpeedMmS: 100, previousErrorMm: 4, integralMmS: 3 };
  const lost = updateController(chassis, observations([]), state, config, .02);
  assert.equal(lost.command.lineDetected, false);
  assert.equal(lost.command.forwardMmS, 60);
  assert.equal(lost.state.integralMmS, 0);
});

test('an estimator can hold its previous error through a brief sensor gap', () => {
  const tracked=updateController(chassis,observations(['s2']),initialControllerState(),config,.02);
  const held=updateController(chassis,observations([]),tracked.state,config,.02,true,tracked.command.lineErrorMm);
  assert.equal(held.command.lineErrorMm,tracked.command.lineErrorMm);
  assert.equal(held.command.lineDetected,true);
  assert.ok(held.command.forwardMmS>tracked.command.forwardMmS);
  assert.equal(held.command.yawRateRadS,tracked.command.yawRateRadS);
});
