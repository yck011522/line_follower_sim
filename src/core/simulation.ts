import type { Board } from './board-config';
import type { Chassis } from './chassis';
import { closestColumnClearance } from './collision';
import type { PidControllerConfig, ControllerState, WheelCommand } from './controller';
import { estimateLineError, initialControllerState, updateController } from './controller';
import { integrateDifferential } from './dynamics';
import type { Pose } from './geometry';
import type { PreparedLine, SensorObservation } from './sensing';
import { observeSensors, prepareLine } from './sensing';
import type { NoiseConfig } from './noise';
import { motionNoise, sensorEdgeOffsets } from './noise';

/** Bump whenever numerical behavior changes so persisted sweep results are invalidated. */
export const SIMULATION_ENGINE_VERSION = 'browser-core-0.7';
export const HF_YAW_CUTOFF_HZ = 2;

export type SimulationStatus = 'running' | 'completed' | 'line_loss' | 'cancelled';
export interface SimulationConfig {
  durationS: number;
  controlDtS: number;
  lineLossGraceS: number;
  maxMotionSubstepMm: number;
  maxRotationSubstepRad: number;
  motorOutputDelayS?: number;
  controller: PidControllerConfig;
  noise?: NoiseConfig;
}
export interface SimulationSummary {
  status: Exclude<SimulationStatus, 'running'>;
  success: boolean;
  requestedDurationS: number;
  actualDurationS: number;
  steps: number;
  distanceTraveledMm: number;
  minimumClearanceMm: number | null;
  minimumClearanceColumnId: string | null;
  minimumClearanceTimeS: number | null;
  rmsLineErrorMm: number | null;
  maximumAbsoluteLineErrorMm: number | null;
  hfYawRateRmsRadS: number;
  validErrorDurationS: number;
  totalLineLossDurationS: number;
  longestLineLossDurationS: number;
  firstNonpositiveClearanceColumnId: string | null;
  firstNonpositiveClearanceTimeS: number | null;
  finalPose: Pose;
}
interface Metrics {
  distanceMm: number; minClearanceMm: number; minColumnId: string | null; minTimeS: number | null;
  errorSquaredTime: number; maxAbsError: number; validErrorS: number;
  hfYawSquaredTime: number; filteredYawRadS: number;
  totalLossS: number; currentLossS: number; longestLossS: number;
  firstNonpositiveColumnId: string | null; firstNonpositiveTimeS: number | null;
}
export interface SimulationState {
  readonly chassis: Chassis; readonly board: Board; readonly line: PreparedLine; readonly config: SimulationConfig;
  pose: Pose; timeS: number; steps: number; status: SimulationStatus; controllerState: ControllerState;
  observations: SensorObservation[]; command: WheelCommand; metrics: Metrics;
  commandHistory: Array<{ timeS:number; command:WheelCommand }>;
}

const stoppedCommand: WheelCommand = { leftMmS: 0, rightMmS: 0, forwardMmS: 0, yawRateRadS: 0, lineErrorMm: null, lineDetected: false };

function delayedCommand(history:SimulationState['commandHistory'],timeS:number):WheelCommand {
  if(timeS<0||!history.length)return{...stoppedCommand};
  if(timeS<=history[0].timeS)return history[0].timeS===timeS?history[0].command:{...stoppedCommand};
  for(let i=1;i<history.length;i++)if(timeS<=history[i].timeS){const a=history[i-1],b=history[i],fraction=(timeS-a.timeS)/(b.timeS-a.timeS),mix=(x:number,y:number)=>x+(y-x)*fraction;return{leftMmS:mix(a.command.leftMmS,b.command.leftMmS),rightMmS:mix(a.command.rightMmS,b.command.rightMmS),forwardMmS:mix(a.command.forwardMmS,b.command.forwardMmS),yawRateRadS:mix(a.command.yawRateRadS,b.command.yawRateRadS),lineErrorMm:a.command.lineErrorMm,lineDetected:a.command.lineDetected};}
  return history.at(-1)!.command;
}

