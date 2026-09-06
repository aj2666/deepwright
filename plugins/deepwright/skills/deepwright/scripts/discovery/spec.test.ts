import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
async function markdownFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
  }
  return result;
}

describe("specification package integration", () => {
  it("discovers Spec as an explicit skill with canonical invocation guidance", async () => {
    const result = await run(["skill", "spec", "--json"]);
    expect(result.skill).toMatchObject({ name: "spec", displayName: "Spec", implicit: false, invocation: "$deepwright:spec" });
    const guidance = await run(["invoke", "spec", "--json"]);
    expect(guidance.guidance.cli).toBe("$deepwright:spec");
    expect(guidance.guidance.desktop).toContain("Spec");
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

  it("keeps one acceptance contract linked by its consumers", async () => {
    const contract = join(pluginRoot, "skills/spec/references/acceptance-contract.md");
    const consumers = [
      ["spec/SKILL.md", "references/acceptance-contract.md"],
      ["tdd/SKILL.md", "../spec/references/acceptance-contract.md"],
      ["interrogate/SKILL.md", "../spec/references/acceptance-contract.md"],
      ["deepwright/playbooks/feature.md", "../../spec/references/acceptance-contract.md"],
      ["deepwright/playbooks/multi-phase-plan.md", "../../spec/references/acceptance-contract.md"],
    ];
    for (const [file, link] of consumers) {
      const path = join(pluginRoot, "skills", file);
      expect(await readFile(path, "utf8")).toContain(`](${link})`);
      expect(resolve(dirname(path), link)).toBe(contract);
    }
  });

  it("ships the upstream license and its distribution notice", async () => {
    const license = await readFile(join(pluginRoot, "third_party/mattpocock-skills-LICENSE"), "utf8");
    expect(license).toContain("Copyright (c) 2026 Matt Pocock");
    const notice = await readFile(join(pluginRoot, "NOTICE.md"), "utf8");
    expect(notice).toContain("third_party/mattpocock-skills-LICENSE");
    expect(notice).toContain("3cca18b368ae95cdbdebbff572ccafa662551015");
  });
});
