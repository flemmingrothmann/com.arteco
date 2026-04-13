'use strict';

import { clampInt } from './utils';

export function clampIlluminanceCalibration(offset: number): number {
  return clampInt(offset, -1000, 1000);
}
