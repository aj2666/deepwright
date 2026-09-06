# Research before adding a dependency or helper

Use when a proposed implementation introduces a dependency, integration capability, or substantial reusable helper. A trivial expression or a change that already follows an established local pattern does not need an ecosystem survey.

Start with the repository: search existing helpers, call sites, dependency manifests, and established capabilities. Read the promising implementation or actual interface. If local options do not meet the requirement and external research is allowed, check primary package or service documentation for a small number of viable candidates. Existing host capabilities may satisfy the task without introducing a runtime dependency. Do not scan unrelated personal installations or assume a connector is available.

Compare adopt, extend, and build against the specific requirement. Consider actual functionality, supported runtime and API compatibility, maintenance status, licensing constraints, dependency cost, and the integration or security assumptions relevant to this use. Verify changing external facts; do not invent current version, maintenance, or vulnerability claims from memory.

Record the choice in a few sentences: the candidate or local symbol checked, the requirement it satisfies or misses, and why adopting, extending, or building fits. Link the inspected source or name its revision. If research is unavailable, state the limit and keep the decision provisional where it matters. Do not install tools, enable connectors, modify dependencies, or run an unreviewed installer merely to research an option. Installation belongs to the authorized implementation and the project's normal dependency process.

Stop when the evidence supports the bounded choice. Carry the selected interface and its constraints into the design; do not append a generic package comparison to every answer.
