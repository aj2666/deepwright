export function parseSettings(source) {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  return source.trim().split(/\r?\n/).map((line, index) => {
    const separator = line.indexOf("=");
    if (separator < 0) throw new SyntaxError(`Expected key=value on line ${index + 1}`);
    const key = line.slice(0, separator).trim();
    if (!/^[a-z][a-z0-9_-]*$/i.test(key)) throw new SyntaxError(`Invalid key on line ${index + 1}`);
    return { key, value: line.slice(separator + 1).trim() };
  });
}
