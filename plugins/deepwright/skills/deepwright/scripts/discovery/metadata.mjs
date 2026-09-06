// Shared package/runtime metadata contract. Deliberately dependency-free so the
// repository validator runs without installing or rebuilding helper dependencies.
// This reads the package's supported single-line YAML subset, not arbitrary YAML.
import { readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export function validName(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function field(source, key, indent = "", kind = "string") {
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
    const decoded = JSON.parse(value);
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

function section(source, key) {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => line === key + ":" ? [index] : []);
  if (starts.length !== 1) throw new Error("expected one " + key + " section");
  const start = starts[0] + 1;
  let end = start;
  while (end < lines.length && (lines[end].trim() === "" || /^\s/u.test(lines[end]))) end++;
  return lines.slice(start, end).join("\n");
}

async function confinedFile(root, path) {
  const canonical = await realpath(path);
  const local = relative(root, canonical);
  if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error("metadata path leaves the plugin skills directory: " + path);
  }
  return canonical;
}

export async function loadCatalog(pluginRoot) {
  const root = await confinedFile(await realpath(pluginRoot), join(pluginRoot, "skills"));
  const entries = (await readdir(root, { withFileTypes: true }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const skills = [];
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
      if (`deepwright:${name}`.length > 64) throw new Error("qualified skill name exceeds 64 characters");
      const description = field(frontmatter, "description");
      if (description.length > 1024) throw new Error("description exceeds 1024 characters");
      const policy = (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
      const policySection = section(policy, "policy");
      const implicit = field(policySection, "allow_implicit_invocation", "  ", "boolean");
      if (!/^  allow_implicit_invocation: *(true|false) *$/m.test(policySection)) {
        throw new Error("implicit policy must be an unquoted true or false boolean");
      }
      const expectedImplicit = name === "deepwright";
      if ((implicit === "true") !== expectedImplicit) {
        throw new Error("implicit invocation must be " + expectedImplicit + " for " + name);
      }
      skills.push({
        name,
        description,
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
