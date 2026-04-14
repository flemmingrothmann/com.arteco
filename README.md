# Arteco for Homey

Adds support for Arteco Zigbee devices.

## Supported Devices

### ZS-301Z Soil Moisture Sensor

A battery-powered Zigbee soil moisture sensor with temperature, humidity, and light sensing.

**Capabilities:**
- Soil Moisture (0-100%)
- Temperature (°C)
- Air Humidity (0-100%)
- Illuminance (lx)
- Battery Low Alarm (alarm instead of percentage; triggers when battery is in "low" state: 1-25%)

**Settings:**
- Humidity Calibration (-30 to +30)
- Report Interval (30-1200 seconds, rounded to nearest 30)

**Technical Details:**
- Zigbee Manufacturer: Arteco (Tuya OEM: `_TZE284_o9ofysmo`, `_TZE284_xc3vwx5a`)
- Zigbee Model: ZS-301Z (Tuya: TS0601)
- Protocol: Tuya Zigbee (Cluster 0xEF00)

**Note:** Some hardware revisions emit messages at a very high rate, causing rapid battery drain. Setting a longer report interval may help if the device respects it.

### ZS-304Z Soil Moisture Sensor

A battery-powered Zigbee soil moisture sensor with temperature, humidity, and light sensing.

**Capabilities:**
- Soil Moisture (0-100%)
- Temperature (°C)
- Air Humidity (0-100%)
- Illuminance (lx)
- Battery Percentage
- Water Shortage Alarm

**Settings:**
- Temperature Calibration (-2.0 to +2.0 °C)
- Humidity Calibration (-30 to +30)
- Soil Moisture Calibration (-30 to +30)
- Illuminance Calibration (-1000 to +1000 lx)
- Soil Sampling Interval (5-3600 seconds)
- Soil Dryness Threshold (0-100%)

**Technical Details:**
- Zigbee Manufacturer: Arteco
- Zigbee Model: ZS-304Z
- Protocol: Tuya Zigbee (Cluster 0xEF00)
- Battery reporting uses Zigbee Power Configuration percentage, while Tuya battery state is kept for diagnostics

**Note:** The device reports most measurements through Tuya datapoints on cluster `0xEF00`.

## Installation

1. Install the app from the Homey App Store
2. Add device: Devices → + → Arteco → `ZS-301Z Soil Sensor` or `ZS-304Z Soil Sensor`
3. Put the sensor in pairing mode (hold button for 5 seconds until LED blinks)
4. Follow the pairing instructions

