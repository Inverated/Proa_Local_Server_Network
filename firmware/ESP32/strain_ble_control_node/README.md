# Strain BLE control node package

This package gives you a wireless control path between your computer and the custom ESP32 strain-gauge board.

## What is inside

- `firmware/strain_ble_control_node.ino`
  - ESP32 firmware for your PCB
  - Reads the NAU7802 over I2C
  - Exposes BLE control commands
  - Streams live strain readings by BLE notification
- `pc-node/`
  - A tiny local Node.js server
  - Hosts a browser dashboard at `http://localhost:8080`
  - The dashboard uses Web Bluetooth in Chrome/Edge to connect to the ESP32, start/stop sensing, tare, and show live readings

## Your board mapping already matches this firmware

From your schematic:

- ESP32 is an `ESP32-WROOM-32D`
- NAU7802 is connected on I2C
- `SDA = GPIO21`
- `SCL = GPIO22`
- Bridge connector uses `+3.3V`, `SPLUS`, `SMINUS`, and `GND`

## Important limitation

This removes UART for **normal operation**, but the **first firmware upload still needs UART** unless you later add OTA updates.

## Flash the ESP32 firmware

1. Open `firmware/strain_ble_control_node.ino` in Arduino IDE.
2. Make sure the ESP32 board package is installed.
3. Install the library:
   - `SparkFun Qwiic Scale NAU7802 Arduino Library`
4. Select your ESP32 board and COM port.
5. Upload the sketch.

## Start the computer-side control node

1. Install Node.js on the computer if it is not already installed.
2. Open a terminal in `pc-node`.
3. Run:

```bash
node server.js
```

Or on Windows, double-click:

```text
start-node.bat
```

4. Open `http://localhost:8080` in Chrome or Edge.
5. Click **Connect** and choose `StrainNode-ESP32`.

## Controls

- **Start sensing** -> sends `START`
- **Stop sensing** -> sends `STOP`
- **Tare** -> sends `TARE`
- **Apply rate** -> sends `RATE:<10|20|40|80|320>`
- **Refresh status** -> sends `STATUS`

## BLE command set

The ESP32 firmware understands plain-text commands written to the BLE control characteristic:

- `START`
- `STOP`
- `TARE`
- `STATUS`
- `RATE:10`
- `RATE:20`
- `RATE:40`
- `RATE:80`
- `RATE:320`

The ESP32 notifies readings as adjusted raw NAU7802 counts.

## If the page cannot connect

- Use Chrome or Edge, not Firefox.
- Make sure Bluetooth is enabled on the PC.
- Make sure the board is powered by battery/solar or a stable 3.3 V supply.
- After a fresh flash, press reset once on the ESP32 board.
- If the board never appears in the chooser, open Serial Monitor once and confirm the firmware prints:
  - `Ready. Use BLE control commands...`

## If the strain value looks wrong

- Press **Tare** with the structure unloaded.
- Check that the strain bridge wiring matches your PCB connector labels.
- Confirm the NAU7802 is powered at 3.3 V and on the right I2C pins.
