export function isWholeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}
