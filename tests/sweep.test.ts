import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSweep, inclusiveRange, robustClearanceCandidate } from '../src/core/sweep.ts';
import type { SimulationSummary } from '../src/core/simulation.ts';

function summary(clearance: number, status: SimulationSummary['status'] = 'completed'): SimulationSummary {
  return { status, success: status === 'completed', requestedDurationS: 1, actualDurationS: 1, steps: 50, distanceTraveledMm: 100,
    minimumClearanceMm: clearance, minimumClearanceColumnId: 'C0_0', minimumClearanceTimeS: .5, rmsLineErrorMm: 1,
    maximumAbsoluteLineErrorMm: 2, validErrorDurationS: 1, totalLineLossDurationS: 0, longestLineLossDurationS: 0,
    collisionColumnId: null, finalPose: { x: 0, y: 0, heading: 0 } };
}

test('inclusive ranges remain stable for decimal steps', () => {
  assert.deepEqual(inclusiveRange(.1, .8, .1), [.1,.2,.3,.4,.5,.6,.7,.8]);
  assert.deepEqual(inclusiveRange(10, 120, 10), [10,20,30,40,50,60,70,80,90,100,110,120]);
  assert.throws(() => inclusiveRange(1, 0, 1), /requires/);
});

test('requested three-dimensional sweep expands to 672 unique conditions', () => {
  const values = { turnRadiusMm: inclusiveRange(10,120,10), lineWidthMm: inclusiveRange(14,26,2), kp: inclusiveRange(.1,.8,.1) };
  const points = expandSweep(values);
  assert.equal(points.length, 672);
  assert.equal(new Set(points.map(point => JSON.stringify(point))).size, 672);
});

test('robust candidate maximizes worst neighboring clearance and excludes boundaries', () => {
  const values = { turnRadiusMm:[10,20,30,40], lineWidthMm:[14,16,18,20], kp:[.1,.2,.3,.4] };
  const results = expandSweep(values).map(point => ({ ...point, summary: summary(point.turnRadiusMm === 30 && point.lineWidthMm === 18 && point.kp === .3 ? 100 : point.turnRadiusMm) }));
  const candidate = robustClearanceCandidate(results, values);
  assert.ok(candidate); assert.equal(candidate.result.turnRadiusMm, 30);
  assert.ok(values.turnRadiusMm.indexOf(candidate.result.turnRadiusMm) > 0);
  assert.ok(values.turnRadiusMm.indexOf(candidate.result.turnRadiusMm) < values.turnRadiusMm.length - 1);
});
