import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostCommandResult, HostCommandRunner } from "../config/config.ts";
import { main, supportsNodeVersion } from "./doctor.ts";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

function capture(): {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly io: {
    readonly stdout: (value: string) => void;
    readonly stderr: (value: string) => void;
  };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

function jsonResult(key: string, value: unknown): HostCommandResult {
  return { found: true, ok: true, stdout: JSON.stringify({ key, value, type: "unknown", description: "" }) + "\n", stderr: "" };
}

function replies(mapping: Record<string, HostCommandResult>): HostCommandRunner {
  return (command, args) => mapping[[command, ...args].join(" ")] ?? { found: false, ok: false, stdout: "", stderr: "" };
}

async function pluginRoot(name = "deepwright", version = "1.3.0") {
  const root = join(await mkdtemp(join(tmpdir(), "deepwright-doctor-")), "plugin");
  temporaryDirectories.push(join(root, ".."));
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await mkdir(join(root, ".codex-plugin"), { recursive: true });
  const manifest = JSON.stringify({ name, version }) + "\n";
  await writeFile(join(root, ".claude-plugin", "plugin.json"), manifest);
  await writeFile(join(root, ".codex-plugin", "plugin.json"), manifest);
  return root;
}

describe("deepwright doctor", () => {
  it.each([
    ["19.99.99", false],
    ["20.18.99", false],
    ["20.19.0-rc.1", false],
    ["20.19.0", true],
    ["20.19.1", true],
    ["21.0.0", true],
    ["unknown", false],
  ] as const)("classifies Node.js %s support as %s", (version, supported) => {
    expect(supportsNodeVersion(version)).toBe(supported);
  });

  it("prints help without running checks", async () => {
    const output = capture();
    expect(await main(["--help"], output.io)).toBe(0);
    expect(output.stdout.join("")).toContain("deepwright doctor [--json]");
    expect(output.stderr).toEqual([]);
  });

  it("rejects unknown or missing commands with a usage exit code", async () => {
    for (const args of [[], ["unknown"]]) {
      const output = capture();
      expect(await main(args, output.io)).toBe(64);
      expect(output.stderr.join("")).toContain("expected the 'doctor' command");
    }
  });

  it("emits a valid JSON report for the installed plugin layout", async () => {
    const output = capture();
    expect(await main(["--json", "doctor"], output.io)).toBe(0);
    const report = JSON.parse(output.stdout.join("")) as {
      readonly ok: boolean;
      readonly host: string;
      readonly checks: readonly {
        readonly id: string;
        readonly status: string;
        readonly required: boolean;
      }[];
    };
    expect(report.ok).toBe(true);
    expect(report.host).toBe("agents");
    expect(
      report.checks
        .filter((check) => check.required)
        .map((check) => [check.id, check.status])
    ).toEqual([
      ["node", "pass"],
      ["git", "pass"],
      ["bundles", "pass"],
      ["layout", "pass"],
    ]);
    expect(report.checks.some((check) => check.id.startsWith("omp"))).toBe(false);
  });

  it("does not query omp unless --host omp is requested", async () => {
    const output = capture();
    const run: HostCommandRunner = (command) => {
      if (command === "omp") throw new Error("probed omp");
      if (command === "git") return { found: true, ok: true, stdout: "git version 2.0.0\n", stderr: "" };
      if (command === "gh") return { found: false, ok: false, stdout: "", stderr: "" };
      return { found: false, ok: false, stdout: "", stderr: "" };
    };
    expect(await main(["--json", "doctor", "--host", "agents"], output.io, { run })).toBe(0);
    expect(JSON.parse(output.stdout.join("")).host).toBe("agents");
  });

  it("fails closed when omp is absent", async () => {
    const output = capture();
    const run = replies({
      "git --version": { found: true, ok: true, stdout: "git version 2.0.0\n", stderr: "" },
    });
    expect(await main(["--json", "doctor", "--host", "omp"], output.io, { run, pluginRoot: await pluginRoot() })).toBe(1);
    const report = JSON.parse(output.stdout.join("")) as {
      readonly ok: boolean;
      readonly checks: readonly { readonly id: string; readonly status: string; readonly required: boolean; readonly detail: string }[];
    };
    expect(report.ok).toBe(false);
    const omp = report.checks.find((check) => check.id === "omp");
    expect(omp).toMatchObject({ status: "fail", required: true });
    expect(omp?.detail).toContain("omp was not found");
  });

  it("fails when skills settings cannot be read", async () => {
    const output = capture();
    const run = replies({
      "git --version": { found: true, ok: true, stdout: "git version 2.0.0\n", stderr: "" },
      "omp --version": { found: true, ok: true, stdout: "omp/18.1.16\n", stderr: "" },
      "omp config get skills.enabled --json": { found: true, ok: false, stdout: "", stderr: "PRIVATE-SECRET" },
    });
    expect(await main(["--json", "doctor", "--host", "omp"], output.io, { run, pluginRoot: await pluginRoot() })).toBe(1);
    const report = JSON.parse(output.stdout.join(""));
    expect(JSON.stringify(report)).not.toContain("PRIVATE-SECRET");
    expect(report.checks.some((check: { id: string; status: string }) => check.id === "omp-skills" && check.status === "fail")).toBe(true);
  });

  it("fails when claude-plugins is disabled and still reports missing registry identity", async () => {
    const output = capture();
    const run = replies({
      "git --version": { found: true, ok: true, stdout: "git version 2.0.0\n", stderr: "" },
      "omp --version": { found: true, ok: true, stdout: "omp/18.1.16\n", stderr: "" },
      "omp config get skills.enabled --json": jsonResult("skills.enabled", true),
      "omp config get skills.enableSkillCommands --json": jsonResult("skills.enableSkillCommands", true),
      "omp config get disabledProviders --json": jsonResult("disabledProviders", ["claude-plugins"]),
      "omp config get enabledProviders --json": jsonResult("enabledProviders", []),
      "omp plugin list --json": { found: true, ok: true, stdout: JSON.stringify({ npm: [], marketplace: [] }) + "\n", stderr: "" },
    });
    const code = await main(["--json", "doctor", "--host", "omp"], output.io, { run, pluginRoot: await pluginRoot() });
    const report = JSON.parse(output.stdout.join("")) as {
      readonly ok: boolean;
      readonly checks: readonly { readonly id: string; readonly status: string; readonly required: boolean; readonly detail: string }[];
    };
    expect(code).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "omp-discovery")).toMatchObject({ status: "fail", required: true });
    expect(report.checks.find((check) => check.id === "omp-plugin")).toMatchObject({ status: "warn", required: false });
    expect(report.checks.find((check) => check.id === "omp-plugin")?.detail).toContain("does not claim live activation");
  });

  it("warns on colliding installed Deepwright identities", async () => {
    const output = capture();
    const run = replies({
      "git --version": { found: true, ok: true, stdout: "git version 2.0.0\n", stderr: "" },
      "omp --version": { found: true, ok: true, stdout: "omp/18.1.16\n", stderr: "" },
      "omp config get skills.enabled --json": jsonResult("skills.enabled", true),
      "omp config get skills.enableSkillCommands --json": jsonResult("skills.enableSkillCommands", true),
      "omp config get disabledProviders --json": jsonResult("disabledProviders", []),
      "omp config get enabledProviders --json": jsonResult("enabledProviders", ["claude-plugins"]),
      "omp plugin list --json": {
        found: true, ok: true,
        stdout: JSON.stringify({
          npm: [{ name: "deepwright", version: "1.2.0" }],
          marketplace: [{ id: "deepwright@local", entries: [{ version: "1.3.0" }] }],
        }) + "\n",
        stderr: "",
      },
    });
    expect(await main(["--json", "doctor", "--host", "omp"], output.io, { run, pluginRoot: await pluginRoot() })).toBe(0);
    const report = JSON.parse(output.stdout.join(""));
    expect(report.checks.find((check: { id: string }) => check.id === "omp-plugin")).toMatchObject({ status: "warn" });
    expect(report.checks.find((check: { id: string; detail: string }) => check.id === "omp-plugin").detail).toContain("collision");
  });
});
