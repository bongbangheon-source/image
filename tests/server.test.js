import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, MAX_UPLOAD_BYTES } from '../src/index.js';
import { createImageTransformer } from '../src/image-service.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0p8AAAAASUVORK5CYII=', 'base64');
let server, base;
before(async () => {
  process.env.IMAGE_PROVIDER = 'demo';
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
function form({ image = png, mime = 'image/png', style = 'caricature' } = {}) {
  const data = new FormData();
  if (image !== null) data.append('image', new Blob([image], { type: mime }), 'photo.png');
  if (style !== null) data.append('style', style);
  return data;
}
const post = data => fetch(`${base}/api/transform`, { method: 'POST', body: data });
test('serves frontend and health, blocks private files', async () => {
  assert.match(await (await fetch(base)).text(), /Morph/);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).maxUploadBytes, MAX_UPLOAD_BYTES);
  for (const path of ['/.env', '/src/index.js', '/package.json', '/node_modules/express/package.json']) assert.equal((await fetch(base + path)).status, 404);
});
test('all styles return uploaded image marked demo', async () => {
  for (const style of ['caricature', 'animation', 'poster', 'watercolor']) {
    const response = await post(form({ style }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-morph-mode'), 'demo');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /image\/png/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  }
});
test('rejects missing image and unsupported styles', async () => {
  for (const options of [{ image: null }, { style: null }, { style: 'unknown' }, { style: '__proto__' }]) assert.equal((await post(form(options))).status, 400);
});
test('rejects spoofed and unsupported MIME', async () => {
  for (const options of [{ image: Buffer.from('not an image') }, { mime: 'image/jpeg' }, { mime: 'image/svg+xml' }]) assert.equal((await post(form(options))).status, 415);
});
test('rejects duplicate files and excessive size', async () => {
  const data = form(); data.append('image', new Blob([png], { type: 'image/png' }), 'extra.png');
  assert.equal((await post(data)).status, 400);
  assert.equal((await post(form({ image: Buffer.alloc(MAX_UPLOAD_BYTES + 1) }))).status, 413);
});
test('rejects JSON request', async () => {
  assert.equal((await fetch(`${base}/api/transform`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
});
test('OpenAI mode without a key returns a safe configuration error', async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.IMAGE_PROVIDER = 'openai';
  try { assert.equal((await post(form())).status, 503); } finally {
    process.env.IMAGE_PROVIDER = 'demo';
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  }
});
test('internal errors do not leak details', async () => {
  const other = createApp({ transform: async () => { throw new Error('secret-key'); } }).listen(0, '127.0.0.1');
  await once(other, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${other.address().port}/api/transform`, { method: 'POST', body: form() });
    assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /secret-key/);
  } finally { await new Promise(resolve => other.close(resolve)); }
});
test('OpenAI adapter result reaches frontend as downloadable JPEG', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]);
  const transform = createImageTransformer({
    env: { IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only-secret' },
    fetchImpl: async () => Response.json({ data: [{ b64_json: jpeg.toString('base64') }] })
  });
  const other = createApp({ transform }).listen(0, '127.0.0.1');
  await once(other, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${other.address().port}/api/transform`, { method: 'POST', body: form() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-morph-mode'), 'ai');
    assert.match(response.headers.get('content-type'), /image\/jpeg/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  } finally { await new Promise(resolve => other.close(resolve)); }
});
