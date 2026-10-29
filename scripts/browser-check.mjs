import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { createApp } from '../src/index.js';
import { transformImage } from '../src/image-service.js';

// This test never loads .env or calls OpenAI. All requests stay on localhost.
process.env.IMAGE_PROVIDER = 'demo';
let mode = 'demo', generated, release;
const server = createApp({ transform: async data => {
  if (mode === 'loading') await new Promise(resolve => { release = resolve; });
  if (mode === 'error') throw Object.assign(new Error('테스트 오류: 잠시 후 다시 시도해 주세요.'), { status: 429 });
  if (mode === 'ai') return { buffer: generated, mimeType: 'image/jpeg', mode: 'ai' };
  return transformImage(data);
} }).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) || /^(blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(base);
  assert.equal(await page.locator('#generate-button').isDisabled(), true);
  await page.click('#sample-button');
  await page.waitForFunction(() => !document.getElementById('generate-button').disabled || document.getElementById('status').textContent.includes('샘플을 불러오지'), null, { timeout: 5000 });
  if (await page.locator('#generate-button').isDisabled()) {
    console.log('Sample failure diagnostic:', await page.locator('#status').textContent());
    console.log('SVG decoding diagnostic:', await page.evaluate(async () => {
      try { const image = await createImageBitmap(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>'], { type: 'image/svg+xml' })); image.close(); return 'decoded'; }
      catch (error) { return `${error.name}: ${error.message}`; }
    }));
    throw new Error('Sample image is not loadable');
  }
  console.log('PASS sample upload and frontend/backend health');
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 100;
    canvas.getContext('2d').fillRect(0, 0, 80, 100);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  generated = Buffer.from(jpeg, 'base64');
  const input = { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: generated };
  await page.locator('#file-input').setInputFiles(input);
  await page.waitForFunction(() => document.getElementById('upload-title').textContent === 'portrait.jpg');
  mode = 'loading';
  await page.click('#generate-button');
  await page.locator('#loading').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#generate-button').isDisabled(), true);
  assert.equal(await page.locator('#file-input').isDisabled(), true);
  assert.equal(await page.locator('[data-style="poster"]').isDisabled(), true);
  while (!release) await new Promise(resolve => setTimeout(resolve, 10));
  mode = 'demo'; release();
  await page.waitForFunction(() => !document.getElementById('download-button').disabled);
  console.log('PASS loading visibility and disabled controls while request is pending');
  for (const style of ['caricature', 'animation', 'poster', 'watercolor']) {
    await page.click(`[data-style="${style}"]`);
    const response = page.waitForResponse(response => response.url() === `${base}/api/transform`);
    await page.click('#generate-button');
    assert.equal((await response).status(), 200);
    await page.waitForFunction(() => !document.getElementById('download-button').disabled);
    assert.equal(await page.locator('#result-image').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.locator('#compare-slider').fill('25');
    assert.match(await page.locator('#result-layer').getAttribute('style'), /25%/);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download-button');
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `morph-${style}.png`);
    assert.equal(await download.failure(), null);
    assert.ok((await fs.stat(await download.path())).size > 0);
    console.log(`PASS ${style}: upload -> HTTP API -> decoded result -> slider -> downloaded file`);
  }
  mode = 'ai';
  await page.click('#generate-button');
  await page.waitForFunction(() => document.getElementById('result-badge').textContent === '변환 완료');
  const downloadPromise = page.waitForEvent('download'); await page.click('#download-button');
  assert.equal((await downloadPromise).suggestedFilename(), 'morph-watercolor.jpg');
  console.log('PASS mocked AI response display and JPEG download');
  mode = 'error';
  await page.click('#generate-button');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('테스트 오류'));
  assert.equal(await page.locator('#loading').isVisible(), false);
  assert.equal(await page.locator('#generate-button').isEnabled(), true);
  assert.equal(await page.locator('#download-button').isDisabled(), true);
  console.log('PASS server error announcement and loading recovery');
  await page.locator('#file-input').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('이미지 파일'));
  console.log('PASS invalid upload feedback');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate(() => {
    const grid = document.querySelector('.style-grid').getBoundingClientRect();
    return [...document.querySelectorAll('.style-option')].every(el => el.getBoundingClientRect().right <= grid.right + 1);
  }), true);
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS mobile overflow and no browser JavaScript errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
