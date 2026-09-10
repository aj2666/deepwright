import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { defaultPluginRoot, loadCatalog } from "./catalog.ts";
import { main } from "./cli.ts";

const pluginRoot = defaultPluginRoot();
async function run(argv: string[]) {
  let stdout = "", stderr = "";
  const code = await main(argv, { stdout: (value) => { stdout += value; }, stderr: (value) => { stderr += value; } }, { pluginRoot });
  expect(code, stderr).toBe(0);
  return JSON.parse(stdout);
}
async function markdownFiles(directory: string, root = directory): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (path === join(root, ".deepwright", "runs")) continue;
    if (entry.isDirectory()) result.push(...await markdownFiles(path, root));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
  }
  return result;
}

describe("specification package integration", () => {
  it("excludes retained root run evidence while checking authored and nested Markdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwright-docs-"));
    const paths = ["README.md", ".deepwright/notes.md", ".deepwright/runs/retained.md", "nested/.deepwright/runs/authored.md", "docs/ignored.md"];
    try {
      for (const path of paths) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), "$deepwright:unknown\n");
      }
      await writeFile(join(root, ".gitignore"), "docs/ignored.md\n");
      expect((await markdownFiles(root)).map((path) => relative(root, path)).sort()).toEqual(paths.filter((path) => path !== ".deepwright/runs/retained.md").sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers Spec as an explicit skill with canonical invocation guidance", async () => {
    const result = await run(["skill", "spec", "--host", "omp", "--json"]);
    expect(result.skill).toMatchObject({ name: "spec", displayName: "Spec", implicit: false });
    expect(result.guidance.prompt).toBe("/skill:spec");
    const guidance = await run(["invoke", "spec", "--host", "codex", "--json"]);
    expect(guidance.guidance.cli).toBe("$deepwright:spec");
    const status = await run(["status", "--json"]);
    expect(status.implicitSkills).toEqual(["deepwright"]);
  });

  it("discovers the specification playbook from the existing router", async () => {
    const result = await run(["playbooks", "acceptance criteria", "--json"]);
    expect(result.playbooks.map((entry: { name: string }) => entry.name)).toContain("specification");
  });

  it("resolves qualified bundled-skill references throughout current Markdown", async () => {
    const names = new Set((await loadCatalog(pluginRoot)).map((skill) => skill.name));
    for (const file of await markdownFiles(resolve(pluginRoot, "../.."))) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/\$deepwright:([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
        expect(names.has(match[1]), `${file}: unknown skill ${match[1]}`).toBe(true);
      }
    }
  });


  it("ships specification license terms in the Deepwright plugin license", async () => {
    const license = await readFile(join(pluginRoot, "LICENSE"), "utf8");
    expect(license).toContain("Deepwright specification, testing, and requirements review");
    expect(license).toContain("Copyright (c) 2026 Matt Pocock");
    expect(license).toContain("Permission is hereby granted, free of charge");
  });
});
