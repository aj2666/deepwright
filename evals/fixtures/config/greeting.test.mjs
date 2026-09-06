import test from "node:test";
import assert from "node:assert/strict";
import { greeting } from "./greeting.mjs";

test("greets the supplied name without surrounding whitespace", () => {
  assert.equal(greeting("  Sam  "), "Hello, Sam!");
});
