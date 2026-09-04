# The Deepwright guide

Deepwright is an engineering workflow plugin for Codex. Rivet, its workshop
foreman, routes non-trivial work through focused playbooks, isolates parallel
writers, and asks for evidence from the real artifact before declaring success.

The same skills run in Codex CLI and in Codex inside the ChatGPT desktop app for
macOS. Surface-specific behavior—especially plugin installation and unattended
work—is called out where it matters.

Here's what you'll learn:

1. [Set up Deepwright](./01-setup.md). Install the plugin, verify discovery, and optionally configure role defaults.
2. [Route work through `$deepwright:deepwright`](./02-deepwright.md). Give Rivet a goal and let it choose the smallest fitting playbook.
3. [Understand the code](./03-understand.md). Use `$deepwright:how`, `$deepwright:why`, `$deepwright:teach`, and `$deepwright:recall` before editing.
4. [Design the change](./04-design.md). Use `$deepwright:architect`, `$deepwright:arena`, `$deepwright:swarm`, and `$deepwright:interrogate` when independent judgment adds value.
5. [Build and clean the change](./05-build-and-clean.md). Apply the build playbooks, `$deepwright:tdd`, `$deepwright:unslop`, and `$deepwright:no-comments`.
6. [Verify and ship](./06-verify-and-ship.md). Prove behavior, open a focused pull request, and handle review safely.
7. [Run unattended work](./07-overnight.md). Choose desktop scheduled tasks or `codex exec` without confusing the two.
8. [Steer with principle names](./08-principles.md). Redirect Rivet with a compact engineering vocabulary.
9. [Make it yours](./09-make-it-yours.md). Capture preferences and evaluate a skill change without relying on hidden chat files.
10. [Use recipes and avoid pitfalls](./10-recipes-and-pitfalls.md). Copy practical prompts and skip common mistakes.

Read the pages in order once. After that, each page stands alone.

## If you remember one thing

Give Rivet a goal, a boundary, and a checkable finish condition:

```text
$deepwright:deepwright the export writes duplicate rows when a retry lands mid-run. reproduce it first, then fix it and verify the stored rows.
```

You do not need to name a playbook or enumerate skills. Rivet selects the route,
keeps skipped steps visible with a reason, and returns the evidence that supports
the result.

Next: [Set up Deepwright](./01-setup.md).
