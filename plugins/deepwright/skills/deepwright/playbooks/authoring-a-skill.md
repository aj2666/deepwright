### Authoring or modifying a skill

**You own the skill's voice.** Agent-facing prose has a higher bar than human prose; unhelpful sentences become instructions.

1. Invoke `$skill-creator` when it is installed. Otherwise follow the repository's skill conventions and the current Codex skill schema directly.
2. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.
3. Test cases if structural; skip if subjective.
4. Run **Opening a PR** only when the user asked to publish the skill change as a PR.

When in doubt, delete; prose earns its keep by changing a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config); hardcoded details go stale (the `$deepwright:principle-encode-lessons-in-structure` skill). Delegate to other skills with `$skill-name` and a relative resource path; do not restate them. A workflow you keep hitting but is not captured can become a proposed skill, but do not create or install it without the user's request.

**Reply:** summary of the skill, key design decisions, validation notes.
