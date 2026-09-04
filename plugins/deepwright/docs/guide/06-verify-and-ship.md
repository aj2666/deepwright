# Verify the result and handle the pull request

“It compiles” is not sufficient evidence. The [Prove It Works
principle](../../skills/principle-prove-it-works/SKILL.md) requires Rivet to
exercise the behavior or inspect the real output before reporting success.

## State the finish condition first

```text
$deepwright:deepwright add JSON output to this command. keep text output byte-identical, parse the JSON, run both forms against the sample project, and show the evidence.
```

That prompt gives Rivet three checks rather than a mood to satisfy. Match the
proof to the change:

- Run a CLI change through the real command.
- Walk a UI change through the running application.
- Replay a saved input through a parser or migration.
- Compare before-and-after profiles for a performance change.
- Read back the stored value after a persistence change.

If a check cannot run, the result is `BLOCKED` or inconclusive, not a pass. For
a small diff with uncertain reach, [`$deepwright:blast-radius`](../../skills/blast-radius/SKILL.md)
finds the safety claim the change depends on and tries to prove it with code.

## Create a project verification skill

When a project lacks a repeatable way to drive the real product, invoke:

```text
$deepwright:create-verification-skill
```

[`$deepwright:create-verification-skill`](../../skills/create-verification-skill/SKILL.md)
inspects how the application launches, how a user drives it, which existing
harness is strongest, what evidence demonstrates behavior, and how cleanup
works. It asks only for facts the repository cannot provide.

It writes `.agents/skills/verify-<app>/` with explicit Launch, Doctor, Drive,
Evidence, and Cleanup sections plus a feature map. The bundled
[feature-map example](../../skills/create-verification-skill/references/feature-map-example/)
shows the expected shape. Before handoff, the generator must launch the app,
run its doctor check, drive one feature, capture evidence, and clean up. Do not
trust an unproven verification skill.

Once it works, [`$deepwright:swarm`](../../skills/swarm/SKILL.md) can partition a complete
pass by independent feature-map entry.

## Keep the verification skill honest

```text
$deepwright:maintain-verification-skill audit the project verification skill and its feature map
```

[`$deepwright:maintain-verification-skill`](../../skills/maintain-verification-skill/SKILL.md)
compares the source with the map, then performs a live pass. It returns
`clean`, `changed`, or `blocked`. Corrections stay inside the verification
skill. A product regression is reported as a product regression, not hidden by
loosening the verification instructions.

## Open a focused pull request

```text
$deepwright:deepwright open a pull request with small ordered commits and verification evidence in the description.
```

The [Opening a PR playbook](../../skills/deepwright/playbooks/opening-a-pr.md)
checks branch state, cleans the diff and prose, and performs the requested
external write only after the target repository, base, and head are resolved.
Use the installed GitHub connector when it is available and authorized. In a
local Codex CLI session, authenticated `gh` is the fallback.

Opening a pull request does not authorize a merge, force-push, deployment, or
message to unrelated recipients.

## Drive a pull request to merge-ready

```text
$deepwright:deepwright babysit pull request 123 until it is merge-ready. fix verified blockers, but do not merge.
```

The [Babysit playbook](../../skills/deepwright/playbooks/babysit.md) handles
conflicts, review findings, and CI in that order. It batches compatible fixes so
checks do not restart after every small edit. It verifies comments before
acting: a real finding gets a fix; an incorrect finding gets a concise,
evidence-backed explanation when replying is within the user's authorization.

For a status-only request, Rivet remains read-only:

```text
$deepwright:deepwright check pull request 123 and report outstanding blockers. do not change anything.
```

Use a desktop scheduled task or an external `codex exec` schedule when the watch
must continue unattended. Those are separate mechanisms; see [Run unattended
work](./07-overnight.md).

## Land only with explicit authorization

```text
$deepwright:deepwright verify and land this stack from the bottom. stop at the first unverified pull request.
```

The [Shipping playbook](../../skills/deepwright/playbooks/shipping.md) resolves
the exact stack, verifies each current head independently, and lands only the
contiguous verified sequence. A new head invalidates stale evidence. GitHub
operations use the authorized connector first and authenticated `gh` as the
local fallback.

Merging is an external write. Rivet must not infer merge permission from “make
it green,” “review this,” or an earlier request to open the pull request.

Next: [Run unattended work](./07-overnight.md).
