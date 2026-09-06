import test from "node:test";
import assert from "node:assert/strict";
import { formatSettings } from "./formatter.mjs";

test("formats entries as lines without a trailing newline", () => {
  assert.equal(formatSettings([
    { key: "host", value: "localhost" }, { key: "port", value: "8080" },
  ]), "host=localhost\nport=8080");
});

test("formats an empty list and preserves empty or compound values", () => {
  assert.equal(formatSettings([]), "");
  assert.equal(formatSettings([
    { key: "empty", value: "" }, { key: "token", value: "a=b" },
  ]), "empty=\ntoken=a=b");
});