export function createSimulation(chassis: Chassis, board: Board, initialPose: Pose, config: SimulationConfig): SimulationState {
  if (!(config.durationS > 0 && config.controlDtS > 0 && config.lineLossGraceS >= 0)) throw new Error('Duration and timestep must be positive; line-loss grace must be non-negative');
  if (!(config.maxMotionSubstepMm > 0 && config.maxRotationSubstepRad > 0)) throw new Error('Motion substep limits must be positive');
  if (config.motorOutputDelayS !== undefined && (!(config.motorOutputDelayS >= 0) || !Number.isFinite(config.motorOutputDelayS))) throw new Error('Motor output delay must be finite and non-negative');
  if (config.noise && (!(config.noise.severity >= 0) || !Number.isInteger(config.noise.seed))) throw new Error('Noise severity must be non-negative and its seed must be an integer');
  const line = prepareLine(board), observations = observeSensors(chassis, initialPose, line,
    sensorEdgeOffsets(chassis.sensors.left_to_right_ids, 0, config.noise));
  const closest = closestColumnClearance(board, chassis, initialPose);
  return {
    chassis, board, line, config, pose: { ...initialPose }, timeS: 0, steps: 0,
    status: 'running', controllerState: initialControllerState(), observations, command: { ...stoppedCommand }, commandHistory:[],
    metrics: { distanceMm: 0, minClearanceMm: closest?.clearanceMm ?? Infinity, minColumnId: closest?.columnId ?? null,
      minTimeS: closest ? 0 : null, errorSquaredTime: 0, maxAbsError: 0, validErrorS: 0, totalLossS: 0,
      hfYawSquaredTime:0,filteredYawRadS:0,
      currentLossS: 0, longestLossS: 0, firstNonpositiveColumnId: closest?.collision ? closest.columnId : null,
      firstNonpositiveTimeS: closest?.collision ? 0 : null },
  };
}

