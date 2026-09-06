import { recordProcessed } from "./metrics.mjs";

export function normalizeLabel(value) {
  if (typeof value !== "string") throw new TypeError("label must be a string");
  recordProcessed();
  return value.trim().replace(/\s+/g, " ");
}
