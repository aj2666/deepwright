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
