import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPluginRoot } from "./catalog.ts";
import { loadPlaybooks, searchEntries, type SearchEntry } from "./workbench.ts";

const temporaryDirectories: string[] = [];
const feature = "| Add or change behavior | \u0060playbooks/feature.md\u0060 |";
const bugFix = "| Reproduce and fix a defect | \u0060playbooks/bug-fix.md\u0060 |";
const header = "| Request shape | Playbook |";
const separator = "| --- | --- |";

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

function router(rows: readonly string[] = [feature, bugFix]): string {
  return [
    "# Deepwright", "", "## Playbook router", "", "Read only the selected playbook.", "",
    header, separator, ...rows, "", "Select the smallest fitting workflow.", "",
    "## Optional tools", "", "Other instructions.", "",
  ].join("\n");
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "deepwright-workbench-")));
  temporaryDirectories.push(root);
  const pluginRoot = join(root, "plugin  $(touch sentinel) café\u202e");
  const skillRoot = join(pluginRoot, "skills", "deepwright");
  const directory = join(skillRoot, "playbooks");
  await mkdir(directory, { recursive: true });
  const skill = join(skillRoot, "SKILL.md");
  await writeFile(skill, router());
  await writeFile(join(directory, "feature.md"), "Feature's canonical body, not metadata.\n");
  await writeFile(join(directory, "bug-fix.md"), "Bug fix's canonical body, not metadata.\n");
  return { root, pluginRoot, directory, skill };
}

async function snapshot(root: string): Promise<unknown> {
  const values: unknown[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    values.push([entry.name, entry.isDirectory() ? await snapshot(path) : await readFile(path, "utf8")]);
  }
  return values;
}

