import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = 'http://localhost:3000';
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort = 9256;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'whylab-inspect-'));
const artifactDir = 'C:/Users/varun/.gemini/antigravity-ide/brain/06284d27-3496-493b-a907-c9bec49c0e15';

const child = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
);

let socket;
const pending = new Map();
let serial = 0;

const pause = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(200);
  }
  throw new Error('Timeout');
}

function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timed out: ' + method));
    }, 25000);
    pending.set(id, {
      resolve: v => { clearTimeout(timer); resolve(v); },
      reject: e => { clearTimeout(timer); reject(e); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Evaluation failed');
  return result.result.value;
}

try {
  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      return res.ok;
    } catch { return false; }
  });

  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(message.error.message));
      else entry?.resolve(message.result);
    }
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await waitFor(() => evaluate(`Boolean(document.querySelector('.mid-turn-steering-card'))`));
  await pause(1000);

  // Scroll to steering card
  await evaluate(`(() => {
    const el = document.querySelector('.mid-turn-steering-card');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  })()`);
  await pause(400);

  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(artifactDir, 'mid_turn_steering_fixed.png'), Buffer.from(data, 'base64'));
  console.log('Saved mid_turn_steering_fixed.png');
} catch (e) {
  console.error(e);
} finally {
  try { socket?.close(); } catch {}
  child.kill();
  await pause(400);
  try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
}
