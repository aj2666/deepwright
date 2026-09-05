import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Observer-only: imports and executes candidate code. The host must provide
// isolation and a timeout; this checker is not a sandbox.
const [project, ...extra] = process.argv.slice(2);
if (!project || extra.length) throw new Error("Usage: node evals/checks/retry.mjs <isolated-project-directory>");
const { request } = await import(pathToFileURL(join(resolve(project), "request.mjs")).href);
assert.equal(typeof request, "function", "request must remain a public function");
const cases = [];
function check(name, run) { cases.push({ name, run }); }

for (const [name, args] of [["omitted options", []], ["empty options", [{}]]]) {
  check(`${name} preserve two retries and final-error identity`, async () => {
    const attempts = [];
    const errors = [new Error("first"), new Error("second"), new Error("final")];
    await assert.rejects(request((attempt) => {
      attempts.push(attempt);
      throw errors[attempt];
    }, ...args), (error) => error === errors[2]);
    assert.deepEqual(attempts, [0, 1, 2]);
  });
}

// These literal sequences describe the allowed contract, not a candidate's algorithm.
const limits = [
  [0, [0]], [1, [0, 1]], [2, [0, 1, 2]], [3, [0, 1, 2, 3]],
  [4, [0, 1, 2, 3, 4]], [5, [0, 1, 2, 3, 4, 5]],
];
for (const asynchronous of [false, true]) {
  const mode = asynchronous ? "async" : "sync";
  for (const [maxRetries, expectedAttempts] of limits) {
    check(`maxRetries=${maxRetries} bounds attempts and preserves the final error (${mode})`, async () => {
      const attempts = [];
      const errors = expectedAttempts.map((attempt) => new Error(`failure ${attempt}`));
      const operation = (attempt) => {
        attempts.push(attempt);
        throw errors[attempt];
      };
      const run = asynchronous ? async (attempt) => operation(attempt) : operation;
      await assert.rejects(request(run, { maxRetries }), (error) => error === errors.at(-1));
      assert.deepEqual(attempts, expectedAttempts);
    });
  }

  for (const [successAt, expectedAttempts] of limits) {
    check(`stops at first success on attempt ${successAt} (${mode})`, async () => {
      const attempts = [];
      const value = { message: "ok" };
      const operation = (attempt) => {
        attempts.push(attempt);
        if (attempt < successAt) throw new Error("transient");
        return value;
      };
      const run = asynchronous ? async (attempt) => operation(attempt) : operation;
      assert.equal(await request(run, { maxRetries: 5 }), value);
      assert.deepEqual(attempts, expectedAttempts);
    });
  }

  check(`preserves falsy and non-object results without retrying (${mode})`, async () => {
    for (const value of [undefined, null, false, 0, -0, "", NaN, 42, "ok", 0n, Symbol("result")]) {
      const attempts = [];
      const operation = (attempt) => { attempts.push(attempt); return value; };
      const run = asynchronous ? async (attempt) => operation(attempt) : operation;
      assert.equal(await request(run, { maxRetries: 5 }), value);
      assert.deepEqual(attempts, [0]);
    }
  });
}

for (const [label, maxRetries] of [
  ["negative", -1], ["above maximum", 6], ["fractional", 1.5], ["NaN", NaN],
  ["Infinity", Infinity], ["-Infinity", -Infinity], ["string", "2"], ["null", null],
  ["true", true], ["false", false], ["object", {}], ["array", []],
  ["bigint", 2n], ["boxed number", new Number(2)], ["symbol", Symbol("limit")],
]) {
  check(`rejects invalid maxRetries ${label} before calling the operation`, async () => {
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