describe("canonical playbook catalog", () => {
  it("matches all 23 real router rows and every flat playbook file", async () => {
    const pluginRoot = defaultPluginRoot();
    const playbooks = await loadPlaybooks(pluginRoot);
    expect(playbooks).toHaveLength(23);
    const source = await readFile(join(pluginRoot, "skills", "deepwright", "SKILL.md"), "utf8");
    const expected = source.split("\n").flatMap((line) => {
      const match = /\u0060playbooks\/([a-z0-9-]+)\.md\u0060/u.exec(line);
      return line.startsWith("|") && match !== null
        ? [{ name: match[1], description: line.split("|")[1].trim() }]
        : [];
    }).sort((a, b) => a.name.localeCompare(b.name));
    expect(playbooks.map(({ name, description }) => ({ name, description }))).toEqual(expected);
    const files = await readdir(join(pluginRoot, "skills", "deepwright", "playbooks"));
    expect(playbooks.map((entry) => entry.name + ".md")).toEqual(files.filter((file) => file.endsWith(".md")).sort());
    for (const playbook of playbooks) expect((await stat(playbook.path)).isFile()).toBe(true);
  });

  it("derives descriptions from the router, preserves canonical path bytes, and never writes", async () => {
    const context = await fixture();
    await writeFile(context.skill, router([
      feature.replace("Add or change behavior", "Deliver changed behavior with proof"),
      bugFix,
    ]).replace(/\n/g, "\r\n"));
    const before = await snapshot(context.root);
    const playbooks = await loadPlaybooks(context.pluginRoot);
    expect(playbooks).toEqual([
      { name: "bug-fix", description: "Reproduce and fix a defect", path: join(context.directory, "bug-fix.md") },
      { name: "feature", description: "Deliver changed behavior with proof", path: join(context.directory, "feature.md") },
    ]);
    expect(searchEntries(playbooks, "changed proof").map((entry) => entry.name)).toEqual(["feature"]);
    expect(JSON.stringify(playbooks)).not.toContain("canonical body");
    expect(await snapshot(context.root)).toEqual(before);
  });

  it("ignores examples in fenced code instead of treating them as another registry", async () => {
    const context = await fixture();
    await writeFile(context.skill, [
      "\u0060\u0060\u0060markdown", router(["| Decoy | \u0060playbooks/decoy.md\u0060 |"]), "\u0060\u0060\u0060",
      router(), "~~~markdown", "## Playbook router", header, separator, "~~~", "",
    ].join("\n"));
    expect((await loadPlaybooks(context.pluginRoot)).map((entry) => entry.name)).toEqual(["bug-fix", "feature"]);
  });

  it.each([
    ["missing heading", router().replace("## Playbook router", "## Elsewhere"), /exactly one Playbook router section/],
    ["duplicate heading", router() + "\n## Playbook router\n", /exactly one Playbook router section/],
    ["missing header", router().replace(header, "| Request | Path |"), /exactly one Request shape/],
    ["duplicate header", router().replace("Select the smallest fitting workflow.", header + "\n" + separator), /exactly one Request shape/],
    ["bad separator", router().replace(separator, "| wrong | wrong |"), /table separator/],
    ["empty table", router([]), /has no playbooks/],
    ["duplicate row", router([feature, bugFix, feature]), /duplicate playbook row/],
    ["split table", router([feature, "", bugFix]), /unexpected table rows/],
    ["extra table", router().replace("Read only the selected playbook.", "| Extra | Table |"), /unexpected table rows/],
  ] as const)("rejects %s", async (_label, source, expected) => {
    const context = await fixture();
    await writeFile(context.skill, source);
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(expected);
  });

  it.each([
    "| Added behavior | playbooks/feature.md |",
    "| Added behavior | \u0060../feature.md\u0060 |",
    "| Added behavior | \u0060playbooks/../feature.md\u0060 |",
    "| Added behavior | \u0060playbooks/%2e%2e.md\u0060 |",
    "| Added behavior | \u0060playbooks/sub/feature.md\u0060 |",
    "| Added behavior | \u0060playbooks/Feature.md\u0060 |",
    "| Added behavior | \u0060playbooks/feature.md?anything\u0060 |",
    "| Added behavior | \u0060playbooks/feature.md\u0060 | unexpected |",
    "| | \u0060playbooks/feature.md\u0060 |",
    "| Added\u001b[31m behavior | \u0060playbooks/feature.md\u0060 |",
    "| Added\u009b behavior | \u0060playbooks/feature.md\u0060 |",
    "| Added\u202e behavior | \u0060playbooks/feature.md\u0060 |",
    "| Added behavior | \u0060playbooks/feat\u202eure.md\u0060 |",
    "not a table row",
  ])("rejects malformed or unsafe row %j", async (row) => {
    const context = await fixture();
    await writeFile(context.skill, router([row, bugFix]));
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/malformed Playbook router row/);
  });

  it("rejects a missing playbook", async () => {
    const context = await fixture();
    await rm(join(context.directory, "feature.md"));
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/ENOENT|no such file/);
  });

  it.each(["uncatalogued.md", "FEATURE.MD"])("rejects extra flat markdown file %s", async (name) => {
    const context = await fixture();
    await writeFile(join(context.directory, name), "Not catalogued.\n");
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/uncatalogued playbook/);
  });

  it("rejects a directory masquerading as a playbook file", async () => {
    const context = await fixture();
    await rm(join(context.directory, "feature.md"));
    await mkdir(join(context.directory, "feature.md"));
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/regular, non-symlink files/);
  });

  it.each(["internal", "external"] as const)("rejects %s symlink playbook files", async (scope) => {
    const context = await fixture();
    const file = join(context.directory, "feature.md");
    await rm(file);
    const target = scope === "internal" ? join(context.directory, "bug-fix.md") : join(context.root, "outside.md");
    if (scope === "external") await writeFile(target, "Outside scope.\n");
    await symlink(target, file);
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/regular, non-symlink files/);
  });

  it("rejects a symlink router instead of following instructions outside the package", async () => {
    const context = await fixture();
    const outside = join(context.root, "outside.md");
    await writeFile(outside, router());
    await rm(context.skill);
    await symlink(outside, context.skill);
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/leaves its allowed directory/);
  });

  it("rejects an escaping playbook directory before reading its contents", async () => {
    const context = await fixture();
    await rm(join(context.directory, "feature.md"));
    await rm(join(context.directory, "bug-fix.md"));
    await rm(context.directory, { recursive: true });
    const outside = join(context.root, "outside");
    await mkdir(outside);
    await symlink(outside, context.directory);
    await expect(loadPlaybooks(context.pluginRoot)).rejects.toThrow(/leaves its allowed directory/);
  });
});

describe("literal metadata token search", () => {
  const entries = [
    { name: "bug-fix", description: "Reproduce a defect and verify the fix", category: "playbook" },
    { name: "alpha", displayName: "First Steps", description: "Explore regressions and root causes", category: "skill" },
    { name: "feature", description: "Add behavior with regression tests", category: "playbook" },
  ] satisfies readonly (SearchEntry & { readonly category: string })[];

  it.each([
    ["", ["bug-fix", "alpha", "feature"]],
    ["  \t\n ", ["bug-fix", "alpha", "feature"]],
    ["BUG FIX", ["bug-fix"]],
    ["reproduce\tVERIFY", ["bug-fix"]],
    ["First regressions", ["alpha"]],
    ["ALPHA root STEPS", ["alpha"]],
    ["regression behavior", ["feature"]],
    ["broken endpoint", []],
    ["[a-z]+", []],
    ["\u001b[31m", []],
  ] as const)("matches all literal tokens in %j across combined metadata", (query, expected) => {
    expect(searchEntries(entries, query).map((entry) => entry.name)).toEqual(expected);
  });

  it("preserves entry types and input order without mutation or route inference", () => {
    const before = JSON.stringify(entries);
    const matches = searchEntries(entries, "regress");
    expect(matches.map((entry) => entry.category)).toEqual(["skill", "playbook"]);
    expect(matches[0]).toBe(entries[1]);
    expect(JSON.stringify(entries)).toBe(before);
  });
});
