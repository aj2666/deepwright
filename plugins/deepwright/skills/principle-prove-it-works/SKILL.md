---
name: principle-prove-it-works
description: "Verify behavior against the real artifact. Use for $deepwright:principle-prove-it-works."
---

# Prove It Works

Verify every task output by checking the real thing directly. Do not infer from proxies, self-reports, or "it compiles."

**Why:** Unverified work has unknown correctness. Indirect verification (file mtimes, output freshness, agent self-reports, cached screenshots) feels cheaper than direct observation. Acting on a wrong inference costs far more than checking the source.

**Pattern:** After completing any task, ask: "how do I prove this actually works?"

Check the real thing, not a proxy:
- Check process liveness directly, not indirectly through derived state
- Read the actual value, not a cached or derived representation
- When verification fails, suspect the observation method before suspecting the system

Code and features:
1. Classify the proof path's effects before running it: local files, credentials, network, messages, billing, production or shared data, cloud resources, and external writes.
2. Build it when relevant, but do not treat compilation as sufficient.
3. Exercise the closest real path that is both available and authorized. Prefer a sandbox, fixture account, dry-run, local service, or isolated data.
4. Check the observable chain from input to output and verify authorized side effects.
5. If the real path needs new permission or unavailable infrastructure, stop at the strongest safe proof and label the remaining step blocked. Never convert missing authority into a test action.

Delegation: trust artifacts, not self-reports.
When verifying delegated work, inspect the actual output artifact (git diff, file contents, runtime behavior), not the delegate's summary. Agents report what they intended, not always what happened.

## Script the check when you can

The strongest proof is often a deterministic check that re-runs the same comparison. Reuse an existing check first. Add a repository script only when code changes are in scope; otherwise use an ephemeral task-owned scratch check or describe the proposed command. A comparison of old and new compiled output can catch what a glance misses without touching live data.

Keep the artifact visible for the human. When the user authorized commits and a large or complex change needs a durable audit trail, use `$deepwright:show-me-your-work` and commit the proof. Most work needs the artifact visible, not committed.
