'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampHumidityCalibration,
  clampSamplingSeconds,
  clampSoilCalibration,
  clampSoilWarning,
  toTuyaTemperatureCalibrationTenths,
} = require('../.homeybuild/lib/zs301z');
const { clampIlluminanceCalibration } = require('../.homeybuild/lib/zs304z');

test('clampHumidityCalibration clamps to -30..30', () => {
  assert.equal(clampHumidityCalibration(0), 0);
  assert.equal(clampHumidityCalibration(30), 30);
  assert.equal(clampHumidityCalibration(-30), -30);
  assert.equal(clampHumidityCalibration(999), 30);
  assert.equal(clampHumidityCalibration(-999), -30);
});

test('clampHumidityCalibration rounds to integer', () => {
  assert.equal(clampHumidityCalibration(5.7), 6);
  assert.equal(clampHumidityCalibration(-5.2), -5);
});

test('clampSamplingSeconds clamps to 5..3600', () => {
  assert.equal(clampSamplingSeconds(5), 5);
  assert.equal(clampSamplingSeconds(3600), 3600);
  assert.equal(clampSamplingSeconds(1), 5);
  assert.equal(clampSamplingSeconds(9999), 3600);
});

test('clampSoilCalibration clamps to -30..30', () => {
  assert.equal(clampSoilCalibration(0), 0);
  assert.equal(clampSoilCalibration(30), 30);
  assert.equal(clampSoilCalibration(-30), -30);
  assert.equal(clampSoilCalibration(999), 30);
});

test('clampSoilWarning clamps to 0..100', () => {
  assert.equal(clampSoilWarning(0), 0);
  assert.equal(clampSoilWarning(100), 100);
  assert.equal(clampSoilWarning(-1), 0);
  assert.equal(clampSoilWarning(999), 100);
});

test('toTuyaTemperatureCalibrationTenths maps °C to tenths with clamp', () => {
  assert.equal(toTuyaTemperatureCalibrationTenths(0), 0);
  assert.equal(toTuyaTemperatureCalibrationTenths(1.0), 10);
  assert.equal(toTuyaTemperatureCalibrationTenths(-0.5), -5);
  assert.equal(toTuyaTemperatureCalibrationTenths(99), 20);
  assert.equal(toTuyaTemperatureCalibrationTenths(-99), -20);
});

test('clampIlluminanceCalibration clamps to -1000..1000', () => {
  assert.equal(clampIlluminanceCalibration(0), 0);
  assert.equal(clampIlluminanceCalibration(1000), 1000);
  assert.equal(clampIlluminanceCalibration(-1000), -1000);
  assert.equal(clampIlluminanceCalibration(2000), 1000);
  assert.equal(clampIlluminanceCalibration(-2000), -1000);
});
