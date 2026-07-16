const SERVICE_UUID = "7a100000-3e2d-4b6a-9f10-112233445566";
const TELEMETRY_UUID = "7a100001-3e2d-4b6a-9f10-112233445566";
const COMMAND_UUID = "7a100002-3e2d-4b6a-9f10-112233445566";

let device = null;
let server = null;
let service = null;
let telemetryChar = null;
let commandChar = null;
let loggingEnabled = false;

const $ = (id) => document.getElementById(id);

const els = {
  connectBtn: $("connectBtn"),
  disconnectBtn: $("disconnectBtn"),
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  zeroBtn: $("zeroBtn"),
  logStartBtn: $("logStartBtn"),
  logStopBtn: $("logStopBtn"),
  connStatus: $("connStatus"),
  console: $("console"),
  baseRoll: $("baseRoll"),
  basePitch: $("basePitch"),
  topRoll: $("topRoll"),
  topPitch: $("topPitch"),
  deltaRoll: $("deltaRoll"),
  deltaPitch: $("deltaPitch"),
  totalAngle: $("totalAngle"),
  lastUpdate: $("lastUpdate")
};

function log(msg) {
  const now = new Date().toLocaleTimeString();
  els.console.textContent = `[${now}] ${msg}\n` + els.console.textContent;
}

function setConnectedUi(isConnected) {
  els.connectBtn.disabled = isConnected;
  els.disconnectBtn.disabled = !isConnected;
  els.startBtn.disabled = !isConnected;
  els.stopBtn.disabled = !isConnected;
  els.zeroBtn.disabled = !isConnected;
  els.logStartBtn.disabled = !isConnected;
  els.logStopBtn.disabled = !isConnected;
  els.connStatus.textContent = isConnected ? "Connected" : "Disconnected";
}

function decodeTelemetry(dataView) {
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(dataView.buffer).trim();
  const parts = text.split(",");

  if (parts.length !== 7) {
    throw new Error(`Unexpected telemetry payload: ${text}`);
  }

  return {
    baseRoll: Number(parts[0]),
    basePitch: Number(parts[1]),
    topRoll: Number(parts[2]),
    topPitch: Number(parts[3]),
    deltaRoll: Number(parts[4]),
    deltaPitch: Number(parts[5]),
    totalAngle: Number(parts[6]),
    timestamp: new Date().toISOString()
  };
}

function renderTelemetry(t) {
  els.baseRoll.textContent = t.baseRoll.toFixed(2);
  els.basePitch.textContent = t.basePitch.toFixed(2);
  els.topRoll.textContent = t.topRoll.toFixed(2);
  els.topPitch.textContent = t.topPitch.toFixed(2);
  els.deltaRoll.textContent = t.deltaRoll.toFixed(2);
  els.deltaPitch.textContent = t.deltaPitch.toFixed(2);
  els.totalAngle.textContent = t.totalAngle.toFixed(2);
  els.lastUpdate.textContent = new Date().toLocaleTimeString();
}

async function appendLog(t) {
  if (!loggingEnabled) return;

  await fetch("/api/log/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(t)
  });
}

async function handleTelemetry(event) {
  try {
    const t = decodeTelemetry(event.target.value);
    renderTelemetry(t);
    await appendLog(t);
  } catch (err) {
    log(`Telemetry parse error: ${err.message}`);
  }
}

async function writeCommand(command) {
  if (!commandChar) throw new Error("Not connected");
  const encoder = new TextEncoder();
  await commandChar.writeValue(encoder.encode(command));
  log(`Sent command: ${command}`);
}

async function connectBle() {
  device = await navigator.bluetooth.requestDevice({
    filters: [{ name: "XIAO_BASE_BRIDGE" }],
    optionalServices: [SERVICE_UUID]
  });

  device.addEventListener("gattserverdisconnected", () => {
    setConnectedUi(false);
    log("BLE disconnected");
  });

  server = await device.gatt.connect();
  service = await server.getPrimaryService(SERVICE_UUID);
  telemetryChar = await service.getCharacteristic(TELEMETRY_UUID);
  commandChar = await service.getCharacteristic(COMMAND_UUID);

  await telemetryChar.startNotifications();
  telemetryChar.addEventListener("characteristicvaluechanged", handleTelemetry);

  setConnectedUi(true);
  log("Connected to XIAO_BASE_BRIDGE");
}

async function disconnectBle() {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
  }
  setConnectedUi(false);
}

async function startLogging() {
  const res = await fetch("/api/log/start", { method: "POST" });
  const json = await res.json();
  loggingEnabled = true;
  log(`Logging started: ${json.file}`);
}

async function stopLogging() {
  const res = await fetch("/api/log/stop", { method: "POST" });
  const json = await res.json();
  loggingEnabled = false;
  log(`Logging stopped: ${json.closed ?? "none"}`);
}

els.connectBtn.addEventListener("click", async () => {
  try {
    await connectBle();
  } catch (err) {
    log(`Connect failed: ${err.message}`);
  }
});

els.disconnectBtn.addEventListener("click", async () => {
  try {
    await disconnectBle();
  } catch (err) {
    log(`Disconnect failed: ${err.message}`);
  }
});

els.startBtn.addEventListener("click", async () => {
  try {
    await writeCommand("START");
  } catch (err) {
    log(`START failed: ${err.message}`);
  }
});

els.stopBtn.addEventListener("click", async () => {
  try {
    await writeCommand("STOP");
  } catch (err) {
    log(`STOP failed: ${err.message}`);
  }
});

els.zeroBtn.addEventListener("click", async () => {
  try {
    await writeCommand("ZERO");
  } catch (err) {
    log(`ZERO failed: ${err.message}`);
  }
});

els.logStartBtn.addEventListener("click", async () => {
  try {
    await startLogging();
  } catch (err) {
    log(`Log start failed: ${err.message}`);
  }
});

els.logStopBtn.addEventListener("click", async () => {
  try {
    await stopLogging();
  } catch (err) {
    log(`Log stop failed: ${err.message}`);
  }
});

setConnectedUi(false);
