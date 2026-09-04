import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly displayName: string;
  readonly path: string;
  readonly invocation: string;
  readonly implicit: boolean;
}

export function defaultPluginRoot(): string {
  // Source discovery/ and installed dist/ occupy the same directory depth.
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export function validName(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function field(source: string, key: string, indent = "", kind: "string" | "boolean" = "string"): string {
  const lines = source.split("\n");
  const pattern = new RegExp("^" + indent + key + ": *(.*)$");
  const matches = lines.flatMap((line, index) => {
    const match = pattern.exec(line);
    return match === null ? [] : [{ value: match[1], index }];
  });
  if (matches.length !== 1 || !matches[0].value.trim()) {
    throw new Error("expected one non-empty, single-line " + key + " field");
  }
  for (let index = matches[0].index + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith(indent + " ") || line.startsWith(indent + "\t")) {
      throw new Error(key + " must be single-line; continuation lines are unsupported");
    }
    break;
  }
  const value = matches[0].value.trim();
  if (kind === "boolean") return value;
  if (value.startsWith('"')) {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== "string" || !decoded.trim() || /[\r\n]/u.test(decoded)) {
      throw new Error(key + " must be a non-empty single-line string");
    }
    return decoded;
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/u.test(value)) throw new Error("invalid quoted " + key);
    const decoded = value.slice(1, -1).replace(/''/g, "'");
    if (!decoded.trim()) throw new Error(key + " must not be empty");
    return decoded;
  }
  if (/^[>|[\]{},&*!#@\u0060]/u.test(value) || /\s#|:\s/u.test(value)) {
    throw new Error(key + " uses unsupported YAML; use a quoted single-line string");
  }
  if (/^(?:null|~|true|false|yes|no|on|off|[-+]?(?:0[xob][\da-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[-+]?\d+)?|\.inf|\.nan))$/iu.test(value)) {
    throw new Error(key + " must be a string; quote non-string YAML scalars");
  }
  return value;
}

function section(source: string, key: string): string {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => line === key + ":" ? [index] : []);
  if (starts.length !== 1) throw new Error("expected one " + key + " section");
  const start = starts[0] + 1;
  let end = start;
  while (end < lines.length && (lines[end].trim() === "" || /^\s/u.test(lines[end]))) end++;
  return lines.slice(start, end).join("\n");
}

async function confinedFile(root: string, path: string): Promise<string> {
  const canonical = await realpath(path);
  const local = relative(root, canonical);
  if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error("metadata path leaves the plugin skills directory: " + path);
  }
  return canonical;
}

export async function loadCatalog(pluginRoot: string): Promise<readonly Skill[]> {
  const root = await confinedFile(await realpath(pluginRoot), join(pluginRoot, "skills"));
  const entries = (await readdir(root, { withFileTypes: true }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("skill directories must not be symlinks: " + entry.name);
    if (!entry.isDirectory()) continue;
    if (!validName(entry.name)) throw new Error("invalid skill directory: " + entry.name);
    const directory = join(root, entry.name);
    try {
      const path = await confinedFile(root, join(directory, "SKILL.md"));
      const policyPath = await confinedFile(root, join(directory, "agents", "openai.yaml"));
      const source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
      const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(source)?.[1];
      if (frontmatter === undefined) throw new Error("missing YAML frontmatter");
      const name = field(frontmatter, "name");
      if (name !== entry.name) throw new Error("name must match the skill directory");
      const policy = (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
      const policySection = section(policy, "policy");
      const implicit = field(policySection, "allow_implicit_invocation", "  ", "boolean");
      if (!/^  allow_implicit_invocation: *(true|false) *$/m.test(policySection)) {
        throw new Error("implicit policy must be an unquoted true or false boolean");
      }
      skills.push({
        name,
        description: field(frontmatter, "description"),
        displayName: field(section(policy, "interface"), "display_name", "  "),
        path,
        invocation: "$deepwright:" + name,
        implicit: implicit === "true",
      });
    } catch (error) {
      throw new Error("invalid metadata for " + entry.name + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  if (skills.length === 0) throw new Error("no skills discovered in " + root);
  return skills;
}

export function terminalText(value: string): string {
  return value
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/gu, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, " ")
    .trim();
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => "\\u" + character.codePointAt(0)!.toString(16).padStart(4, "0"),
  ) + "\n";
}
