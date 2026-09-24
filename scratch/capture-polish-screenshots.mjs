import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = 'http://localhost:3109';
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort = 9235;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'whylab-ss-'));
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
    }, 30000);
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

const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function captureViewport(selector, filename) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  })()`);
  await pause(600);
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(artifactDir, filename), Buffer.from(data, 'base64'));
  console.log('Saved:', filename);
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

  // 1. Desktop Viewport (1440x950)
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await waitFor(() => evaluate(`Boolean(document.querySelector('#vision-lab'))`));
  await pause(1000);

  // Screenshot 1: Vision Lab
  await captureViewport('#vision-lab', 'screenshot1_vision_lab_desktop.png');

  // Load synthetic logs in Astra
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Load synthetic training logs'))?.click()`);
  await pause(600);

  // Screenshot 2A: Training Log Artifact (closed)
  await captureViewport('.training-log-preview-panel', 'screenshot2_training_log_desktop_closed.png');

  // Open the epoch details disclosure
  await evaluate(`(() => {
    const details = document.querySelector('.epoch-details-disclosure');
    if (details) details.open = true;
  })()`);
  await pause(400);

  // Screenshot 2B: Training Log Artifact with Epoch disclosure expanded
  await captureViewport('.training-log-preview-panel', 'screenshot2_training_log_desktop_expanded.png');

  // Screenshot 3A: Combined Diagnosis (Empty state)
  await captureViewport('.diagnosis-panel', 'screenshot3_combined_diagnosis_empty.png');

  // Run workspace sample to populate diagnosis findings and context questions
  await click('#tab-2');
  await click('.input-panel .investigate-button');
  await waitFor(() => evaluate(`Boolean(document.querySelector('.diagnosis-item'))`), 20000);
  await pause(600);

  // Scroll to Combined Diagnosis
  await captureViewport('.diagnosis-panel', 'screenshot3_combined_diagnosis_populated.png');

  // 2. Mobile Viewport (375x812)
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await pause(500);

  // Screenshot 1 Mobile: Vision Lab
  await captureViewport('#vision-lab', 'screenshot1_vision_lab_mobile.png');

  // Screenshot 2 Mobile: Training Log Preview
  await captureViewport('.training-log-preview-panel', 'screenshot2_training_log_mobile.png');

  // Screenshot 3 Mobile: Combined Diagnosis
  await captureViewport('.diagnosis-panel', 'screenshot3_combined_diagnosis_mobile.png');

  console.log('All screenshots captured successfully!');
} catch (e) {
  console.error('Error during capture:', e);
} finally {
  try { socket?.close(); } catch {}
  child.kill();
  await pause(500);
  try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
}
