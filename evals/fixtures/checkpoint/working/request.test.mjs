import test from "node:test";
import assert from "node:assert/strict";
import { request } from "./request.mjs";

test("returns the first successful result without retrying", async () => {
  const value = { message: "ok" };
  const attempts = [];
  assert.equal(await request((attempt) => { attempts.push(attempt); return value; }), value);
  assert.deepEqual(attempts, [0]);
});

test("retries failures twice and preserves the final error", async () => {
  const failure = new Error("offline");
  const attempts = [];
  await assert.rejects(request(async (attempt) => {
    attempts.push(attempt);
    throw failure;
  }), (error) => error === failure);
  assert.deepEqual(attempts, [0, 1, 2]);
});

test("rejects invalid maxRetries before calling the operation", async () => {
  for (const maxRetries of [-1, 6, 0.5, "2", null, NaN]) {
    let calls = 0;
    await assert.rejects(request(() => { calls += 1; }, { maxRetries }), RangeError);
    assert.equal(calls, 0);
  }
});

test("zero retries allows exactly one attempt", async () => {
  const failure = new Error("offline");
  const attempts = [];
  await assert.rejects(request((attempt) => {
    attempts.push(attempt);
    throw failure;
  }, { maxRetries: 0 }), (error) => error === failure);
  assert.deepEqual(attempts, [0]);
});

test("five retries allows exactly six attempts", async () => {
  const failure = new Error("offline");
  const attempts = [];
  await assert.rejects(request(async (attempt) => {
    attempts.push(attempt);
    throw failure;
  }, { maxRetries: 5 }), (error) => error === failure);
  assert.deepEqual(attempts, [0, 1, 2, 3, 4, 5]);
});
