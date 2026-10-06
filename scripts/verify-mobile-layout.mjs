import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = process.env.WHYLAB_TEST_URL || 'http://localhost:3000';
const browser = process.env.WHYLAB_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cdpPort = 9226;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'whylab-mobile-test-'));
const artifactsDir = path.resolve('artifacts');
await fs.mkdir(artifactsDir, { recursive: true });

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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, label, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
    await pause(200);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function send(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'Evaluation failed');
  }
  return res.result?.value;
}

async function captureScreenshot(filepath) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(filepath, Buffer.from(res.data, 'base64'));
}

async function captureElementScreenshot(selector, filepath) {
  await evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (el) {
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      window.scrollBy({ top: -75, behavior: 'instant' });
    }
  })()`);
  await pause(600);
  const res = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(filepath, Buffer.from(res.data, 'base64'));
}

try {
  const targets = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const list = await res.json();
    return list.find(t => t.type === 'page');
  }, 'CDP page target');

  socket = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise(res => (socket.onopen = res));

  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Emulate Mobile Device: 375 x 812 (Phone viewport)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  console.log('1. Testing Vision Lab at mobile viewport...');
  await send('Page.navigate', { url: `${base}/vision` });
  await waitFor(() => evaluate(`document.readyState === 'complete'`), 'page ready');
  await pause(1000);

  // Click Load Flagship Vision Case to load slices and predictions
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Load Vision Flagship'));
    btn?.click();
  })()`);
  await waitFor(() => evaluate(`Boolean(document.querySelector('.epoch-table table'))`), 'vision slices table rendered');
  await pause(800);

  // Validate epoch table mobile CSS
  const tableMetrics = await evaluate(`(() => {
    const el = document.querySelector('.epoch-table');
    const table = el?.querySelector('table');
    const csEl = el ? window.getComputedStyle(el) : null;
    const csTable = table ? window.getComputedStyle(table) : null;
    return {
      overflowX: csEl?.overflowX,
      containerWidth: el?.clientWidth,
      tableScrollWidth: table?.scrollWidth,
      tableMinWidth: csTable?.minWidth,
      hasHorizontalScroll: (table?.scrollWidth || 0) > (el?.clientWidth || 0)
    };
  })()`);

  console.log('Table Metrics:', tableMetrics);
  assert.equal(tableMetrics.overflowX, 'auto', 'Epoch table must have overflow-x: auto');
  assert.ok(tableMetrics.hasHorizontalScroll, 'Table must allow horizontal scroll rather than crushing columns');

  await captureElementScreenshot('.epoch-table', path.join(artifactsDir, 'mobile-vision-slices.png'));
  console.log('Saved mobile-vision-slices.png');

  console.log('2. Testing Flagship / Reliability Profile & Challenge Review at mobile viewport...');
  await send('Page.navigate', { url: `${base}/#flagship` });
  await waitFor(() => evaluate(`document.readyState === 'complete'`), 'home page ready');
  await pause(1000);

  // Run flagship case
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('.flagship-actions button')).find(b => b.textContent.includes('flagship'));
    btn?.click();
  })()`);

  // Wait for investigation result to appear
  await waitFor(() => evaluate(`Boolean(Array.from(document.querySelectorAll('.flagship-actions button')).find(b => b.textContent.includes('measured repair')))`), 'measured repair toggle');
  await pause(500);

  // Open measured repair drawer to show ReliabilityProfile and ChallengeReview
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('.flagship-actions button')).find(b => b.textContent.includes('Show measured repair'));
    btn?.click();
  })()`);

  await waitFor(() => evaluate(`Boolean(document.querySelector('.score-hero-card'))`), 'reliability score hero card');
  await pause(800);

  // Check score hero card layout
  const scoreHeroMetrics = await evaluate(`(() => {
    const hero = document.querySelector('.score-hero-card');
    const repair = document.querySelector('.score-repair-comparison');
    const gauge = document.querySelector('.score-main-gauge');
    const cs = hero ? window.getComputedStyle(hero) : null;
    return {
      flexDirection: cs?.flexDirection,
      heroWidth: hero?.offsetWidth,
      repairWidth: repair?.offsetWidth,
      gaugeWidth: gauge?.offsetWidth,
      heroRectRight: hero?.getBoundingClientRect().right,
      repairRectRight: repair?.getBoundingClientRect().right,
      windowWidth: window.innerWidth,
      repairOverflowsRight: repair ? (repair.getBoundingClientRect().right > window.innerWidth + 2) : false
    };
  })()`);

  console.log('Score Hero Metrics:', scoreHeroMetrics);
  assert.equal(scoreHeroMetrics.flexDirection, 'column', 'Score hero card should stack vertically on mobile');
  assert.equal(scoreHeroMetrics.repairOverflowsRight, false, 'Score repair card must not overflow right edge');

  await captureElementScreenshot('.score-hero-card', path.join(artifactsDir, 'mobile-reliability-profile.png'));
  console.log('Saved mobile-reliability-profile.png');

  // Trigger Challenge WhyLab
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('.challenge-review button')).find(b => b.textContent.includes('Challenge this investigation') || b.textContent.includes('Review challenge'));
    btn?.click();
  })()`);
  await pause(800);

  // Check Challenge Review headers and badges
  const challengeMetrics = await evaluate(`(() => {
    const cardHeader = document.querySelector('.challenge-card-header');
    const advBannerTop = document.querySelector('.confidence-banner-top');
    return {
      cardHeaderDisplay: cardHeader ? window.getComputedStyle(cardHeader).display : null,
      cardHeaderFlexWrap: cardHeader ? window.getComputedStyle(cardHeader).flexWrap : null,
      advBannerFlexWrap: advBannerTop ? window.getComputedStyle(advBannerTop).flexWrap : null
    };
  })()`);

  console.log('Challenge Metrics:', challengeMetrics);
  assert.equal(challengeMetrics.cardHeaderFlexWrap, 'wrap', 'Card header must have flex-wrap: wrap');
  assert.equal(challengeMetrics.advBannerFlexWrap, 'wrap', 'Adversarial banner top must have flex-wrap: wrap');

  await captureElementScreenshot('.challenge-primary-card', path.join(artifactsDir, 'mobile-challenge-review.png'));
  console.log('Saved mobile-challenge-review.png');

  // 3. Test Topbar Sticky Background Opacity and scroll
  await evaluate(`window.scrollTo(0, 500)`);
  await pause(300);

  const topbarMetrics = await evaluate(`(() => {
    const topbar = document.querySelector('.topbar');
    const cs = topbar ? window.getComputedStyle(topbar) : null;
    return {
      position: cs?.position,
      background: cs?.backgroundColor,
      zIndex: cs?.zIndex
    };
  })()`);

  console.log('Topbar Scrolled Metrics:', topbarMetrics);
  assert.equal(topbarMetrics.position, 'sticky');
  assert.ok(topbarMetrics.background.includes('248, 250, 252') || topbarMetrics.background.includes('255, 255, 255'), 'Topbar background must be opaque');

  console.log('ALL MOBILE CSS CHECKS PASSED SUCCESSFULLY!');
} finally {
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  child.kill();
  try {
    await fs.rm(profile, { recursive: true, force: true });
  } catch {}
}
