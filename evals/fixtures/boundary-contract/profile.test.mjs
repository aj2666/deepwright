import test from 'node:test';
import assert from 'node:assert/strict';
import { profile } from './provider.mjs';
import { label } from './client.mjs';
test('provider returns identity', () => assert.equal(profile().id, 'p1'));
test('client displays missing note', () => assert.equal(label('{"id":"p1","note":null}'), 'No note'));
