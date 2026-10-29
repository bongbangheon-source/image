import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function client(fetchImpl) {
  const context = { window: {}, fetch: fetchImpl, FormData, Blob, AbortSignal, Error };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../public/api.js', import.meta.url), 'utf8'), context);
  return context.window;
}
test('AI response becomes an image Blob without applying demo filters', async () => {
  const window = client(async (url, options) => {
    assert.equal(url, '/api/transform');
    assert.equal(options.body.get('style'), 'poster');
    assert.equal(options.headers, undefined);
    return new Response(new Blob(['image-result'], { type: 'image/jpeg' }), { headers: { 'X-Morph-Mode': 'ai' } });
  });
  const result = await window.transformImage({ file: new Blob(['original']), style: 'poster' });
  assert.equal(result.type, 'image/jpeg');
  assert.equal(await result.text(), 'image-result');
  assert.equal(window.MORPH_RESULT_MODE, 'ai');
});
test('server error message is preserved for the status announcement', async () => {
  const window = client(async () => Response.json({ error: 'Readable error' }, { status: 429 }));
  await assert.rejects(window.transformImage({ file: new Blob(['original']), style: 'poster' }), /Readable error/);
});
