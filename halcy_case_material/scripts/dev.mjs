// `npm run dev`: both mock hotels and the chat with the booking agent, in one
// terminal. A server whose port already answers is left alone and not started
// again, so this can run next to a hotel someone else started. Ctrl-C stops
// only what this script started; if one of them exits, the others are stopped.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { connect } from "node:net";

const node = process.execPath;
const SERVICES = [
  { name: "hotel ", port: Number(process.env.HOTEL_PORT ?? 4100), args: ["mock-hotel/server.mjs"] },
  { name: "hotel2", port: Number(process.env.HOTEL2_PORT ?? 4500), args: ["mock-hotel-2/server.mjs"] },
  { name: "chat  ", port: Number(process.env.CHAT_PORT ?? 4200), args: ["--import", "tsx", "starter/chat/server.ts"], env: { AGENT: "booking" } },
  ...testHotels(),
];

/** Every test-hotels/<dir>/ with a server.mjs and a hotel.json ({ "port": 4600 }) is started too. */
function testHotels() {
  if (!existsSync("test-hotels")) return [];
  return readdirSync("test-hotels", { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`test-hotels/${d.name}/server.mjs`) && existsSync(`test-hotels/${d.name}/hotel.json`))
    .map((d) => {
      const { port } = JSON.parse(readFileSync(`test-hotels/${d.name}/hotel.json`, "utf8"));
      return { name: d.name.slice(0, 6).padEnd(6), port: Number(port), args: [`test-hotels/${d.name}/server.mjs`] };
    });
}

/** True when something on this machine already listens on the port. */
function inUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

function prefixed(name, stream, out) {
  let rest = "";
  stream.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
}

const chatUrl = `http://localhost:${SERVICES[2].port}`;
const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  const alive = () => children.filter((c) => c.exitCode === null && c.signalCode === null);
  for (const child of alive()) child.kill("SIGTERM");
  // The chat does not always exit on SIGTERM (an open run, the browser); never leave it behind.
  setTimeout(() => {
    for (const child of alive()) child.kill("SIGKILL");
    setTimeout(() => process.exit(code), 200);
  }, 3000);
}

for (const s of SERVICES) {
  if (await inUse(s.port)) {
    console.log(`[${s.name}] port ${s.port} already answers; leaving it as it is`);
    continue;
  }
  const child = spawn(node, s.args, { env: { ...process.env, ...s.env }, stdio: ["ignore", "pipe", "pipe"] });
  prefixed(s.name, child.stdout, process.stdout);
  prefixed(s.name, child.stderr, process.stderr);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.log(`[${s.name}] stopped (${signal ?? `exit ${code}`}); stopping the rest`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

if (children.length === 0) console.log(`Everything already runs. Chat: ${chatUrl}`);
else console.log(`Ctrl-C stops what this started. Chat: ${chatUrl}`);

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
