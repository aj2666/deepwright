import test from 'node:test';
import assert from 'node:assert/strict';
import { saveDocument } from './save.mjs';
test('save handles storage errors', async () => {
  const result = await saveDocument({ write: async () => { throw new Error('disk full'); } }, 'text');
  assert.ok(result);
});
