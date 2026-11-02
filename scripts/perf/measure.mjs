// Pomiary wydajności wieszaka na zbudowanej aplikacji i prawdziwej karcie graficznej.
// Uruchomienie: npm run build && npm run perf
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 3200;
const URL_BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  stdio: 'ignore',
});
const stopServer = () => server.kill();

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(URL_BASE)).ok) return;
    } catch {
      /* serwer jeszcze wstaje */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Serwer nie wystartował');
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
});

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

/** Czasy klatek zebrane w przeglądarce podczas wykonywania akcji. */
async function frameStats(page, action) {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => {
      window.__frames.push(now - last);
      last = now;
      window.__frameLoop = requestAnimationFrame(tick);
    };
    window.__frameLoop = requestAnimationFrame(tick);
  });
  await action();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameLoop);
    return window.__frames.slice(1);
  });
  const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  return {
    fps: +(1000 / mean).toFixed(1),
    p95Ms: +percentile(frames, 0.95).toFixed(1),
    maxMs: +Math.max(...frames).toFixed(1),
    jank: frames.filter((value) => value > 34).length,
    frames: frames.length,
  };
}

async function measure({ label, viewport, isMobile, hasTouch, cpuThrottle, network, deviceScaleFactor }) {
  const context = await browser.newContext({ viewport, isMobile, hasTouch, deviceScaleFactor });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (cpuThrottle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  if (network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });

  const transferred = new Map();
  const urls = new Map();
  cdp.on('Network.responseReceived', ({ requestId, response }) => urls.set(requestId, response.url));
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    transferred.set(urls.get(requestId) ?? requestId, encodedDataLength);
  });

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const started = Date.now();
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 180000 });
  const sceneReadyMs = Date.now() - started;
  const paints = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    lcp: window.__lcp,
    longTasks: null,
  }));

  await page.waitForTimeout(1500);
  const groups = { glb: 0, tekstury: 0, plakaty: 0, js: 0, fonty: 0, inne: 0 };
  for (const [url, bytes] of transferred) {
    if (url.endsWith('.glb')) groups.glb += bytes;
    else if (url.includes('/posters/')) groups.plakaty += bytes;
    else if (url.includes('/models/')) groups.tekstury += bytes;
    else if (url.endsWith('.js') || url.includes('.js?')) groups.js += bytes;
    else if (url.includes('/fonts/') || url.includes('/media/')) groups.fonty += bytes;
    else groups.inne += bytes;
  }

  const results = { label, fcpMs: Math.round(paints.fcp ?? 0), lcpMs: Math.round(paints.lcp), sceneReadyMs };
  results.kb = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, Math.round(v / 1024)]));

  const { width, height } = viewport;
  results.obrot = await frameStats(page, async () => {
    for (let round = 0; round < 4; round += 1) {
      await page.mouse.move(width * 0.7, height * 0.5);
      await page.mouse.down();
      for (let step = 0; step <= 40; step += 1) {
        await page.mouse.move(width * 0.7 - (width * 0.4 * step) / 40, height * 0.5);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
  });
  results.najechanie = await frameStats(page, async () => {
    for (let round = 0; round < 3; round += 1) {
      await page.mouse.move(width * 0.5, height * 0.5, { steps: 6 });
      await page.waitForTimeout(900);
      await page.mouse.move(8, height * 0.5, { steps: 6 });
      await page.waitForTimeout(900);
    }
  });
  await context.close();
  return results;
}

try {
  await waitForServer();
  const page = await browser.newPage();
  await page.goto('about:blank');
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'nieznany';
  });
  await page.close();
  console.log('GPU:', gpu);

  const runs = [
    { label: 'komputer', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    {
      label: 'telefon (emulacja: 4x wolniejszy procesor, wolne 4G)',
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2.6,
      cpuThrottle: 4,
      network: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    },
  ];
  for (const run of runs) console.log(JSON.stringify(await measure(run), null, 2));
} finally {
  await browser.close();
  stopServer();
}
