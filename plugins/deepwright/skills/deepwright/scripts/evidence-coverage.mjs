export const COVERAGE_STATES = Object.freeze(["complete", "partial", "unavailable", "not-run", "error"]);

export function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} has missing or unknown fields`);
  }
}

export function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 16_384) {
    throw new Error(`${label} must be a nonempty string of at most 16384 characters`);
  }
  return value;
}

export function validateCoverage(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
    throw new Error("coverage must contain 1 through 100 scoped observations");
  }
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `coverage[${index}]`;
    exactObject(entry, ["source", "scope", "status", "limitations"], label);
    nonempty(entry.source, `${label}.source`);
    nonempty(entry.scope, `${label}.scope`);
    if (!COVERAGE_STATES.includes(entry.status)) throw new Error(`${label}.status is unknown`);
    if (!Array.isArray(entry.limitations) || entry.limitations.length > 100) {
      throw new Error(`${label}.limitations must be an array of at most 100 strings`);
    }
    for (const limitation of entry.limitations) nonempty(limitation, `${label}.limitations`);
    if ((entry.status === "complete") !== (entry.limitations.length === 0)) {
      throw new Error(`${label}: complete scope has no known omissions; other states must explain their limitations`);
    }
    const key = JSON.stringify([entry.source, entry.scope]);
    if (seen.has(key)) throw new Error(`${label} duplicates a source and scope`);
    seen.add(key);
  }
  return entries;
}
