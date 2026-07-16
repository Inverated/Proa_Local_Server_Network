# Mast Monitor Package

This zip contains:

- `firmware/top_node/top_node.ino`  
  BLE peripheral for the mast-top XIAO.
- `firmware/base_node/base_node.ino`  
  BLE bridge for the mast-base XIAO. It connects to the top node and exposes a second BLE service to your PC.
- `node_app/`  
  Local Node.js dashboard and CSV logger.

## Arduino libraries needed

Install these in Arduino IDE:

- `ArduinoBLE`
- `Seeed Arduino LSM6DS3`

The firmware in this zip is written for the Seeed `LSM6DS3.h` API:

```cpp
#include "LSM6DS3.h"
LSM6DS3 myIMU(I2C_MODE, 0x6A);
```

## Board package

Use the Seeed nRF52 mbed-enabled board package for the XIAO nRF52840 Sense.

## Flash order

1. Upload `top_node.ino` to the mast-top XIAO.
2. Upload `base_node.ino` to the mast-base XIAO.
3. Open Serial Monitor on the base node and confirm it finds `XIAO_TOP_IMU`.

## Node dashboard setup

From `node_app/`:

```bash
npm install
npm start
```

Then open:

```text
http://127.0.0.1:8000
```

Use Chrome on Windows for Web Bluetooth.

## BLE names and UUIDs

### Top node
- Device name: `XIAO_TOP_IMU`
- Service UUID: `19B10010-E8F2-537E-4F6C-D104768A1214`
- Characteristic UUID: `19B10011-E8F2-537E-4F6C-D104768A1214`

### Base node (PC-facing)
- Device name: `XIAO_BASE_BRIDGE`
- Service UUID: `7A100000-3E2D-4B6A-9F10-112233445566`
- Telemetry characteristic UUID: `7A100001-3E2D-4B6A-9F10-112233445566`
- Command characteristic UUID: `7A100002-3E2D-4B6A-9F10-112233445566`

## Commands from dashboard

- `START`
- `STOP`
- `ZERO`

## Notes

- This computes roll/pitch-based angular difference. It is a good first-pass bend estimate.
- Because this uses a 6-axis IMU without a magnetometer, yaw is not part of the solution and long-term absolute heading is not tracked.
- I have packaged the code consistently, but I have not physically hardware-tested this exact end-to-end stack on your two boards.
