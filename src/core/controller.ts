import type { Chassis } from './chassis';
import type { SensorObservation } from './sensing';

export interface PidControllerConfig {
  targetSpeedMmS: number;
  accelerationMmS2: number;
  decelerationMmS2: number;
  kp: number;
  ki: number;
  kd: number;
  integralLimitMmS: number;
  maxYawRateRadS: number;
  maxWheelSpeedMmS: number;
}

export interface ControllerState {
  integralMmS: number;
  previousErrorMm: number | null;
  forwardSpeedMmS: number;
}

export interface WheelCommand {
  leftMmS: number;
  rightMmS: number;
  forwardMmS: number;
  yawRateRadS: number;
  lineErrorMm: number | null;
  lineDetected: boolean;
}

export function initialControllerState(): ControllerState {
  return { integralMmS: 0, previousErrorMm: null, forwardSpeedMmS: 0 };
}

/** Positive error means the observed line is to the chassis' left. */
export function estimateLineError(chassis: Chassis, observations: readonly SensorObservation[]): number | null {
  const sensorById = new Map(chassis.sensors.positions.map(sensor => [sensor.id, sensor]));
  let weightedY = 0, weight = 0;
  for (const observation of observations) {
    if (observation.value <= 0) continue;
    const sensor = sensorById.get(observation.id);
    if (!sensor) throw new Error(`Observation refers to unknown sensor ${observation.id}`);
    weightedY += observation.value * sensor.y_mm;
    weight += observation.value;
  }
  return weight === 0 ? null : weightedY / weight;
}

function approach(current: number, target: number, maximumChange: number): number {
  return current < target ? Math.min(target, current + maximumChange) : Math.max(target, current - maximumChange);
}

function clamp(value: number, limit: number): number { return Math.max(-limit, Math.min(limit, value)); }

export function updateController(
  chassis: Chassis,
  observations: readonly SensorObservation[],
  state: ControllerState,
  config: PidControllerConfig,
  dtS: number,
  forwardEnabled = true,
  estimatedErrorMm?: number | null,
): { state: ControllerState; command: WheelCommand } {
  if (!(dtS > 0)) throw new Error('Controller timestep must be greater than zero');
  const error = estimatedErrorMm === undefined ? estimateLineError(chassis, observations) : estimatedErrorMm;
  const target = forwardEnabled && error !== null ? config.targetSpeedMmS : 0;
  const rate = target > state.forwardSpeedMmS ? config.accelerationMmS2 : config.decelerationMmS2;
  let forward = approach(state.forwardSpeedMmS, target, rate * dtS);

  if (error === null) {
    return {
      state: { integralMmS: 0, previousErrorMm: null, forwardSpeedMmS: forward },
      command: { leftMmS: forward, rightMmS: forward, forwardMmS: forward, yawRateRadS: 0, lineErrorMm: null, lineDetected: false },
    };
  }

  const derivative = state.previousErrorMm === null ? 0 : (error - state.previousErrorMm) / dtS;
  const candidateIntegral = clamp(state.integralMmS + error * dtS, config.integralLimitMmS);
  const rawYaw = config.kp * error + config.ki * candidateIntegral + config.kd * derivative;
  const yaw = clamp(rawYaw, config.maxYawRateRadS);
  const integral = rawYaw !== yaw && Math.sign(error) === Math.sign(rawYaw) ? state.integralMmS : candidateIntegral;

  let left = forward - yaw * chassis.drive_axle.track_width_mm / 2;
  let right = forward + yaw * chassis.drive_axle.track_width_mm / 2;
  const peak = Math.max(Math.abs(left), Math.abs(right));
  if (peak > config.maxWheelSpeedMmS) {
    const scale = config.maxWheelSpeedMmS / peak;
    left *= scale; right *= scale; forward *= scale;
  }
  const realizedYaw = (right - left) / chassis.drive_axle.track_width_mm;
  return {
    state: { integralMmS: integral, previousErrorMm: error, forwardSpeedMmS: forward },
    command: { leftMmS: left, rightMmS: right, forwardMmS: (left + right) / 2, yawRateRadS: realizedYaw, lineErrorMm: error, lineDetected: true },
  };
}
