import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export interface Playbook {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

export interface SearchEntry {
  readonly name: string;
  readonly description: string;
  readonly displayName?: string;
}

export function searchEntries<T extends SearchEntry>(
  entries: readonly T[],
  query: string,
): readonly T[] {
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    const text = [entry.name, entry.displayName ?? "", entry.description].join(" ").toLowerCase();
    return tokens.every((token) => text.includes(token));
  });
}

async function confined(root: string, target: string): Promise<string> {
  const canonical = await realpath(target);
  const local = relative(root, canonical);
  if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error("playbook catalog path leaves its allowed directory: " + target);
  }
  return canonical;
}

async function regularFile(root: string, target: string): Promise<string> {
  const canonical = await confined(root, target);
  if (!(await lstat(target)).isFile()) {
    throw new Error("playbook catalog requires a regular, non-symlink file: " + target);
  }
  return canonical;
}

function proseLines(source: string): readonly string[] {
  let fence: { marker: string; length: number } | undefined;
  return source.replace(/\r\n/g, "\n").split("\n").map((line) => {
    const match = /^ {0,3}(\u0060{3,}|~{3,})(.*)$/u.exec(line);
    if (fence !== undefined) {
      if (match !== null && match[1][0] === fence.marker &&
          match[1].length >= fence.length && match[2].trim() === "") fence = undefined;
      return "";
    }
    if (match !== null) {
      fence = { marker: match[1][0], length: match[1].length };
      return "";
    }
    return line;
  });
}

function routerRows(source: string): readonly Omit<Playbook, "path">[] {
  const lines = proseLines(source);
  const headings = lines.flatMap((line, index) => line.trim() === "## Playbook router" ? [index] : []);
  if (headings.length !== 1) throw new Error("expected exactly one Playbook router section");
  const start = headings[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && /^##\s/u.test(line));
  if (end < 0) end = lines.length;
  const section = lines.slice(start, end);
  const headers = section.flatMap((line, index) =>
    /^\|\s*Request shape\s*\|\s*Playbook\s*\|$/u.test(line) ? [index] : []);
  if (headers.length !== 1) throw new Error("expected exactly one Request shape / Playbook table");
  const table = headers[0];
  if (!/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|$/u.test(section[table + 1] ?? "")) {
    throw new Error("invalid Playbook router table separator");
  }
  let tableEnd = section.findIndex((line, index) => index > table + 1 && line.trim() === "");
  if (tableEnd < 0) tableEnd = section.length;
  if (section.some((line, index) => (index < table || index >= tableEnd) && /^\s*\|/u.test(line))) {
    throw new Error("unexpected table rows outside the Playbook router table");
  }
  const rows: Omit<Playbook, "path">[] = [];
  const names = new Set<string>();
  for (let index = table + 2; index < tableEnd; index++) {
    const match = /^\|\s*([^|]+?)\s*\|\s*\u0060playbooks\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md\u0060\s*\|$/u.exec(section[index]);
    if (match === null || !match[1].trim() ||
        /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(match[1])) {
      throw new Error("malformed Playbook router row at line " + (start + index + 1));
    }
    if (names.has(match[2])) throw new Error("duplicate playbook row: " + match[2]);
    names.add(match[2]);
    rows.push({ name: match[2], description: match[1].trim() });
  }
  if (rows.length === 0) throw new Error("Playbook router table has no playbooks");
  return rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export async function loadPlaybooks(pluginRoot: string): Promise<readonly Playbook[]> {
  const root = await realpath(pluginRoot);
  const router = await regularFile(root, join(root, "skills", "deepwright", "SKILL.md"));
  const rows = routerRows(await readFile(router, "utf8"));
  const directory = await confined(root, join(root, "skills", "deepwright", "playbooks"));
  if (!(await stat(directory)).isDirectory()) throw new Error("playbooks must be a directory");
  const expected = new Set(rows.map((row) => row.name + ".md"));
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    if (!expected.has(entry.name)) throw new Error("uncatalogued playbook markdown file: " + entry.name);
    if (!entry.isFile()) throw new Error("playbooks must be regular, non-symlink files: " + entry.name);
  }
  const playbooks: Playbook[] = [];
  for (const row of rows) {
    const path = await regularFile(directory, join(directory, row.name + ".md"));
    playbooks.push({ ...row, path });
  }
  return playbooks;
}
