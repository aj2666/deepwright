import test from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "./loader.mjs";

test("loads the users fixture", async () => {
  assert.deepEqual(await loadFixture("users"), [
    { id: 1, name: "Sam" }, { id: 2, name: "Jo" },
  ]);
});

test("rejects invalid names before opening a file", async () => {
  for (const name of ["../users", "", null, "Users"]) {
    await assert.rejects(loadFixture(name), RangeError);
  }
});

test("preserves the read error for a missing fixture", async () => {
  await assert.rejects(loadFixture("missing"), (error) => error.code === "ENOENT");
});
