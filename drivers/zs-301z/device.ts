'use strict';

import { ZigBeeDevice } from 'homey-zigbeedriver';
import { CLUSTER } from 'zigbee-clusters';

import { TuyaDataTypes, TUYA_CLUSTER_ID } from '../../lib/TuyaCluster';
import { decodeTuyaDpValuesFromZclFrame } from '../../lib/tuyaFrame';
import { clampPercent, rawTemperatureTimes10ToCelsius } from '../../lib/utils';
import {
  clampHumidityCalibration,
  clampSamplingSeconds,
  clampSoilCalibration,
  clampSoilWarning,
  toTuyaTemperatureCalibrationTenths,
} from '../../lib/zs301z';
import { DP_HANDLERS, DP_WRITE, DEFAULTS } from '../../lib/zs301zDatapoints';

module.exports = class ZS301ZDevice extends ZigBeeDevice {

  private tuyaCluster: any = null;
  private pendingSettingsApply = false;
  private endpoint1: any = null;
  private lastWakeHandledAt = 0;

  async onNodeInit({ zclNode }: { zclNode: any }) {
    this.log('ZS-301Z device initialized');

    this.log('Available endpoints:', Object.keys(zclNode.endpoints));
    for (const [endpointId, endpoint] of Object.entries(zclNode.endpoints)) {
      this.log(`Endpoint ${endpointId} clusters:`, Object.keys((endpoint as any).clusters));
    }

    const endpoint = zclNode.endpoints[1];
    if (!endpoint) {
      this.error('Endpoint 1 not found');
      return;
    }
    this.endpoint1 = endpoint;

    if (!this.hasCapability('measure_soil_fertility')) {
      await this.addCapability('measure_soil_fertility').catch(this.error);
    }

    const isSleepy = this.isDeviceSleepy();
    this.log(`Device is ${isSleepy ? 'sleepy (battery-powered)' : 'always-on'}`);

    const isFirstInit = typeof (this as any).isFirstInit === 'function' ? (this as any).isFirstInit() : false;
    if (isFirstInit) {
      this.log('First init - sending Tuya magic packet');
      await this.configureMagicPacket(zclNode).catch(this.error);
    }

    this.tuyaCluster = endpoint.clusters['tuya'] || endpoint.clusters[TUYA_CLUSTER_ID];

    if (this.tuyaCluster) {
      this.log('Tuya cluster found!');
      this.setupTuyaListeners();
    } else {
      this.log('Tuya cluster not found, trying to bind...');
      try {
        await endpoint.bind('tuya');
        this.tuyaCluster = endpoint.clusters['tuya'];
        if (this.tuyaCluster) {
          this.log('Tuya cluster bound successfully');
          this.setupTuyaListeners();
        }
      } catch (err) {
        this.log('Could not bind Tuya cluster:', err);
      }
    }

    this.registerRawReportHandler(zclNode);

    if (isSleepy) {
      this.log('Device is sleepy - will apply settings and read battery when device wakes up');
    } else {
      if (this.tuyaCluster) {
        await this.applyDeviceSettings().catch(this.error);
      }
      await this.readBattery(endpoint).catch(this.error);
    }
  }

  private async applyDeviceSettings(): Promise<void> {
    if (!this.tuyaCluster) return;

    const soilSampling = clampSamplingSeconds(this.getSetting('soil_sampling') ?? DEFAULTS.SAMPLING_SECONDS);
    const soilCalibration = clampSoilCalibration(this.getSetting('soil_calibration') ?? DEFAULTS.CALIBRATION);
    const humidityCalibration = clampHumidityCalibration(this.getSetting('humidity_calibration') ?? DEFAULTS.CALIBRATION);
    const tempCalibration = toTuyaTemperatureCalibrationTenths(this.getSetting('temperature_calibration') ?? DEFAULTS.CALIBRATION);
    const soilWarning = clampSoilWarning(this.getSetting('soil_warning') ?? DEFAULTS.SOIL_WARNING_PERCENT);

    await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_SAMPLING, soilSampling);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_CALIBRATION, soilCalibration);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.HUMIDITY_CALIBRATION, humidityCalibration);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.TEMP_CALIBRATION, tempCalibration);
    await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_WARNING, soilWarning);

    this.log('Applied device settings', { soilSampling, soilCalibration, humidityCalibration, tempCalibration, soilWarning });
  }

  private setupTuyaListeners() {
    if (!this.tuyaCluster) return;

    this.tuyaCluster.on('reporting', (args: any) => {
      this.log('Tuya reporting event:', args);
      this.processTuyaReport(args);
    });

    this.tuyaCluster.on('response', (args: any) => {
      this.log('Tuya response event:', args);
      this.processTuyaReport(args);
    });

    this.tuyaCluster.on('datapoint', (args: any) => {
      this.log('Tuya datapoint event:', args);
      this.processTuyaReport(args);
    });
  }

  private registerRawReportHandler(zclNode: any) {
    const endpoint = zclNode.endpoints[1];
    if (!endpoint) return;

    const originalHandleFrame = endpoint.handleFrame?.bind(endpoint);
    if (originalHandleFrame) {
      endpoint.handleFrame = (clusterId: number, frame: Buffer, meta: any) => {
        if (clusterId === TUYA_CLUSTER_ID) {
          this.log('Raw Tuya frame received, cluster:', clusterId);
          this.log('Frame data:', frame.toString('hex'));
          this.parseRawTuyaFrame(frame);
          this.onDeviceAwake().catch(this.error);
        }
        return originalHandleFrame(clusterId, frame, meta);
      };
      this.log('Registered raw frame handler for Tuya cluster');
    }
  }

  private parseRawTuyaFrame(frame: Buffer) {
    try {
      const decoded = decodeTuyaDpValuesFromZclFrame(frame);
      if (decoded.dpValues.length === 0) return;

      this.log(
        `Decoded Tuya frame: cmd=${decoded.commandId} status=${decoded.status} transid=${decoded.transid} dpCount=${decoded.dpValues.length}`,
      );

      for (const dpValue of decoded.dpValues) {
        this.processDataPoint(dpValue.dp, dpValue.datatype, dpValue.data);
      }
    } catch (error) {
      this.error('Error parsing raw Tuya frame:', error);
    }
  }

  private processTuyaReport(args: any) {
    if (!args) return;
    this.log('Processing Tuya report:', JSON.stringify(args));
    const { dp, datatype, data } = args;
    if (typeof dp === 'number' && data) {
      this.processDataPoint(dp, datatype || 0, Buffer.isBuffer(data) ? data : Buffer.from([data]));
    }
  }

  private parseDpValue(datatype: number, data: Buffer): number | boolean {
    switch (datatype) {
      case TuyaDataTypes.BOOL:
        return data.readUInt8(0) !== 0;
      case TuyaDataTypes.VALUE:
        if (data.length >= 4) return data.readInt32BE(0);
        if (data.length >= 2) return data.readInt16BE(0);
        return data.readUInt8(0);
      case TuyaDataTypes.ENUM:
        return data.readUInt8(0);
      default:
        if (data.length >= 4) return data.readInt32BE(0);
        if (data.length >= 2) return data.readUInt16BE(0);
        if (data.length >= 1) return data.readUInt8(0);
        throw new Error(`Unknown datatype ${datatype} or empty data`);
    }
  }

  private processDataPoint(dp: number, datatype: number, data: Buffer) {
    const mapping = DP_HANDLERS[dp];
    if (!mapping) {
      this.log(`Unknown DP ${dp} (type: ${datatype})`);
      return;
    }

    const rawValue = this.parseDpValue(datatype, data);
    const value = mapping.divideBy && typeof rawValue === 'number'
      ? rawValue / mapping.divideBy
      : rawValue;

    this.log(`Processing DP ${dp} = ${value} (handler: ${mapping.handler})`);

    switch (mapping.handler) {
      case 'temperature':
        if (typeof rawValue === 'number') {
          const tempC = rawTemperatureTimes10ToCelsius(rawValue);
          this.log(`Setting temperature to ${tempC}°C`);
          if (this.hasCapability('measure_temperature')) {
            this.setCapabilityValue('measure_temperature', tempC).catch(this.error);
          }
        }
        break;

      case 'soilMoisture':
        if (typeof value === 'number') {
          const soilMoisture = clampPercent(value);
          this.log(`Setting soil moisture to ${soilMoisture}%`);
          if (this.hasCapability('measure_soil_moisture')) {
            this.setCapabilityValue('measure_soil_moisture', soilMoisture).catch(this.error);
          }
          if (this.hasCapability('alarm_water')) {
            const threshold = this.getSetting('soil_warning') ?? DEFAULTS.SOIL_WARNING_PERCENT;
            const alarm = soilMoisture < threshold;
            this.log(`Setting water alarm to ${alarm} (moisture ${soilMoisture}% vs threshold ${threshold}%)`);
            this.setCapabilityValue('alarm_water', alarm).catch(this.error);
          }
        }
        break;

      case 'humidity':
        if (typeof value === 'number') {
          const humidity = clampPercent(value);
          this.log(`Setting humidity to ${humidity}%`);
          if (this.hasCapability('measure_humidity')) {
            this.setCapabilityValue('measure_humidity', humidity).catch(this.error);
          }
        }
        break;

      case 'illuminance':
        if (typeof value === 'number') {
          this.log(`Setting illuminance to ${value} lx`);
          if (this.hasCapability('measure_luminance')) {
            this.setCapabilityValue('measure_luminance', value).catch(this.error);
          }
        }
        break;

      case 'battery':
        if (typeof value === 'number') {
          const battery = clampPercent(value);
          this.log(`Setting battery to ${battery}%`);
          if (this.hasCapability('measure_battery')) {
            this.setCapabilityValue('measure_battery', battery).catch(this.error);
          }
        }
        break;

      case 'soilFertility':
        if (typeof value === 'number') {
          this.log(`Setting soil fertility to ${value} mg/kg`);
          if (this.hasCapability('measure_soil_fertility')) {
            this.setCapabilityValue('measure_soil_fertility', value).catch(this.error);
          }
        }
        break;

      case 'waterWarning': {
        let alarm: boolean;
        if (typeof value === 'boolean') {
          alarm = value;
        } else if (typeof value === 'number') {
          alarm = value !== 0;
        } else {
          break;
        }
        this.log(`Setting water alarm to ${alarm}`);
        if (this.hasCapability('alarm_water')) {
          this.setCapabilityValue('alarm_water', alarm).catch(this.error);
        }
        break;
      }

      case 'setting':
        this.log(`Setting DP ${dp} confirmed: ${value}`);
        break;
    }
  }

  private async readBattery(endpoint: any) {
    if (!endpoint.clusters[CLUSTER.POWER_CONFIGURATION.NAME]) {
      this.log('PowerConfiguration cluster not available');
      return;
    }
    try {
      const batteryStatus = await endpoint.clusters[CLUSTER.POWER_CONFIGURATION.NAME].readAttributes(['batteryPercentageRemaining']);
      if (batteryStatus.batteryPercentageRemaining !== undefined) {
        const battery = Math.round(batteryStatus.batteryPercentageRemaining / 2);
        this.log('Battery level from PowerConfiguration:', battery, '%');
        if (this.hasCapability('measure_battery')) {
          await this.setCapabilityValue('measure_battery', battery);
        }
      }
    } catch (err) {
      this.log('Could not read battery (device may be sleeping):', err);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: Record<string, any>;
    newSettings: Record<string, any>;
    changedKeys: string[];
  }): Promise<void> {
    this.log('Settings changed:', changedKeys);

    const isSleepy = this.isDeviceSleepy();

    if (isSleepy) {
      this.log('Device is sleepy - queueing settings for next wake-up');
      this.pendingSettingsApply = true;
    } else if (this.tuyaCluster) {
      for (const key of changedKeys) {
        const value = newSettings[key];
        try {
          if (key === 'soil_sampling') {
            await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_SAMPLING, clampSamplingSeconds(value ?? DEFAULTS.SAMPLING_SECONDS));
          }
          if (key === 'soil_calibration') {
            await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_CALIBRATION, clampSoilCalibration(value ?? DEFAULTS.CALIBRATION));
          }
          if (key === 'humidity_calibration') {
            await this.tuyaCluster.setDatapointValue(DP_WRITE.HUMIDITY_CALIBRATION, clampHumidityCalibration(value ?? DEFAULTS.CALIBRATION));
          }
          if (key === 'temperature_calibration') {
            await this.tuyaCluster.setDatapointValue(DP_WRITE.TEMP_CALIBRATION, toTuyaTemperatureCalibrationTenths(value ?? DEFAULTS.CALIBRATION));
          }
          if (key === 'soil_warning') {
            await this.tuyaCluster.setDatapointValue(DP_WRITE.SOIL_WARNING, clampSoilWarning(value ?? DEFAULTS.SOIL_WARNING_PERCENT));
          }
        } catch (err) {
          this.error('Failed to apply setting to device:', err);
        }
      }
    }
  }

  async onDeleted() {
    this.log('ZS-301Z device deleted');
  }

  async onEndDeviceAnnounce(): Promise<void> {
    this.log('Device announced (woke up from sleep)');
    await this.onDeviceAwake();
  }

  private async configureMagicPacket(zclNode: any): Promise<void> {
    const endpoints = Object.values(zclNode.endpoints || {}) as any[];
    const candidates = endpoints.filter((e) => e?.clusters?.[CLUSTER.BASIC.NAME]);
    for (const endpoint of candidates) {
      try {
        await endpoint.clusters[CLUSTER.BASIC.NAME].readAttributes([
          'manufacturerName',
          'zclVersion',
          'appVersion',
          'modelId',
          'powerSource',
        ]);
        this.log('Sent Tuya configureMagicPacket readAttributes');
        return;
      } catch (err) {
        this.log('Tuya configureMagicPacket readAttributes failed on endpoint, trying next:', err);
      }
    }
  }

  private isDeviceSleepy(): boolean {
    return (this as any).node?.receiveWhenIdle === false;
  }

  private async onDeviceAwake(): Promise<void> {
    const now = Date.now();
    const DEBOUNCE_MS = 5000;

    if (now - this.lastWakeHandledAt < DEBOUNCE_MS) {
      this.log('Skipping duplicate wake handling (debounce)');
      return;
    }
    this.lastWakeHandledAt = now;

    this.log('Handling device wake-up');
    await this.setAvailable().catch(this.error);

    if (this.pendingSettingsApply) {
      this.log('Applying pending user settings...');
      await this.applyDeviceSettings().catch(this.error);
      this.pendingSettingsApply = false;
    }

    if (this.endpoint1) {
      await this.readBattery(this.endpoint1).catch(this.error);
    }
  }

};
