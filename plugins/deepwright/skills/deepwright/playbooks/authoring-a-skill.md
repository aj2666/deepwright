### Authoring or modifying a skill

**You own the skill's voice.** Agent-facing prose has a higher bar than human prose; unhelpful sentences become instructions.

1. Use `$skill-creator` when its instructions are available within the current request's permissions. If the skill, its source, or a required tool is unavailable, follow the accessible repository conventions and Codex skill schema, and state that limitation. Do not report a skill as applied merely because its name or metadata is visible. A planning-only request still stops at the plan.
2. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.
3. Choose checks by the changed behavior, not whether the prose is called structural or subjective. Changes to activation, engineering decisions, permissions, tool use, delegation, or verification need scoped behavioral evaluation through [Eval](eval.md): comparable before/after tasks, negative or near-miss prompts, independent artifact checks where practical, and retained failures. Keep observer rubrics out of candidate contexts. Editorial changes that preserve behavior can use the lighter validation in step 2. If live evaluation is unavailable, report the instruction change as implemented and its behavior as unverified; a schema pass does not establish improvement.
4. Run **Opening a PR** only when the user asked to publish the skill change as a PR.

When in doubt, delete; prose earns its keep by changing a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config); hardcoded details go stale (the `$deepwright:principle-encode-lessons-in-structure` skill). Delegate to other skills with `$skill-name` and a relative resource path; do not restate them. A workflow you keep hitting but is not captured can become a proposed skill, but do not create or install it without the user's request.

**Reply:** summary of the skill, key design decisions, validation notes.
