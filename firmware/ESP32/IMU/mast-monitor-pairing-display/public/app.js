const SERVICE_UUID = "7a100000-3e2d-4b6a-9f10-112233445566";
const TELEMETRY_UUID = "7a100001-3e2d-4b6a-9f10-112233445566";
const COMMAND_UUID = "7a100002-3e2d-4b6a-9f10-112233445566";
const STATUS_UUID = "7a100003-3e2d-4b6a-9f10-112233445566";

const TELEMETRY_FIELDS = [
  "baseRoll",
  "basePitch",
  "topRoll",
  "topPitch",
  "topMinusBaseRoll",
  "topMinusBasePitch",
  "bendMagnitude",
  "baseMinusTopRoll",
  "baseMinusTopPitch",
  "vectorAngle",
  "topSeq"
];

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

let device = null;
let server = null;
let telemetryCharacteristic = null;
let commandCharacteristic = null;
let statusCharacteristic = null;
let latestTelemetry = null;
let latestStatus = {
  topConnected: false,
  sensingEnabled: false,
  zeroReady: false
};
let loggingEnabled = false;
let appendInFlight = false;
let pendingLogRow = null;

const $ = (id) => document.getElementById(id);

const ui = {
  bleSupport: $("bleSupport"),
  baseState: $("baseState"),
  topState: $("topState"),
  logState: $("logState"),
  pairBtn: $("pairBtn"),
  scanTopBtn: $("scanTopBtn"),
  zeroBtn: $("zeroBtn"),
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  logStartBtn: $("logStartBtn"),
  logStopBtn: $("logStopBtn"),
  bendMagnitude: $("bendMagnitude"),
  topMinusBaseRoll: $("topMinusBaseRoll"),
  topMinusBasePitch: $("topMinusBasePitch"),
  vectorAngle: $("vectorAngle"),
  baseRoll: $("baseRoll"),
  basePitch: $("basePitch"),
  topRoll: $("topRoll"),
  topPitch: $("topPitch"),
  topMinusBaseRollTable: $("topMinusBaseRollTable"),
  topMinusBasePitchTable: $("topMinusBasePitchTable"),
  baseMinusTopRoll: $("baseMinusTopRoll"),
  baseMinusTopPitch: $("baseMinusTopPitch"),
  topSeq: $("topSeq"),
  sensingEnabled: $("sensingEnabled"),
  zeroReady: $("zeroReady"),
  lastUpdate: $("lastUpdate"),
  rawPayload: $("rawPayload")
};

function setClass(el, className) {
  el.classList.remove("ok", "warn", "bad");
  if (className) el.classList.add(className);
}

function setText(id, text) {
  if (ui[id]) ui[id].textContent = text;
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function updateButtonStates() {
  const connected = Boolean(device?.gatt?.connected && commandCharacteristic);
  ui.scanTopBtn.disabled = !connected;
  ui.zeroBtn.disabled = !connected;
  ui.startBtn.disabled = !connected;
  ui.stopBtn.disabled = !connected;
  ui.logStartBtn.disabled = !connected || loggingEnabled;
  ui.logStopBtn.disabled = !loggingEnabled;
}

function updateConnectionUi() {
  const connected = Boolean(device?.gatt?.connected);

  ui.baseState.textContent = connected ? "Connected" : "Disconnected";
  setClass(ui.baseState, connected ? "ok" : "bad");

  ui.topState.textContent = latestStatus.topConnected ? "Connected" : "Not connected";
  setClass(ui.topState, latestStatus.topConnected ? "ok" : "warn");

  ui.logState.textContent = loggingEnabled ? "On" : "Off";
  setClass(ui.logState, loggingEnabled ? "ok" : "warn");

  setText("sensingEnabled", yesNo(latestStatus.sensingEnabled));
  setText("zeroReady", yesNo(latestStatus.zeroReady));

  updateButtonStates();
}

function parseCsvTelemetry(text) {
  const parts = text.trim().split(",");
  if (parts.length < TELEMETRY_FIELDS.length) {
    throw new Error(`Expected ${TELEMETRY_FIELDS.length} telemetry fields, got ${parts.length}: ${text}`);
  }

  const row = {};
  TELEMETRY_FIELDS.forEach((field, index) => {
    const raw = parts[index];
    row[field] = field === "topSeq" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  });
  return row;
}

function parseStatus(text) {
  const status = { ...latestStatus };
  text.trim().split(",").forEach((pair) => {
    const [key, value] = pair.split("=");
    if (!key) return;
    if (["topConnected", "sensingEnabled", "zeroReady", "baseReady"].includes(key)) {
      status[key] = value === "1" || value === "true";
    } else if (["topSeq", "millis"].includes(key)) {
      status[key] = Number.parseInt(value, 10);
    } else {
      status[key] = value;
    }
  });
  return status;
}

function renderTelemetry(row, rawText) {
  latestTelemetry = row;

  setText("bendMagnitude", fmt(row.bendMagnitude));
  setText("topMinusBaseRoll", fmt(row.topMinusBaseRoll));
  setText("topMinusBasePitch", fmt(row.topMinusBasePitch));
  setText("vectorAngle", fmt(row.vectorAngle));

  setText("baseRoll", fmt(row.baseRoll));
  setText("basePitch", fmt(row.basePitch));
  setText("topRoll", fmt(row.topRoll));
  setText("topPitch", fmt(row.topPitch));

  setText("topMinusBaseRollTable", fmt(row.topMinusBaseRoll));
  setText("topMinusBasePitchTable", fmt(row.topMinusBasePitch));
  setText("baseMinusTopRoll", fmt(row.baseMinusTopRoll));
  setText("baseMinusTopPitch", fmt(row.baseMinusTopPitch));

  setText("topSeq", Number.isFinite(row.topSeq) ? String(row.topSeq) : "--");
  setText("lastUpdate", new Date().toLocaleTimeString());
  ui.rawPayload.textContent = rawText;

  if (loggingEnabled) {
    queueLogAppend(row);
  }
}

function buildLogRow(row) {
  return {
    timestamp: new Date().toISOString(),
    ...row,
    topConnected: latestStatus.topConnected,
    sensingEnabled: latestStatus.sensingEnabled,
    zeroReady: latestStatus.zeroReady
  };
}

async function queueLogAppend(row) {
  pendingLogRow = buildLogRow(row);
  if (appendInFlight) return;

  appendInFlight = true;
  try {
    while (pendingLogRow) {
      const rowToWrite = pendingLogRow;
      pendingLogRow = null;
      const response = await fetch("/api/log/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rowToWrite)
      });
      if (!response.ok) {
        console.error("Log append failed", await response.text());
      }
    }
  } finally {
    appendInFlight = false;
  }
}

