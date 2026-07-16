const path = require("node:path");
const fsp = require("node:fs/promises");
const Fastify = require("fastify");

const app = Fastify({ logger: true });

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const LOG_DIR = path.join(ROOT, "logs");

let activeLogFile = null;

async function ensureDirs() {
  await fsp.mkdir(LOG_DIR, { recursive: true });
}

function csvHeader() {
  return "timestamp,baseRoll,basePitch,topRoll,topPitch,deltaRoll,deltaPitch,totalAngle\n";
}

async function ensureLogFile() {
  if (!activeLogFile) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    activeLogFile = path.join(LOG_DIR, `mast_log_${stamp}.csv`);
    await fsp.writeFile(activeLogFile, csvHeader(), { flag: "wx" });
  }
  return activeLogFile;
}

app.get("/", async (_req, reply) => {
  const html = await fsp.readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
  reply.type("text/html").send(html);
});

app.get("/app.js", async (_req, reply) => {
  const js = await fsp.readFile(path.join(PUBLIC_DIR, "app.js"), "utf8");
  reply.type("application/javascript").send(js);
});

app.get("/style.css", async (_req, reply) => {
  const css = await fsp.readFile(path.join(PUBLIC_DIR, "style.css"), "utf8");
  reply.type("text/css").send(css);
});

app.get("/api/health", async () => {
  return { ok: true, activeLogFile };
});

app.post("/api/log/start", async () => {
  const file = await ensureLogFile();
  return { ok: true, file };
});

app.post("/api/log/stop", async () => {
  const old = activeLogFile;
  activeLogFile = null;
  return { ok: true, closed: old };
});

app.post("/api/log/append", async (req, reply) => {
  const body = req.body || {};
  const required = [
    "timestamp",
    "baseRoll",
    "basePitch",
    "topRoll",
    "topPitch",
    "deltaRoll",
    "deltaPitch",
    "totalAngle"
  ];

  for (const key of required) {
    if (!(key in body)) {
      return reply.code(400).send({ ok: false, error: `Missing field: ${key}` });
    }
  }

  const file = await ensureLogFile();
  const line = [
    body.timestamp,
    body.baseRoll,
    body.basePitch,
    body.topRoll,
    body.topPitch,
    body.deltaRoll,
    body.deltaPitch,
    body.totalAngle
  ].join(",") + "\n";

  await fsp.appendFile(file, line, "utf8");
  return { ok: true, file };
});

async function main() {
  await ensureDirs();
  await app.listen({ host: "127.0.0.1", port: 8000 });
  console.log("Open http://127.0.0.1:8000");
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
