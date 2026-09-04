import { describe, expect, it } from "vitest";
import { main } from "./doctor.ts";

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

describe("deepwright doctor", () => {
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
      readonly checks: readonly {
        readonly id: string;
        readonly status: string;
        readonly required: boolean;
      }[];
    };
    expect(report.ok).toBe(true);
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
  });
});
