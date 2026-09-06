import test from "node:test";
import assert from "node:assert/strict";
import { parseSettings } from "./parser.mjs";

test("parses entries in source order with trimmed keys and values", () => {
  assert.deepEqual(parseSettings("  port = 8080\nhost = localhost  "), [
    { key: "port", value: "8080" }, { key: "host", value: "localhost" },
  ]);
});

test("preserves duplicate keys, empty values, and equals signs in values", () => {
  assert.deepEqual(parseSettings("token=a=b\r\ntoken=\nflag=yes"), [
    { key: "token", value: "a=b" }, { key: "token", value: "" }, { key: "flag", value: "yes" },
  ]);
});

test("rejects invalid lines and non-string input", () => {
  for (const source of ["host", "=value", "9port=8080", "first=yes\n\nlast=no"]) {
    assert.throws(() => parseSettings(source), SyntaxError);
  }
  assert.throws(() => parseSettings(null), TypeError);
});
