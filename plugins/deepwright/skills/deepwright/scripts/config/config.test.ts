import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FIELDS, DEFAULT_CONFIG, formatConfigTemplate, MAX_CONFIG_BYTES, readConfig } from "./config.ts";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture(source?: string | Buffer) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "deepwright-config-")));
  temporaryDirectories.push(root);
  const project = join(root, "project with  spaces $(touch sentinel)");
  await mkdir(project);
  const directory = join(project, ".codex");
  const path = join(directory, "deepwright.toml");
  if (source !== undefined) {
    await mkdir(directory);
    await writeFile(path, source);
  }
  return { root, project, directory, path };
}

describe("project-local configuration", () => {
  it("uses existing defaults with per-field provenance when the file is missing", async () => {
    const context = await fixture();
    const result = await readConfig(context.project);
    expect(result).toMatchObject({
      path: context.path, state: "missing", validation: "passed", ok: true,
      settings: DEFAULT_CONFIG, errors: [], hostValidation: "not-performed", unverifiedModelRoles: [],
    });
    expect(result.sources).toEqual(Object.fromEntries(CONFIG_FIELDS.map((field) => [field, "default"])));
    await mkdir(context.directory);
    expect((await readConfig(context.project)).state).toBe("missing");
  });

  it("accepts an empty document and absent sections without changing defaults", async () => {
    const context = await fixture("# All settings are optional.\n");
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ state: "present", ok: true, settings: DEFAULT_CONFIG });
    expect(Object.values(result.sources!)).toEqual(CONFIG_FIELDS.map(() => "default"));
  });

  it("reads a partial file with explicit sources and marks model availability unknown", async () => {
    const context = await fixture('[roles]\nresearch = "provider/model:revision"\n[parallelism]\nreviewers = 2\n');
    const result = await readConfig(context.project);
    expect(result.ok).toBe(true);
    expect(result.settings).toEqual({
      ...DEFAULT_CONFIG,
      roles: { ...DEFAULT_CONFIG.roles, research: "provider/model:revision" },
      parallelism: { ...DEFAULT_CONFIG.parallelism, reviewers: 2 },
    });
    expect(result.sources).toMatchObject({
      version: "default", "roles.code": "default", "roles.research": "project",
      "parallelism.reviewers": "project", "parallelism.swarm_workers": "default",
    });
    expect(result.hostValidation).toBe("not-performed");
    expect(result.unverifiedModelRoles).toEqual(["research"]);
  });

  it("accepts actual TOML quoted keys, inline/dotted tables, literal strings and CRLF", async () => {
    const context = await fixture([
      '"version" = 1 # schema version',
      "roles = { code = 'inherit-parent', research = \"provider/model\" }",
      "parallelism.swarm_workers = 0x4",
      'parallelism."design_candidates" = +3',
      "parallelism.reviewers = 1_0",
      "",
    ].join("\r\n"));
    const result = await readConfig(context.project);
    expect(result.ok).toBe(true);
    expect(result.settings?.parallelism).toEqual({ swarm_workers: 4, design_candidates: 3, reviewers: 10 });
    expect(result.sources).toMatchObject({ version: "project", "roles.review": "default" });
  });

  it("uses one defaults object for the generated print-only template", async () => {
    const template = formatConfigTemplate();
    const context = await fixture(template);
    expect((await readConfig(context.project)).settings).toEqual(DEFAULT_CONFIG);
    expect(Object.values((await readConfig(context.project)).sources!)).toEqual(CONFIG_FIELDS.map(() => "project"));
    expect(template).toContain('code = "inherit-parent"');
    expect(template.endsWith("\n")).toBe(true);
    expect(await readFile(context.path, "utf8")).toBe(template);
  });

  it("returns independent default values so a caller cannot mutate later resolutions", async () => {
    const context = await fixture();
    const first = await readConfig(context.project);
    (first.settings!.roles as { code: string }).code = "changed";
    first.sources!["roles.code"] = "project";
    expect((await readConfig(context.project)).settings?.roles.code).toBe("inherit-parent");
    expect((await readConfig(context.project)).sources?.["roles.code"]).toBe("default");
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.roles)).toBe(true);
  });

  it.each([
    ["version = 2", "unsupported-version"],
    ["version = -1", "unsupported-version"],
    ["version = 1.0", "invalid-type"],
    ["version = 1e0", "invalid-type"],
    ['version = "1"', "invalid-type"],
    ["version = true", "invalid-type"],
    ["roles = []", "invalid-type"],
    ['roles = "not a table"', "invalid-type"],
    ["roles = 1979-05-27", "invalid-type"],
    ["parallelism = false", "invalid-type"],
    ["[[roles]]\ncode = 'inherit-parent'", "invalid-type"],
    ["[roles]\ncode = 123", "invalid-model"],
    ["[roles]\ncode = ''", "invalid-model"],
    ["[roles]\ncode = 'two words'", "invalid-model"],
    ["[roles]\ncode = ' leading'", "invalid-model"],
    ["[roles]\ncode = 'trailing '", "invalid-model"],
    ['[roles]\ncode = "escaped\\nnewline"', "invalid-model"],
    ['[roles]\ncode = "\\u001bcontrol"', "invalid-model"],
    ['[roles]\ncode = "\\u202eoverride"', "invalid-model"],
    ["[parallelism]\nreviewers = 0", "invalid-parallelism"],
    ["[parallelism]\nreviewers = -2", "invalid-parallelism"],
    ["[parallelism]\nreviewers = 1.0", "invalid-parallelism"],
    ["[parallelism]\nreviewers = 1e0", "invalid-parallelism"],
    ["[parallelism]\nreviewers = nan", "invalid-parallelism"],
    ["[parallelism]\nreviewers = inf", "invalid-parallelism"],
    ["[parallelism]\nreviewers = true", "invalid-parallelism"],
    ["[parallelism]\nreviewers = '2'", "invalid-parallelism"],
    ["[parallelism]\nreviewers = [2]", "invalid-parallelism"],
    ["[parallelism]\nreviewers = 9007199254740992", "invalid-parallelism"],
  ])("rejects schema-invalid input %s without applying partial defaults", async (source, code) => {
    const context = await fixture(source + "\n");
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ state: "present", validation: "failed", ok: false, settings: null, sources: null });
    expect(result.errors.some((error) => error.code === code)).toBe(true);
    expect(result.unverifiedModelRoles).toEqual([]);
  });

  it("bounds opaque identifiers and preserves punctuation without executing them", async () => {
    const context = await fixture('[roles]\ncode = "' + "m".repeat(257) + '"\n');
    expect((await readConfig(context.project)).errors[0]?.code).toBe("invalid-model");
    const value = "provider/model:rev;$(`sentinel`)";
    await writeFile(context.path, "[roles]\ncode = " + JSON.stringify(value) + "\n");
    expect((await readConfig(context.project)).settings?.roles.code).toBe(value);
    await expect(readFile(join(context.project, "sentinel"))).rejects.toThrow();
  });

  it("accepts positive safe integers without imposing a made-up host capacity", async () => {
    const context = await fixture("[parallelism]\nswarm_workers = 9007199254740991\n");
    expect((await readConfig(context.project)).settings?.parallelism.swarm_workers).toBe(Number.MAX_SAFE_INTEGER);
    expect((await readConfig(context.project)).hostValidation).toBe("not-performed");
  });

  it.each([
    "secret-token-value = 'PRIVATE-SECRET'",
    "[roles]\nsecret-token-value = 'PRIVATE-SECRET'",
    "[parallelism]\nsecret-token-value = 'PRIVATE-SECRET'",
    "[__proto__]\nsecret-token-value = 'PRIVATE-SECRET'",
    "[roles.__proto__]\nsecret-token-value = 'PRIVATE-SECRET'",
    "[roles.constructor]\nsecret-token-value = 'PRIVATE-SECRET'",
  ])("rejects unknown keys without echoing their names or values: %s", async (source) => {
    const context = await fixture(source + "\n");
    const result = await readConfig(context.project);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "unknown-field")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-SECRET");
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
    expect(({} as Record<string, unknown>)["secret-token-value"]).toBeUndefined();
  });

  it.each([
    "version = 1\nversion = 1",
    "[roles]\ncode='one'\ncode='two'",
    "[roles]\n[roles]",
    "malformed = [ PRIVATE-SECRET-DO-NOT-PRINT",
    'roles.code = "PRIVATE-SECRET-DO-NOT-PRINT',
    "roles = " + "{ secret = ".repeat(15) + "'PRIVATE-SECRET'" + " }".repeat(15),
  ])("reports syntax locations without exposing parser excerpts: %s", async (source) => {
    const context = await fixture(source + "\n");
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ ok: false, validation: "failed", settings: null });
    expect(result.errors[0]).toMatchObject({ code: "invalid-toml", line: expect.any(Number), column: expect.any(Number) });
    expect(JSON.stringify(result)).not.toContain("PRIVATE-SECRET");
  });

  it("rejects malformed UTF-8 and oversized files with bounded generic errors", async () => {
    const context = await fixture(Buffer.from([0x23, 0x20, 0xc3, 0x28]));
    expect((await readConfig(context.project)).errors[0]?.code).toBe("invalid-utf8");
    await writeFile(context.path, "#" + "a".repeat(MAX_CONFIG_BYTES));
    expect((await readConfig(context.project)).errors[0]?.code).toBe("too-large");
    await writeFile(context.path, "#" + "a".repeat(MAX_CONFIG_BYTES - 1));
    expect((await readConfig(context.project)).ok).toBe(true);
  });

  it("does not search parent projects or invent defaults for an absent project", async () => {
    const context = await fixture("[parallelism]\nreviewers = 7\n");
    const child = join(context.project, "child");
    await mkdir(child);
    expect((await readConfig(child)).settings?.parallelism.reviewers).toBe(3);
    expect((await readConfig(join(context.root, "absent")))).toMatchObject({ state: "unreadable", ok: false, settings: null });
  });

  it("permits project aliases and confined config-file symlinks", async () => {
    const context = await fixture();
    await mkdir(context.directory);
    const target = join(context.project, "preferences.toml");
    await writeFile(target, "[parallelism]\nreviewers = 2\n");
    await symlink(target, context.path);
    expect((await readConfig(context.project)).settings?.parallelism.reviewers).toBe(2);
    const alias = join(context.root, "project alias");
    await symlink(context.project, alias, "dir");
    expect((await readConfig(alias)).settings?.parallelism.reviewers).toBe(2);
  });

  it("permits a confined .codex directory link", async () => {
    const context = await fixture();
    const target = join(context.project, "preferences");
    await mkdir(target);
    await writeFile(join(target, "deepwright.toml"), "version = 1\n");
    await symlink(target, context.directory, "dir");
    expect((await readConfig(context.project)).ok).toBe(true);
  });

  it("rejects an escaping config link without reading its source", async () => {
    const context = await fixture();
    await mkdir(context.directory);
    const target = join(context.root, "outside.toml");
    await writeFile(target, "SECRET-OUTSIDE = 'PRIVATE-SECRET'\n");
    await symlink(target, context.path);
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ state: "unreadable", ok: false, settings: null });
    expect(result.errors[0]?.code).toBe("outside-project");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-SECRET");
  });

  it("rejects an escaping directory even when the config file is absent", async () => {
    const context = await fixture();
    const target = join(context.root, "outside");
    await mkdir(target);
    await symlink(target, context.directory, "dir");
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ state: "unreadable", ok: false });
    expect(result.errors[0]?.code).toBe("outside-project");
  });

  it.each(["directory", "file"])("does not treat a dangling %s link as missing", async (kind) => {
    const context = await fixture();
    if (kind === "file") await mkdir(context.directory);
    await symlink(join(context.project, "absent"), kind === "file" ? context.path : context.directory);
    expect((await readConfig(context.project))).toMatchObject({ state: "unreadable", ok: false, settings: null });
  });

  it("rejects a directory masquerading as a configuration file", async () => {
    const context = await fixture();
    await mkdir(context.path, { recursive: true });
    expect((await readConfig(context.project))).toMatchObject({ state: "unreadable", ok: false, settings: null });
  });

  it.skipIf(process.platform === "win32")("rejects a FIFO without blocking", async () => {
    const context = await fixture();
    await mkdir(context.directory);
    const made = spawnSync("mkfifo", [context.path], { encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0);
    const result = await readConfig(context.project);
    expect(result).toMatchObject({ state: "unreadable", ok: false, settings: null });
    expect(result.errors[0]?.code).toBe("not-regular-file");
  }, 2000);

  it("does not write a config, mutate existing instructions, or change source text", async () => {
    const source = "# preserve this comment\n[roles]\nreview = 'inherit-parent'\n";
    const context = await fixture(source);
    const instructions = join(context.project, "AGENTS.md");
    await writeFile(instructions, "Existing instructions.\n");
    await readConfig(context.project);
    expect(await readFile(context.path, "utf8")).toBe(source);
    expect(await readFile(instructions, "utf8")).toBe("Existing instructions.\n");
  });
});
