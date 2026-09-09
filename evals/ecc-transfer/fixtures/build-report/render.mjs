export function renderTitle(title) {
  if (typeof title !== "string") throw new TypeError("title must be a string");
  return `# ${title.trim()}`;
}
