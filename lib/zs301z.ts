'use strict';

import { clampInt } from './utils';

export function clampSamplingSeconds(seconds: number): number {
  return clampInt(seconds, 5, 3600);
}

export function clampHumidityCalibration(offset: number): number {
  return clampInt(offset, -30, 30);
}

export function clampSoilCalibration(offset: number): number {
  return clampInt(offset, -30, 30);
}

export function toTuyaTemperatureCalibrationTenths(offsetC: number): number {
  return clampInt(offsetC * 10, -20, 20);
}

export function clampSoilWarning(percent: number): number {
  return clampInt(percent, 0, 100);
}
