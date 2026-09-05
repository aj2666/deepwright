import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Observer-only acceptance checks. Importing the candidate executes its code;
// run only in the isolated evaluation environment, never with real credentials.
const [project, ...extra] = process.argv.slice(2);
if (!project || extra.length) throw new Error("Usage: node evals/checks/retry.mjs <isolated-project-directory>");
const { request } = await import(pathToFileURL(join(resolve(project), "request.mjs")).href);
assert.equal(typeof request, "function", "request must remain a public function");
const cases = [];
function check(name, run) { cases.push({ name, run }); }

check("omitted options preserve two retries and final-error identity", async () => {
  const attempts = [];
  const failure = new Error("offline");
  await assert.rejects(request((attempt) => {
    attempts.push(attempt);
    throw failure;
  }), (error) => error === failure);
  assert.deepEqual(attempts, [0, 1, 2]);
});

check("an empty options object preserves the default", async () => {
  const attempts = [];
  await assert.rejects(request((attempt) => {
    attempts.push(attempt);
    throw new Error("offline");
  }, {}));
  assert.deepEqual(attempts, [0, 1, 2]);
});

for (const [maxRetries, expectedAttempts] of [
  [0, [0]], [1, [0, 1]], [2, [0, 1, 2]], [5, [0, 1, 2, 3, 4, 5]],
]) {
  check(`maxRetries=${maxRetries} bounds attempts without changing the final error`, async () => {
    const attempts = [];
    const failure = new Error("offline");
    await assert.rejects(request(async (attempt) => {
      attempts.push(attempt);
      throw failure;
    }, { maxRetries }), (error) => error === failure);
    assert.deepEqual(attempts, expectedAttempts);
  });
}

for (const asynchronous of [false, true]) {
  check(`stops at first success for ${asynchronous ? "async" : "sync"} operations`, async () => {
    const attempts = [];
    const value = { message: "ok" };
    const operation = (attempt) => {
      attempts.push(attempt);
      if (attempt === 0) throw new Error("transient");
      return value;
    };
    const run = asynchronous ? async (attempt) => operation(attempt) : operation;
    assert.equal(await request(run, { maxRetries: 5 }), value);
    assert.deepEqual(attempts, [0, 1]);
  });
}

for (const maxRetries of [-1, 6, 1.5, NaN, Infinity, -Infinity, "2", null, true]) {
  check(`rejects invalid maxRetries ${String(maxRetries)} before calling the operation`, async () => {
    let calls = 0;
    await assert.rejects(async () => request(() => { calls += 1; }, { maxRetries }));
    assert.equal(calls, 0);
  });
}

const results = [];
for (const { name, run } of cases) {
  try { await run(); results.push({ name, pass: true }); }
  catch { results.push({ name, pass: false }); }
}
const ok = results.every((result) => result.pass);
console.log(JSON.stringify({ ok, total: results.length, results }, null, 2));
process.exitCode = ok ? 0 : 1;
