import test from 'node:test';
import assert from 'node:assert/strict';
import { correlatedNoise, motionNoise, sensorEdgeOffsets } from '../src/core/noise.ts';

test('correlated noise is deterministic, seeded, smooth, and bounded', () => {
  const a=Array.from({length:100},(_,i)=>correlatedNoise(17,3,i*.07,2));
  const b=Array.from({length:100},(_,i)=>correlatedNoise(17,3,i*.07,2));
  assert.deepEqual(a,b); assert.notDeepEqual(a,Array.from({length:100},(_,i)=>correlatedNoise(18,3,i*.07,2)));
  assert.ok(a.every(v=>v>=-1&&v<=1)); assert.ok(a.slice(1).every((v,i)=>Math.abs(v-a[i])<.2));
});

test('sensor offsets and motion variation obey severity-one bounds', () => {
  for(let i=0;i<100;i++){
    const offsets=sensorEdgeOffsets(['S0','S1','S2'],i*.13,{seed:9,severity:1})!;
    assert.ok(Object.values(offsets).every(v=>Math.abs(v)<=1.5+1e-12));
    const motion=motionNoise(i*.13,120,2,3,{seed:9,severity:1});
    assert.ok(motion.forwardMmS>=120*.97&&motion.forwardMmS<=120);
    assert.ok(motion.yawRadS>=2*(1-.05*2/3)&&motion.yawRadS<=2*(1+.05*2/3));
  }
});

test('zero severity leaves ideal sensing and motion unchanged', () => {
  assert.equal(sensorEdgeOffsets(['S0'],10,{seed:2,severity:0}),undefined);
  assert.deepEqual(motionNoise(10,123,-1.2,3,{seed:2,severity:0}),{forwardMmS:123,yawRadS:-1.2});
});
