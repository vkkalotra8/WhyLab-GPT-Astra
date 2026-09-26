import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const base = 'http://localhost:3109';
const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort = 9245;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'whylab-polish-'));
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
const errors = [];

const pause = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(200);
  }
  throw new Error('Timeout: ' + label);
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

async function captureViewport(selector, filename) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  })()`);
  await pause(400);
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
  }, 'Chrome startup');

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
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  await command('Page.enable');
  await command('Runtime.enable');

  // 1. Initial 1440px desktop load
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await waitFor(() => evaluate(`Boolean(document.querySelector('h1'))`), 'h1 render');
  await pause(1000);

  // Check all six stages exist in DOM
  const stageIds = ['#stage-ingest', '#stage-profile', '#stage-investigate', '#stage-verify', '#stage-repair', '#stage-report'];
  for (const s of stageIds) {
    const exists = await evaluate(`Boolean(document.querySelector(${JSON.stringify(s)}))`);
    assert.ok(exists, `Stage ${s} must exist in DOM`);
  }
  console.log('All 6 stages verified in DOM.');

  // Capture desktop screenshots of all six stages
  await captureViewport('#stage-ingest', 'stage_01_ingest_desktop.png');
  await captureViewport('#stage-profile', 'stage_02_profile_desktop.png');
  await captureViewport('#stage-investigate', 'stage_03_investigate_desktop.png');
  await captureViewport('#stage-verify', 'stage_04_verify_desktop.png');
  await captureViewport('#stage-repair', 'stage_05_repair_desktop.png');
  await captureViewport('#stage-report', 'stage_06_report_desktop.png');

  // 2. Responsive testing across 4 viewports
  const viewports = [
    { width: 375, height: 812, name: '375_mobile', mobile: true },
    { width: 768, height: 1024, name: '768_tablet', mobile: true },
    { width: 1024, height: 800, name: '1024_laptop', mobile: false },
    { width: 1440, height: 950, name: '1440_desktop', mobile: false }
  ];

  for (const vp of viewports) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.mobile ? 2 : 1,
      mobile: vp.mobile
    });
    await pause(400);

    // Verify horizontal overflow
    const scrollWidth = await evaluate(`document.documentElement.scrollWidth`);
    const innerWidth = await evaluate(`window.innerWidth`);
    assert.ok(scrollWidth <= innerWidth + 1, `Horizontal overflow at ${vp.width}px: scrollWidth=${scrollWidth}, innerWidth=${innerWidth}`);

    // Capture overall viewport screenshot
    await evaluate(`window.scrollTo(0, 0)`);
    await pause(300);
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(artifactDir, `responsive_${vp.name}.png`), Buffer.from(data, 'base64'));
    console.log(`PASS: ${vp.width}px viewport tested cleanly. Saved responsive_${vp.name}.png`);
  }

  // Check no uncaught browser errors
  assert.deepEqual(errors, [], `Expected zero uncaught browser errors, got: ${errors.join(', ')}`);
  console.log('SUCCESS: All 4 viewports and 6 stages verified cleanly with 0 errors.');
} catch (e) {
  console.error('Test failed:', e);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  child.kill();
  await pause(400);
  try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
}
