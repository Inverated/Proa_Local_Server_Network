# IMU ESP-NOW Integration Plan

## Problem Statement
Replace the standalone BLE-to-browser IMU monitoring system with an ESP-NOW based data path that flows through the existing master node and proa_advisor server, making IMU telemetry available in the proa_advisor_react dashboard alongside the existing power management data.

## Requirements
- Base IMU node sends 28-byte telemetry packets to the master via ESP-NOW using the existing PacketTemplate format
- Base node retains BLE central role to collect gravity data from the nRF52840 top node (unchanged)
- Master node forwards raw bytes to the server (unchanged behavior), plus maintains a `header->MAC` lookup table for routing commands back
- Server parses TELE packets, computes derivable fields, and streams IMU data to the React frontend via SSE
- Command path: server sends `TELE|command\n` over serial -> master resolves TELE->MAC -> sends command to base via ESP-NOW
- Base receives commands via ESP-NOW and handles START/STOP/ZERO/RESET_ZERO
- React frontend displays IMU telemetry in a new "Mast Monitor" page similar to the mast-monitor-pairing-display UI

## Architecture

```
Top Node (nRF52840 Sense, BLE Peripheral)
    |
    | BLE GravityPacket (gx, gy, gz, seq)
    v
Base Node (ESP32, BLE Central + ESP-NOW Sender)
    |
    | ESP-NOW 28-byte TELE packet
    v
Master Node (ESP32, ESP-NOW Hub, USB Serial)
    |
    | Serial.write(raw bytes)
    v
proa_advisor (Node.js Server)
    |
    | SSE 'imu' event
    v
proa_advisor_react (Dashboard)

Command path (reverse):
Dashboard -> POST /command/imu -> Server -> Serial "TELE|cmd\n" -> Master -> ESP-NOW -> Base
```

## Packet Structure (28 bytes)

```c
struct __attribute__((packed)) Telemetry_Payload {
  int16_t  baseRoll;            // 2 bytes - fixed point x100
  int16_t  basePitch;           // 2 bytes
  int16_t  topRoll;             // 2 bytes
  int16_t  topPitch;            // 2 bytes
  int16_t  topMinusBaseRoll;    // 2 bytes
  int16_t  topMinusBasePitch;   // 2 bytes
  int16_t  vectorAngle;         // 2 bytes
  uint16_t topSeq;              // 2 bytes
  uint8_t  status;              // 1 byte (bit0=topConnected, bit1=sensingEnabled, bit2=zeroReady)
};                              // = 17 bytes

using TelemetryPacket = PacketTemplate<Telemetry_Payload, 3>;
// header(4) + counter(2) + payload(17) + padding(3) + chksum(2) = 28 bytes
```

## Key Design Decisions
- No MAC address in packet: server identifies data by header ("TELE"), master holds header->MAC table internally for command routing
- Top node stays nRF52840 Sense (onboard IMU), BLE link to base unchanged
- Base auto-reconnects to top node every 3 seconds (no PAIR_TOP command needed)
- Commands supported: START, STOP, ZERO, RESET_ZERO
- 28-byte packet size maintained: no changes needed to PACKET_BYTES constant in serial reader
- Derivable fields computed server-side: bendMagnitude, baseMinusTopRoll, baseMinusTopPitch

## Task Breakdown

### Task 1: Base node firmware (BLE to top + ESP-NOW telemetry)
- Update `revised_base_node_v2_esp_now.ino` with new Telemetry_Payload (vectorAngle + status)
- PAD_BYTES changes from 6 to 3
- Serial debug logging for BLE connection, angle computation, ESP-NOW delivery
- Auto-start sensing for testing (sensingEnabled = true by default)
- onDataRecv stub registered for future command reception

### Task 2: Server-side TELE parser (console output)
- Create/update `imu_telemetry_parser.js` 
- Add TELE_HEADER branch in serialReader.js processBuffer()
- Parse 28-byte packet, validate checksum, convert fixed-point to float
- Compute derived fields (bendMagnitude, baseMinusTop)
- Console.log parsed telemetry for verification

### Task 3: Master node header->MAC table + command routing
- Add header->MAC lookup in OnDataRecv
- Modify checkForSerialCommands() to parse "HEADER|command\n" format
- Look up MAC from header table, call sendCommandToNode

### Task 4: Base node command reception via ESP-NOW
- Implement onDataRecv to receive commands from master
- Route to handleCommand() (START/STOP/ZERO/RESET_ZERO)
- Serial debug logging on command receipt

### Task 5: Server SSE streaming + command endpoint
- Call write_to_clients("imu", data) from parser
- Add POST /command/imu endpoint
- Update serial_writer.js to use header instead of MAC

### Task 6: React frontend - Mast Monitor page
- Add "imu" SSE event listener in Dashboard.tsx
- Create MastMonitor component with metrics, tables, status, command buttons
- Define ImuData type

### Task 7: Integration verification
- Full system test with power sensor and IMU running simultaneously
- Verify no packet corruption between types
- Test reconnection scenarios
