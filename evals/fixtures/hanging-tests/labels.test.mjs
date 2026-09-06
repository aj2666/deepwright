import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLabel } from "./labels.mjs";
import { readMetrics } from "./metrics.mjs";

test("normalizes a label and records successful processing", () => {
  const before = readMetrics().processed;
  assert.equal(normalizeLabel("  Cedar \t field\n guide  "), "Cedar field guide");
  assert.equal(readMetrics().processed, before + 1);
});

test("rejects non-string labels without recording success", () => {
  const before = readMetrics().processed;
  assert.throws(() => normalizeLabel(null), TypeError);
  assert.equal(readMetrics().processed, before);
});
