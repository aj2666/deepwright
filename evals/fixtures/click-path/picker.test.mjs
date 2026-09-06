import test from 'node:test';
import assert from 'node:assert/strict';
import { createPicker } from './picker.mjs';
test('selection action sets the item', () => { const p = createPicker(); p.select('a'); assert.equal(p.state.selected, 'a'); });
test('close action closes the picker', () => { const p = createPicker(); p.close(); assert.equal(p.state.open, false); });
