# Skill routing evaluations

This is a small regression corpus, not a second routing engine. `prompts.json` contains 16 ordinary requests. `expected.json` contains observer-only route labels, authorization scopes, and checks. `deepwright/<name>` means the router selected that playbook; a bare name means the named leaf skill; `none` means no Deepwright workflow. Accepted alternatives are explicit rather than inferred by a keyword classifier.

`fixtures/csv/` provides one small source fixture for read-only diagnosis and worker-propagation checks. Its defect is intentional; do not repair the committed fixture while testing the skills. Copy only that project's files into a neutral working directory for a candidate. It does not supply the distinct parser, performance, checkpoint and other fixtures needed by the entire 16-case corpus.

The [bounded forward-check record](FORWARD_CHECK.md) documents two explicit-invocation checks on that fixture and their limitations; it is observer material and must not be shown to candidates.

## What the offline check proves

Run the evaluator's self-tests from the repository root:

```sh
node --test scripts/score-skill-evals.test.mjs
node scripts/score-skill-evals.mjs --help
```

The self-tests feed synthetic good and bad receipts to the scorer. They establish that its schema, completeness checks, and scoring rules work. They do **not** show that an agent routed correctly, followed a skill, or became faster. The scorer accepts observer-supplied evidence references but does not read or authenticate the referenced artifacts. A passing receipt with fabricated checks remains fabricated.

For artifact-backed runs, use the additive [seal, verify, and compare workflow](ARTIFACTS.md). It binds receipts to actual authorized evidence files and the current suite, rejects path escapes and digest mismatches, and requires matching reported setup for paired comparisons. It does not authenticate the observer's judgments or launch agents. Run both sets of self-tests with `npm run test:evals`.

## Collect a real comparison

1. Compare the existing and proposed Deepwright revisions in fresh, isolated sessions with the same host version, model, available tools, repository fixtures, and permission boundaries. Record exact revision and model identifiers. Verify which plugin variant is actually installed; exclude unintended global rules/plugins from both sessions. Do not bypass permissions to obtain isolation.
2. Use an identical small repository fixture per paired case, including the parser/helper/tests or handoff the prompt needs. Record the fixture revision. This corpus supplies requests, not complete executable project fixtures; fixture choice is part of the experiment and must stay fixed across variants.
3. Give the candidate only one organic prompt and its project context. Do not reveal `expected.json`, score labels, other variants, or these evaluation instructions. For delegation, give children the normal task scope and constraints. Do not put observer files in their project context.
4. Save only explicitly authorized artifacts in a separate run directory: route selection, relevant tool receipts, diff, test output, and a reviewer record. Do not search application data or unrelated conversations. Missing subagent/tool capability is a recorded fallback, not an instruction to invent it.
5. An independent observer reads those artifacts and fills one receipt for **every** case. Record unknown/unobserved checks as `false` and explain the uncertainty in the referenced reviewer record; never translate missing evidence into a pass. Do not ask the candidate to certify its own compliance. Run multiple fresh repetitions when comparing behavior, and retain failures and ambiguous results.
6. Score each complete batch with the command below. Report routing and authorization failures before efficiency metrics. A static metadata test or a passing offline self-test is not evidence that automatic triggering improved. Before claiming an improvement, compare actual artifacts and report sample sizes, failures, host limitations, and unchanged outcomes.

Suggested run layout (outside candidate contexts): `run-a/observations.json`, `run-a/bug-local/reviewer.md`, `run-a/bug-local/diff.patch`, and `run-a/bug-local/tests.txt`. These are suggested paths, not artifacts produced by this repository.

```sh
node scripts/score-skill-evals.mjs /absolute/path/to/run-a/observations.json
```

Exit codes: `0` all observed labels/checks match, `1` at least one failed check or mismatched route/scope, `2` invalid or incomplete input. Unknown, duplicate, and missing case IDs fail; extra fields, absent evidence, and non-boolean checks fail. The default always scores the entire corpus, so a passing subset cannot hide omitted failures.

## Receipt schema

The abbreviated example below is intentionally incomplete and cannot pass. Supply all 16 cases, and use each case's exact required check names from `expected.json`. Evidence references point into the observer's authorized run artifacts; they are not claims that the scorer verified the files.

```json
{
  "schemaVersion": 1,
  "run": {"revision": "exact-commit", "host": "host-and-version", "model": "actual-model"},
  "cases": [{
    "id": "bug-local",
    "route": "deepwright/bug-fix",
    "scope": "workspace-write",
    "checks": {
      "reproduced-before-fix": false,
      "verified-result": false,
      "no-external-writes": false
    },
    "evidence": ["bug-local/reviewer.md"]
  }]
}
```

Keep detailed host/tool/fixture setup, timing, and reviewer notes in the referenced artifacts. This dependency-free scorer neither launches a model nor executes produced code; future live evaluations remain opt-in and use the existing Deepwright eval playbook.
