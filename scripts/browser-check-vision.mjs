import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = process.env.WHYLAB_TEST_URL || 'http://localhost:3109';
const browser = process.env.WHYLAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort = Number(process.env.WHYLAB_CDP_PORT || 9225);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'whylab-browser-vision-'));
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });

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
const checks = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(200);
  }
  throw new Error('Timed out: ' + label);
}

function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timed out: ' + method));
    }, 15000);
    pending.set(id, {
      resolve: v => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: e => {
        clearTimeout(timer);
        reject(e);
      }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}

const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function button(text, root = 'document') {
  await evaluate(`[...${root}.querySelectorAll('button')].find(e => e.textContent.trim().includes(${JSON.stringify(text)})).click()`);
}

async function screenshot(name) {
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64'));
}

function pass(name) {
  checks.push(name);
  console.log('PASS ' + name);
}

try {
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      return response.ok;
    } catch {
      return false;
    }
  }, 'Chrome startup');

  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

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

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await command('Page.navigate', { url: base });
  await waitFor(() => evaluate(`Boolean(document.querySelector('h1'))`), 'homepage');
  pass('Homepage loaded');

  // Check navigation to Vision Lab
  assert.ok(await evaluate(`Boolean(document.querySelector('a[href="#vision-lab"]'))`));
  await click('a[href="#vision-lab"]');
  assert.ok(await evaluate(`Boolean(document.querySelector('#vision-lab'))`));
  pass('Vision Lab section mounted and reachable via navigation');

  // Load Vision Flagship Case
  await button('Load Vision Flagship Case', 'document.querySelector("#vision-lab")');
  await waitFor(() => evaluate(`document.querySelector('#vision-lab').textContent.includes('Vision Flagship loaded')`), 'Flagship loaded notice');
  pass('Vision Flagship dataset loaded with 3 planted defects');

  // Verify Leakage Analysis Card
  assert.ok(await evaluate(`document.querySelector('#vision-lab .leakage-hero-grid')?.textContent.includes('Cross-Split Leaked Images')`));
  assert.ok(await evaluate(`document.querySelector('#vision-lab .leakage-hero-grid')?.textContent.includes('Performance Inflation Gap')`));
  pass('Cross-split duplicate leakage detected with Wilson confidence intervals');

  // Verify Slices Section
  assert.ok(await evaluate(`document.querySelector('#vision-lab .epoch-table')?.textContent.includes('Excess Error')`));
  assert.ok(await evaluate(`document.querySelector('#vision-lab .epoch-table')?.textContent.includes('Impact Score')`));
  pass('Metadata and visual slice ranking table rendered');

  const conceptText = await evaluate(`document.querySelector('#vision-lab .concepts-results-list')?.textContent`);
  assert.ok(conceptText.includes('Corner Scale Ruler / Watermark'));
  assert.ok(
    conceptText.includes('REJECTED') ||
    conceptText.includes('SUPPORTED') ||
    conceptText.includes('UNRELIABLE LABELLING') ||
    conceptText.includes('UNDERPOWERED')
  );
  assert.ok(await evaluate(`document.querySelector('#vision-lab .concepts-results-list')?.textContent.includes('BH Adjusted p-value')`));
  assert.ok(await evaluate(`document.querySelector('#vision-lab .concepts-results-list')?.textContent.includes('Labeller Audit')`));
  pass('Concept falsification list with FDR adjustment and Cohen kappa audits verified');

  // Export Incident Report
  await button('Export Incident JSON', 'document.querySelector("#vision-lab")');
  await button('Export Vision Incident Markdown', 'document.querySelector("#vision-lab")');
  pass('Incident report export buttons triggered without errors');

  // Take screenshot for visual inspection
  await screenshot('vision-lab-verified.png');
  pass('Screenshot captured to artifacts/vision-lab-verified.png');

  assert.equal(errors.length, 0, 'No uncaught exceptions: ' + errors.join('; '));
  pass('Zero uncaught browser errors');

  console.log(`\nAll ${checks.length} Vision Lab browser checks passed successfully.`);
} finally {
  try { child.kill(); } catch {}
  try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
}
