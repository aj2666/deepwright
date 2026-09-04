# Set up Deepwright

Deepwright works without model configuration. Install it, confirm that Codex can
see its skills, and run one small task. Configure role overrides only when the
current Codex host confirms that those models are available.

## Install from the private marketplace

From Codex CLI, add the repository as a marketplace. An SSH URL is a good fit
for a private GitHub repository when your Mac is already authenticated:

```bash
codex plugin marketplace add git@github.com:aj2666/deepwright.git --ref main --json
codex plugin marketplace list --json
codex plugin list --available --json
```

The marketplace list reports its actual name. This repository declares the
marketplace name `deepwright`, so install the plugin with:

```bash
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

For a local checkout, add its absolute repository path instead:

```bash
codex plugin marketplace add /absolute/path/to/deepwright --json
```

In Codex CLI, `/plugins` opens the interactive plugin browser. In the ChatGPT
desktop app for macOS, open **Plugins**, select the marketplace, and install
**Deepwright**. Start a new Codex session after installation so the bundled
skills are loaded. In the desktop app, type `@` and select **Deepwright** or a
bundled skill by its displayed name. The `$deepwright:...` examples below are
Codex CLI syntax.

If you update the Git marketplace later, refresh it, reinstall Deepwright, and
start another new Codex session:

```bash
codex plugin marketplace upgrade deepwright --json
codex plugin add deepwright@deepwright --json
codex plugin list --json
```

Installation does not grant repository, network, GitHub, merge, or deployment
permission. Connect the GitHub connector when you want Rivet to work with pull
requests. In a local CLI environment, authenticated `gh` is the fallback.

## Run the optional setup skill

Invoke:

```text
$deepwright:setup-deepwright
```

[`$deepwright:setup-deepwright`](../../skills/setup-deepwright/SKILL.md) inspects the
subagent and model options that the current host actually exposes. It writes the
portable project configuration to `.codex/deepwright.toml`.

Deepwright inherits the parent Codex model by default. `inherit-parent` means
exactly that; it is not a model identifier. Never copy a model slug from an old
configuration or another provider. An explicit override is valid only after the
active Codex host reports that model as available.

Project configuration can set role preferences and parallelism limits, but it
cannot grant permission for merges, deployments, messages, destructive changes,
or any other external write. An absent configuration file is valid.

## Create a project verification skill when it earns its place

Setup does not create a verification skill automatically. If the repository has
no suitable way to exercise the product, invoke
[`$deepwright:create-verification-skill`](../../skills/create-verification-skill/SKILL.md)
as a separate task.

Accepting creates a project-local skill under
`.agents/skills/verify-<app>/`. The generator must prove one real flow before the
skill is trusted. Declining changes nothing; you can invoke the generator later.
[Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill)
explains the contract.

## Run your first task

Pick a real, bounded change:

```text
$deepwright:deepwright add a --json flag to this command. keep text output byte-identical and verify both forms.
```

Rivet reads the applicable principles, selects a playbook, previews the route,
and keeps each delivery step checkable. Continue with ordinary follow-ups in the
same session, or invoke `$deepwright:deepwright` again when you want to make the routing
explicit.

Next: [Route work through `$deepwright:deepwright`](./02-deepwright.md).
