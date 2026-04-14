# ZS-304Z Notes

## Public references

- Zigbee2MQTT device page: <https://www.zigbee2mqtt.io/devices/ZS-304Z.html>
- zigbee-herdsman-converters: <https://github.com/Koenkk/zigbee-herdsman-converters/blob/master/src/devices/tuya.ts>
- Zigbee2MQTT issue references:
  - <https://github.com/Koenkk/zigbee2mqtt/issues/29824>
  - <https://github.com/Koenkk/zigbee2mqtt/issues/30747>
  - <https://github.com/Koenkk/zigbee2mqtt/issues/31561>

## Device summary

- Model: `ZS-304Z`
- Manufacturer: `Arteco`
- Device type: battery-powered sleepy Zigbee end device
- Tuya cluster: `0xEF00` / `61184`
- Data is primarily reported as Tuya datapoints rather than reliable standard Zigbee attribute reports.

## Observed datapoints

- `DP 3` -> soil moisture
- `DP 5` -> temperature
- `DP 14` -> battery state (`low` / `middle` / `high`)
- `DP 101` -> humidity
- `DP 102` -> illuminance
- `DP 103` -> soil sampling
- `DP 104` -> soil calibration
- `DP 105` -> humidity calibration
- `DP 106` -> illuminance calibration
- `DP 107` -> temperature calibration
- `DP 110` -> soil warning threshold
- `DP 111` -> water warning (`none` / `alarm`)

## Driver design choices

### Raw Tuya frames are the primary source

The driver uses raw Tuya frame decoding as the primary datapoint path.

Why:

- The interview shows a Tuya manufacturer cluster (`61184`) and sparse standard attribute support.
- In testing, the device reports individual datapoints in separate Tuya frames.
- Raw frame decoding gives the clearest and most deterministic view of what the sensor actually sends.

Why not the higher-level Tuya cluster events:

- Using both raw frames and parsed Tuya event listeners caused duplicated datapoint handling.
- The raw frame path is easier to reason about and debug.

### `DP 3` is the source for `alarm_water`

Homey `alarm_water` is derived from:

- `soil_moisture < soil_warning`

Why:

- `DP 3` is the actual measured soil moisture value.
- The threshold is user-configurable in Homey.
- This gives a predictable Homey alarm model tied directly to the measured value.

Why not `DP 111`:

- `DP 111` was observed to flap between `alarm` and `none` without producing stable Homey behavior.
- It appears to be a device-internal warning state and is not reliable enough as the main Homey alarm source.

### `DP 14` is not used for `measure_battery`

Why:

- Public references indicate `DP 14` is a battery state enum, not a battery percentage.
- Observed values match `low` / `middle` / `high` semantics, e.g. `2 -> high`.

Why `measure_battery` comes from `powerConfiguration` instead:

- Homey battery monitoring works best with a true battery percentage.
- Standard Zigbee `batteryPercentageRemaining` is the most appropriate source for Homey `measure_battery` when available.

### Known but non-authoritative datapoints are still logged

The driver logs known datapoints such as:

- `DP 14` battery state
- `DP 111` water warning state

Why:

- They are useful for diagnostics.
- They help document per-device behavior.
- They should remain visible in logs even when they are not allowed to drive Homey capabilities directly.

### Unknown datapoints are ignored

Unknown datapoints are logged and not mapped to capabilities.

Why:

- Missing or unknown datapoints must not silently default to `0` or another synthetic value.
- Only explicitly mapped datapoints should affect Homey state.

## Practical implications

- If `DP 111` flaps, this should not by itself cause `alarm_water` to flap in Homey.
- If `DP 14` changes, this should not by itself overwrite Homey battery percentage.
- Multiple Tuya frames in the same wake cycle are expected and should all be parsed.
