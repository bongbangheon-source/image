import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageTransformer } from '../src/image-service.js';

const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]);
const input = { buffer: jpeg, mimeType: 'image/jpeg', style: 'caricature' };
const config = { IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: 'test-secret-never-public' };
const success = () => Response.json({ data: [{ b64_json: jpeg.toString('base64') }] });

test('sends original image and distinct style prompts to exact requested model', async () => {
  const prompts = new Set();
  const transform = createImageTransformer({ env: config, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${config.OPENAI_API_KEY}`);
    const body = options.body;
    assert.equal(body.get('model'), 'gpt-image-2.5-sunburst');
    assert.equal(body.get('output_format'), 'jpeg');
    assert.equal(body.get('n'), '1');
    assert.equal(body.has('response_format'), false);
    assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()), jpeg);
    prompts.add(body.get('prompt'));
    return success();
  } });
  for (const style of ['caricature', 'animation', 'poster', 'watercolor']) {
    const result = await transform({ ...input, style });
    assert.deepEqual(result.buffer, jpeg);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.mode, 'ai');
  }
  assert.equal(prompts.size, 4);
});
test('missing key and unknown style fail before making a request', async () => {
  let calls = 0;
  const transform = createImageTransformer({ env: { IMAGE_PROVIDER: 'openai' }, fetchImpl: () => { calls++; } });
  await assert.rejects(transform(input), error => error.status === 503);
  await assert.rejects(transform({ ...input, style: '__proto__' }), error => error.status === 400);
  assert.equal(calls, 0);
});
test('maps upstream errors to safe messages without exposing response body', async () => {
  for (const [upstream, expected] of [[400, 400], [401, 503], [403, 403], [404, 503], [429, 429], [500, 502]]) {
    const transform = createImageTransformer({ env: config, fetchImpl: async () => Response.json({ error: { message: 'test-secret-never-public' } }, { status: upstream }) });
    await assert.rejects(transform(input), error => error.status === expected && !error.message.includes('test-secret'));
  }
});
test('handles timeout, network failure and malformed output', async () => {
  for (const [fetchImpl, status] of [
    [async () => { throw Object.assign(new Error('secret'), { name: 'TimeoutError' }); }, 504],
    [async () => { throw new Error('secret'); }, 502],
    [async () => Response.json({ data: [] }), 502],
    [async () => Response.json({ data: [{ b64_json: 'not base64' }] }), 502],
    [async () => new Response('bad JSON'), 502]
  ]) {
    await assert.rejects(createImageTransformer({ env: config, fetchImpl })(input), error => error.status === status);
  }
});
test('demo mode remains available without an API key', async () => {
  const result = await createImageTransformer({ env: { IMAGE_PROVIDER: 'demo' } })(input);
  assert.equal(result.mode, 'demo');
  assert.deepEqual(result.buffer, jpeg);
});
