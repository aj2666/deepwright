import test from "node:test";
import assert from "node:assert/strict";
import { renderTitle } from "./render.mjs";

test("renders a trimmed heading", () => assert.equal(renderTitle(" Notes "), "# Notes"));
test("rejects non-string input", () => assert.throws(() => renderTitle(null), TypeError));
