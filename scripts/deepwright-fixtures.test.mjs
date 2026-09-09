import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../evals/fixtures/observed-spec/request.mjs';
import { responseBody } from '../evals/fixtures/boundary-contract/provider.mjs';
import { label } from '../evals/fixtures/boundary-contract/client.mjs';
import { saveDocument, preview } from '../evals/fixtures/review-failures/save.mjs';
import { createPicker } from '../evals/fixtures/click-path/picker.mjs';
import { normalizeKey } from '../evals/fixtures/reuse/keys.mjs';

test('observed specification fixture enforces two retries and preserves final failure', async () => {
  let calls = 0;
  const failure = new Error('offline');
  await assert.rejects(request(() => { calls++; throw failure; }), (error) => error === failure);
  assert.equal(calls, 3);
});
test('separate provider and consumer checks hide the real serialization incompatibility', () => {
  assert.equal(label('{"id":"p1","note":null}'), 'No note');
  assert.deepEqual(JSON.parse(responseBody()), { id: 'p1' });
  assert.throws(() => label(responseBody()), TypeError);
  assert.equal(label(JSON.stringify({ id: 'p1', note: null })), 'No note');
  assert.equal(label(JSON.stringify({ id: 'p1', note: 'hello' })), 'HELLO');
});
test('weak save assertion permits false success; expected cancellation remains distinguishable', async () => {
  const failure = new Error('disk full');
  const result = await saveDocument({ write: async () => { throw failure; } }, 'text');
  assert.equal(result.status, 'ok');
  const cancelled = Object.assign(new Error('cancel'), { name: 'AbortError' });
  assert.deepEqual(await preview(() => { throw cancelled; }), { status: 'cancelled' });
  await assert.rejects(preview(() => { throw failure; }), (error) => error === failure);
});
test('individual state actions pass while composed choose clears the selected item', () => {
  const picker = createPicker();
  picker.select('a'); assert.equal(picker.state.selected, 'a');
  picker.choose('b'); assert.deepEqual(picker.state, { open: false, selected: null });
  const compatible = createPicker();
  compatible.close(); compatible.select('b');
  assert.deepEqual(compatible.state, { open: false, selected: 'b' });
  compatible.cancel(); assert.deepEqual(compatible.state, { open: false, selected: null });
});
test('local reusable key helper satisfies the supplied whitespace and case boundary', () => {
  assert.equal(normalizeKey('  A  B \n'), 'a  b');
  assert.equal(normalizeKey(' \t'), '');
});
