# Build the change and clean the diff

In Codex, Deepwright's build playbooks start from observed behavior and end in
executable evidence. Give Rivet the facts you have; the playbook supplies the
engineering sequence you should not have to restate.

## Prompt with what you know

A defect prompt states the symptom and requires a reproduction:

```text
$deepwright:deepwright this command emits two records after a retry. reproduce it first, then fix and verify.
```

A feature prompt names new behavior and preserved behavior:

```text
$deepwright:deepwright add a --json flag. keep text output byte-identical and verify both forms.
```

A refactoring prompt pins behavior before structure moves:

```text
$deepwright:deepwright move parsing into one module with zero behavior change. record the current output and prove it is unchanged.
```

A performance prompt gives Rivet a measurement, not a feeling:

```text
$deepwright:deepwright startup takes 1.8 seconds on this fixture. profile it, fix the measured cause, and show before and after.
```

These route to the [Bug fix](../../skills/deepwright/playbooks/bug-fix.md),
[Feature](../../skills/deepwright/playbooks/feature.md),
[Refactoring](../../skills/deepwright/playbooks/refactoring.md), or
[Performance](../../skills/deepwright/playbooks/perf-issue.md) playbook. The
[Hillclimb playbook](../../skills/deepwright/playbooks/hillclimb.md) handles
sustained improvement of one frozen metric, keeping wins and discarding failed
hypotheses.

## Write the failing test first with `$deepwright:tdd`

When the repository has a cheap, stable test path:

```text
$deepwright:tdd reproduce the duplicate write, then implement the smallest fix
```

[`$deepwright:tdd`](../../skills/tdd/SKILL.md) writes the smallest test that fails for the
intended reason, implements the fix, and reruns the focused test. If the only
test would require a broad harness or brittle mocks, it says so and uses the
closest executable proof instead.

## Let focused standards activate

[`$deepwright:typescript-best-practices`](../../skills/typescript-best-practices/SKILL.md)
can activate when the task touches TypeScript. It favors explicit boundaries,
discriminated unions, `unknown` at untrusted inputs, exhaustive variants, and
schema-derived types. Invoke it explicitly when you want the review visible:

```text
$deepwright:typescript-best-practices review the changed TypeScript boundaries
```

## Clean code and prose before committing

Deepwright has no dependency on an external cleanup plugin. Ask Rivet for the
outcome directly: remove unrelated edits, narrated code, dead compatibility
paths, unjustified guards, duplicate helpers, and speculative abstractions.

Use [`$deepwright:unslop`](../../skills/unslop/SKILL.md) for user-facing prose:

```text
$deepwright:unslop tighten the README and pull-request description; keep the technical claims precise.
```

Use [`$deepwright:no-comments`](../../skills/no-comments/SKILL.md) for a fresh review of
comments:

```text
$deepwright:no-comments review the diff and fix accepted findings at the code boundary
```

The keep list is narrow: required license headers, useful public-API docs,
links that preserve external context, and constraints forced by dependencies
you cannot reshape. A comment that compensates for surprising local code is a
refactoring signal. Encode an enforceable constraint as a type, test, schema, or
lint rule when practical.

Cleanup is part of correctness. Padded diffs increase reviewer load and create
places for the next defect to hide. Rivet should finish with the smallest
coherent diff that satisfies the stated behavior.

Next: [Verify and ship](./06-verify-and-ship.md).