async function writeCommand(command) {
  if (!commandCharacteristic) {
    throw new Error("Not connected to command characteristic");
  }
  await commandCharacteristic.writeValue(encoder.encode(command));
}

async function pairBaseBridge() {
  if (!navigator.bluetooth) {
    alert("Web Bluetooth is not available in this browser. Use Chrome or Edge on localhost.");
    return;
  }

  device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "XIAO_BASE" }],
    optionalServices: [SERVICE_UUID]
  });

  device.addEventListener("gattserverdisconnected", () => {
    telemetryCharacteristic = null;
    commandCharacteristic = null;
    statusCharacteristic = null;
    updateConnectionUi();
  });

  ui.baseState.textContent = "Connecting...";
  setClass(ui.baseState, "warn");

  server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);

  telemetryCharacteristic = await service.getCharacteristic(TELEMETRY_UUID);
  commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);

  try {
    statusCharacteristic = await service.getCharacteristic(STATUS_UUID);
  } catch (error) {
    console.warn("Status characteristic not found. Upload the paired base sketch for full status support.", error);
  }

  await telemetryCharacteristic.startNotifications();
  telemetryCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
    const rawText = decoder.decode(event.target.value);
    try {
      renderTelemetry(parseCsvTelemetry(rawText), rawText);
    } catch (error) {
      console.error(error);
      ui.rawPayload.textContent = rawText;
    }
  });

  if (statusCharacteristic) {
    await statusCharacteristic.startNotifications();
    statusCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
      const rawStatus = decoder.decode(event.target.value);
      latestStatus = parseStatus(rawStatus);
      updateConnectionUi();
    });

    try {
      const statusValue = await statusCharacteristic.readValue();
      latestStatus = parseStatus(decoder.decode(statusValue));
    } catch (error) {
      console.warn("Could not read initial status", error);
    }
  }

  updateConnectionUi();
}

async function startLogging() {
  const response = await fetch("/api/log/start", { method: "POST" });
  if (!response.ok) {
    alert(`Could not start log: ${await response.text()}`);
    return;
  }
  loggingEnabled = true;
  updateConnectionUi();
  if (latestTelemetry) queueLogAppend(latestTelemetry);
}

async function stopLogging() {
  const response = await fetch("/api/log/stop", { method: "POST" });
  if (!response.ok) {
    alert(`Could not stop log: ${await response.text()}`);
    return;
  }
  loggingEnabled = false;
  updateConnectionUi();
}

function bindEvents() {
  ui.pairBtn.addEventListener("click", () => pairBaseBridge().catch((error) => alert(error.message)));
  ui.scanTopBtn.addEventListener("click", () => writeCommand("PAIR_TOP").catch((error) => alert(error.message)));
  ui.zeroBtn.addEventListener("click", () => writeCommand("ZERO").catch((error) => alert(error.message)));
  ui.startBtn.addEventListener("click", () => writeCommand("START").catch((error) => alert(error.message)));
  ui.stopBtn.addEventListener("click", () => writeCommand("STOP").catch((error) => alert(error.message)));
  ui.logStartBtn.addEventListener("click", () => startLogging());
  ui.logStopBtn.addEventListener("click", () => stopLogging());
}

async function init() {
  if (navigator.bluetooth) {
    ui.bleSupport.textContent = "Available";
    setClass(ui.bleSupport, "ok");
  } else {
    ui.bleSupport.textContent = "Unavailable";
    setClass(ui.bleSupport, "bad");
  }

  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    loggingEnabled = Boolean(health.activeLogFile);
  } catch (error) {
    console.warn("Health check failed", error);
  }

  bindEvents();
  updateConnectionUi();
}

init();
