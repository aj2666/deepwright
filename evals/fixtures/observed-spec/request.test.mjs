import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from './request.mjs';
test('returns the first successful value', async () => {
  assert.equal(await request(() => 7), 7);
});
