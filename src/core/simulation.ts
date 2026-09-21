import type { Board } from './board-config';
import type { Chassis } from './chassis';
import { closestColumnClearance } from './collision';
import type { PidControllerConfig, ControllerState, WheelCommand } from './controller';
import { initialControllerState, updateController } from './controller';
import { integrateDifferential } from './dynamics';
import type { Pose } from './geometry';
import type { PreparedLine, SensorObservation } from './sensing';
import { observeSensors, prepareLine } from './sensing';

/** Bump whenever numerical behavior changes so persisted sweep results are invalidated. */
export const SIMULATION_ENGINE_VERSION = 'browser-core-0.2';

export type SimulationStatus = 'running' | 'completed' | 'collision' | 'line_loss' | 'cancelled';
export interface SimulationConfig {
  durationS: number;
  controlDtS: number;
  lineLossGraceS: number;
  maxMotionSubstepMm: number;
  maxRotationSubstepRad: number;
  controller: PidControllerConfig;
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
  validErrorDurationS: number;
  totalLineLossDurationS: number;
  longestLineLossDurationS: number;
  collisionColumnId: string | null;
  finalPose: Pose;
}
interface Metrics {
  distanceMm: number; minClearanceMm: number; minColumnId: string | null; minTimeS: number | null;
  errorSquaredTime: number; maxAbsError: number; validErrorS: number;
  totalLossS: number; currentLossS: number; longestLossS: number; collisionColumnId: string | null;
}
export interface SimulationState {
  readonly chassis: Chassis; readonly board: Board; readonly line: PreparedLine; readonly config: SimulationConfig;
  pose: Pose; timeS: number; steps: number; status: SimulationStatus; controllerState: ControllerState;
  observations: SensorObservation[]; command: WheelCommand; metrics: Metrics;
}

const stoppedCommand: WheelCommand = { leftMmS: 0, rightMmS: 0, forwardMmS: 0, yawRateRadS: 0, lineErrorMm: null, lineDetected: false };

export function createSimulation(chassis: Chassis, board: Board, initialPose: Pose, config: SimulationConfig): SimulationState {
  if (!(config.durationS > 0 && config.controlDtS > 0 && config.lineLossGraceS >= 0)) throw new Error('Duration and timestep must be positive; line-loss grace must be non-negative');
  if (!(config.maxMotionSubstepMm > 0 && config.maxRotationSubstepRad > 0)) throw new Error('Motion substep limits must be positive');
  const line = prepareLine(board), observations = observeSensors(chassis, initialPose, line);
  const closest = closestColumnClearance(board, chassis, initialPose);
  return {
    chassis, board, line, config, pose: { ...initialPose }, timeS: 0, steps: 0,
    status: closest?.collision ? 'collision' : 'running', controllerState: initialControllerState(), observations, command: { ...stoppedCommand },
    metrics: { distanceMm: 0, minClearanceMm: closest?.clearanceMm ?? Infinity, minColumnId: closest?.columnId ?? null,
      minTimeS: closest ? 0 : null, errorSquaredTime: 0, maxAbsError: 0, validErrorS: 0, totalLossS: 0,
      currentLossS: 0, longestLossS: 0, collisionColumnId: closest?.collision ? closest.columnId : null },
  };
}

export function stepSimulation(state: SimulationState): void {
  if (state.status !== 'running') return;
  const dt = Math.min(state.config.controlDtS, state.config.durationS - state.timeS);
  if (dt <= 1e-12) { state.status = 'completed'; return; }
  state.observations = observeSensors(state.chassis, state.pose, state.line);
  const update = updateController(state.chassis, state.observations, state.controllerState, state.config.controller, dt, true);
  state.controllerState = update.state; state.command = update.command;
  const error = update.command.lineErrorMm;
  if (error === null) {
    state.metrics.totalLossS += dt; state.metrics.currentLossS += dt;
    state.metrics.longestLossS = Math.max(state.metrics.longestLossS, state.metrics.currentLossS);
  } else {
    state.metrics.errorSquaredTime += error * error * dt; state.metrics.validErrorS += dt;
    state.metrics.maxAbsError = Math.max(state.metrics.maxAbsError, Math.abs(error)); state.metrics.currentLossS = 0;
  }
  const translation = Math.abs(update.command.forwardMmS) * dt;
  const rotation = Math.abs(update.command.yawRateRadS) * dt;
  const substeps = Math.max(1, Math.ceil(translation / state.config.maxMotionSubstepMm), Math.ceil(rotation / state.config.maxRotationSubstepRad));
  const subDt = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    const before = state.pose;
    state.pose = integrateDifferential(before, update.command.leftMmS, update.command.rightMmS, state.chassis.drive_axle.track_width_mm, subDt);
    state.metrics.distanceMm += Math.abs(update.command.forwardMmS) * subDt;
    const sampleTime = state.timeS + (i + 1) * subDt;
    const closest = closestColumnClearance(state.board, state.chassis, state.pose);
    if (closest && closest.clearanceMm < state.metrics.minClearanceMm) {
      state.metrics.minClearanceMm = closest.clearanceMm; state.metrics.minColumnId = closest.columnId; state.metrics.minTimeS = sampleTime;
    }
    if (closest?.collision) { state.status = 'collision'; state.metrics.collisionColumnId = closest.columnId; state.timeS = sampleTime; break; }
  }
  if (state.status === 'running') state.timeS += dt;
  state.steps++;
  state.observations = observeSensors(state.chassis, state.pose, state.line);
  if (state.status === 'running' && state.metrics.currentLossS > state.config.lineLossGraceS + 1e-12) state.status = 'line_loss';
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
    totalLineLossDurationS: m.totalLossS, longestLineLossDurationS: m.longestLossS,
    collisionColumnId: m.collisionColumnId, finalPose: { ...state.pose },
  };
}
