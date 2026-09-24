import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9238;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new globalThis.WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
      this.ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }
}

async function run() {
  console.log('Launching Chrome on port', port);
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,1900',
    '--user-data-dir=C:\\Users\\varun\\AppData\\Local\\Temp\\chrome-test-icu-profile',
    'about:blank'
  ], { detached: false });

  await wait(2000);

  try {
    const targets = await getJson(`http://127.0.0.1:${port}/json`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const cdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    console.log('Navigating to http://localhost:3000#workspace...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000#workspace' });
    await wait(3000);

    const csvContent = fs.readFileSync('public/fixtures/kaggle_icu_sepsis_benchmark.csv', 'utf8');

    console.log('Activating upload tab...');
    await cdp.evaluate(`
      (() => {
        const tab0 = document.getElementById('tab-0');
        if (tab0) tab0.click();
      })()
    `);
    await wait(1000);

    console.log('Injecting file into dropzone...');
    await cdp.evaluate(`
      (async () => {
        const dropzone = document.querySelector('.dropzone');
        if (!dropzone) throw new Error('Dropzone not found');
        const dt = new DataTransfer();
        const file = new File([${JSON.stringify(csvContent)}], 'kaggle_icu_sepsis_benchmark.csv', { type: 'text/csv' });
        dt.items.add(file);
        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        });
        dropzone.dispatchEvent(event);
      })()
    `);
    await wait(1000);

    console.log('Clicking Investigate failure...');
    await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('.investigate-button');
        if (btn) btn.click();
      })()
    `);

    console.log('Waiting for analysis and 3 stages to finish...');
    for (let i = 0; i < 20; i++) {
      await wait(1000);
      const isComplete = await cdp.evaluate(`
        Boolean(document.querySelector('.results.panel') && document.querySelector('.btn-basis-toggle'))
      `);
      if (isComplete) {
        console.log('Investigation completed and results panel mounted!');
        break;
      }
    }
    await wait(1500);

    console.log('Expanding Decision Basis ledger...');
    await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('.btn-basis-toggle');
        if (btn) btn.click();
      })()
    `);
    await wait(1500);

    console.log('Framing results view...');
    await cdp.evaluate(`
      const el = document.querySelector('.results.panel') || document.querySelector('.decision-basis-panel');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    `);
    await wait(1000);

    console.log('Capturing screenshot...');
    const ss = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });

    const buf = Buffer.from(ss.data, 'base64');
    
    fs.writeFileSync('kaggle_icu_sepsis_audit.png', buf);
    console.log('Saved to: kaggle_icu_sepsis_audit.png');

    fs.writeFileSync('public/kaggle_icu_sepsis_audit.png', buf);
    console.log('Saved to: public/kaggle_icu_sepsis_audit.png');

    const brainPath = 'C:\\Users\\varun\\.gemini\\antigravity-ide\\brain\\660ae6cc-7720-488d-82e0-0eba0908dc3d\\kaggle_icu_sepsis_audit.png';
    fs.writeFileSync(brainPath, buf);
    console.log('Saved to:', brainPath);

  } finally {
    chromeProc.kill();
    console.log('Finished CDP run.');
  }
}

run().catch(err => {
  console.error('CDP Error:', err);
  process.exit(1);
});