export function stepSimulation(state: SimulationState): void {
  if (state.status !== 'running') return;
  const dt = Math.min(state.config.controlDtS, state.config.durationS - state.timeS);
  if (dt <= 1e-12) { state.status = 'completed'; return; }
  state.observations = observeSensors(state.chassis, state.pose, state.line, sensorEdgeOffsets(state.chassis.sensors.left_to_right_ids, state.timeS, state.config.noise));
  const observedError = estimateLineError(state.chassis, state.observations);
  if (observedError === null) {
    state.metrics.totalLossS += dt; state.metrics.currentLossS += dt;
    state.metrics.longestLossS = Math.max(state.metrics.longestLossS, state.metrics.currentLossS);
  } else {
    state.metrics.errorSquaredTime += observedError * observedError * dt; state.metrics.validErrorS += dt;
    state.metrics.maxAbsError = Math.max(state.metrics.maxAbsError, Math.abs(observedError)); state.metrics.currentLossS = 0;
  }
  const heldError = observedError ?? (state.metrics.currentLossS <= state.config.lineLossGraceS + 1e-12 ? state.controllerState.previousErrorMm : null);
  const update = updateController(state.chassis, state.observations, state.controllerState, state.config.controller, dt, true, heldError);
  state.controllerState = update.state;
  const requested={...update.command,lineDetected:observedError!==null};state.commandHistory.push({timeS:state.timeS,command:requested});
  const delay=state.config.motorOutputDelayS??0,start=delayedCommand(state.commandHistory,state.timeS-delay),end=delayedCommand(state.commandHistory,state.timeS+dt-delay);
  const applied={...requested,leftMmS:(start.leftMmS+end.leftMmS)/2,rightMmS:(start.rightMmS+end.rightMmS)/2,forwardMmS:(start.forwardMmS+end.forwardMmS)/2,yawRateRadS:(start.yawRateRadS+end.yawRateRadS)/2};state.command=applied;
  while(state.commandHistory.length>2&&state.commandHistory[1].timeS<=state.timeS-delay)state.commandHistory.shift();
  const noisyMotion = motionNoise(state.timeS, applied.forwardMmS, applied.yawRateRadS, state.config.controller.maxYawRateRadS, state.config.noise);
  const filterAlpha=1-Math.exp(-2*Math.PI*HF_YAW_CUTOFF_HZ*dt);
  state.metrics.filteredYawRadS+=filterAlpha*(noisyMotion.yawRadS-state.metrics.filteredYawRadS);
  const hfYaw=noisyMotion.yawRadS-state.metrics.filteredYawRadS;state.metrics.hfYawSquaredTime+=hfYaw*hfYaw*dt;
  const halfTrack = state.chassis.drive_axle.track_width_mm / 2;
  const noisyLeft = noisyMotion.forwardMmS - noisyMotion.yawRadS * halfTrack, noisyRight = noisyMotion.forwardMmS + noisyMotion.yawRadS * halfTrack;
  const translation = Math.abs(noisyMotion.forwardMmS) * dt;
  const rotation = Math.abs(noisyMotion.yawRadS) * dt;
  const substeps = Math.max(1, Math.ceil(translation / state.config.maxMotionSubstepMm), Math.ceil(rotation / state.config.maxRotationSubstepRad));
  const subDt = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    const before = state.pose;
    state.pose = integrateDifferential(before, noisyLeft, noisyRight, state.chassis.drive_axle.track_width_mm, subDt);
    state.metrics.distanceMm += Math.abs(noisyMotion.forwardMmS) * subDt;
    const sampleTime = state.timeS + (i + 1) * subDt;
    const closest = closestColumnClearance(state.board, state.chassis, state.pose);
    if (closest && closest.clearanceMm < state.metrics.minClearanceMm) {
      state.metrics.minClearanceMm = closest.clearanceMm; state.metrics.minColumnId = closest.columnId; state.metrics.minTimeS = sampleTime;
    }
    if (closest?.collision && state.metrics.firstNonpositiveColumnId === null) {
      state.metrics.firstNonpositiveColumnId = closest.columnId; state.metrics.firstNonpositiveTimeS = sampleTime;
    }
  }
  state.timeS += dt;
  state.steps++;
  state.observations = observeSensors(state.chassis, state.pose, state.line, sensorEdgeOffsets(state.chassis.sensors.left_to_right_ids, state.timeS, state.config.noise));
  if (state.status === 'running' && state.metrics.currentLossS >= state.config.lineLossGraceS - 1e-12) state.status = 'line_loss';
  if (state.status === 'running' && state.timeS >= state.config.durationS - 1e-12) state.status = 'completed';
}

export function cancelSimulation(state: SimulationState): void { if (state.status === 'running') state.status = 'cancelled'; }
export function runToCompletion(state: SimulationState): SimulationSummary {
  while (state.status === 'running') stepSimulation(state);
  return simulationSummary(state);
}
export function simulationSummary(state: SimulationState): SimulationSummary {
  if (state.status === 'running') throw new Error('A running simulation has no final summary');
  const m = state.metrics;
  return {
    status: state.status, success: state.status === 'completed', requestedDurationS: state.config.durationS,
    actualDurationS: state.timeS, steps: state.steps, distanceTraveledMm: m.distanceMm,
    minimumClearanceMm: Number.isFinite(m.minClearanceMm) ? m.minClearanceMm : null,
    minimumClearanceColumnId: m.minColumnId, minimumClearanceTimeS: m.minTimeS,
    rmsLineErrorMm: m.validErrorS ? Math.sqrt(m.errorSquaredTime / m.validErrorS) : null,
    maximumAbsoluteLineErrorMm: m.validErrorS ? m.maxAbsError : null, validErrorDurationS: m.validErrorS,
    hfYawRateRmsRadS:Math.sqrt(m.hfYawSquaredTime/Math.max(state.timeS,Number.EPSILON)),
    totalLineLossDurationS: m.totalLossS, longestLineLossDurationS: m.longestLossS,
    firstNonpositiveClearanceColumnId: m.firstNonpositiveColumnId,
    firstNonpositiveClearanceTimeS: m.firstNonpositiveTimeS, finalPose: { ...state.pose },
  };
}
