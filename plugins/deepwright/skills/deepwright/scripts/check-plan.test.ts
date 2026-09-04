import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-plan.mjs");
const RULE =
  "Tests alone are not sufficient for behavior-changing work. Every applicable unit, live, and performance block must be checked at the exact head SHA.";

const validPlan = `# Example plan

One unit updates the example safely.

## How to read this

One box is one unit of work. Every box names the evidence. Check a box only when the evidence exists.
Run this plan by invoking \`$deepwright:deepwright\` and following \`playbooks/orchestrate.md\`.
Push, PR, review, retarget or rebase, and merge permissions all require explicit user authorization.
${RULE}

## Program checklist

### Authorize and initialize

- [ ] Wait for explicit go from the user, record the resolved default branch, and create \`.deepwright/runs/example/\`.

### Assign owners

- [ ] Use host collaboration capability when available.

### GitHub mechanics

- [ ] Prefer the GitHub connector or preflight authenticated \`gh\`.

### Verdict and landing

- [ ] Run a risk-based set of independent lanes at the exact head SHA.

### Evidence recipe for each live lane

- [ ] Use an isolated worktree and save \`.deepwright/runs/example/artifacts/unit/lane/receipt.txt\`.

## Implement the example (unit-one)

**Depends on.** None.

**Files.**

- [ ] Edit \`src/example.ts\`.

**Build.**

- [ ] Implement the example behavior.

**You see.**

- [ ] The command prints success.

**Verify, unit.** ${RULE}

- [ ] Run \`npm test\` and save its receipt.

**Verify, live.** ${RULE}

- [ ] Regression lane. Compare default and head. Save \`artifacts/regression.txt\`. Pass when behavior matches.
- [ ] Primary lane. Run the load-bearing flow. Save \`artifacts/primary.txt\`. Pass when it succeeds.
- [ ] Risk lane. Trigger the failure path. Save \`artifacts/risk.txt\`. Pass when it fails closed.

**Verify, performance.** ${RULE}

- [ ] Metric. Record duration.
- [ ] Probe. Run \`bench\`.
- [ ] Baseline. Record the default-branch value first.
- [ ] Rule. Fail above 100 ms.

**Review gate.** None: no interaction changes.

**Land or append.**

- [ ] Record the independent verdict at the exact head SHA.

## Close the program

- [ ] Reconcile every box with evidence.

## Appendix A. Prototype evidence

No prototype was needed.
`;

function validate(plan: string) {
  const result = spawnSync(process.execPath, [SCRIPT, "-"], {
    encoding: "utf8",
    input: plan,
  });
  if (result.error) throw result.error;
  return result;
}

describe("check-plan", () => {
  it("accepts the risk-based Deepwright plan contract", () => {
    const result = validate(validPlan);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 unit section, 0 problems");
    expect(result.stderr).toBe("");
  });

  it("rejects an unqualified Deepwright router invocation", () => {
    const result = validate(
      validPlan.replace("$deepwright:deepwright", "$" + "deepwright")
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('How to read this lacks "/\\$deepwright:deepwright/"');
  });

  it("rejects fixed numbered lanes in place of risk-based lanes", () => {
    const result = validate(
      validPlan
        .replace("Regression lane.", "Lane 1.")
        .replace("Primary lane.", "Lane 2.")
        .replace("Risk lane.", "Lane 3.")
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Verify, live lacks "Regression lane."');
    expect(result.stderr).toContain('Verify, live lacks "Primary lane."');
    expect(result.stderr).toContain('Verify, live lacks "Risk lane."');
  });

  it("rejects unfilled skeleton placeholders", () => {
    const result = validate(validPlan.replace("Example plan", "<Program> plan"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unfilled placeholder");
  });
});
