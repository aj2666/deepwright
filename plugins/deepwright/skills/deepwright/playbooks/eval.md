### Eval

**You own the experiment design. Plan, blind, run, synthesize.**

Evals test how a change affects agent behavior before promoting it: a new skill variant, a structural change, a prompt tweak. The failure mode is the observer effect. An agent that knows it's being evaluated behaves differently, so candidates must run blind.

**Non-negotiables for blinding:**

- Keep evaluation meta-labels such as `judge`, `rubric`, `score`, `benchmark`, `candidate`, and `arena` out of evaluation-specific wrapper directories, injected files, and prompts visible to the candidate. Do not rename or remove ordinary project content such as test directories, test commands, or domain terms merely because they overlap with evaluation vocabulary.
- The candidate prompt looks like an organic user request. State the goal, not the meta. "build me a small todo cli" not "show me how you follow the principles chain".
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied; that meta-prompt inflates citation behavior. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick, not labels like `candidate-1` or `agent-a`.
- Don't tell the candidate other candidates exist.
- The judge can know it is judging but sees outputs by sanitized label only, never by provider, model, or author identity.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from. Two judge runs with different prompts don't compare, the calibration drifts.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Run N candidates** per [Arena](../../arena/SKILL.md) Phase B. Use host collaboration tools for parallel, isolated work when available; otherwise run the candidates sequentially in separate sanitized directories. Give each the same prompt and do not require particular models.
5. **Run one blinded judge** per [Arena](../../arena/SKILL.md) Phase C. Prefer a reviewer that did not author any candidate output. The judge sees outputs by sanitized label and the rubric, never a provider, model, or author identity.
6. **Verify from artifacts, not hidden transcripts or self-report.** Grade the files, diffs, test receipts, tool outputs, and other artifacts produced inside the explicitly scoped evaluation directories. Do not search host application data, unrelated conversations, or private transcript stores. If interaction traces are essential, collect them as an explicit evaluation artifact with the user's consent.
7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reproducibility and scoring:** Pin the exact skill revision and record host version, confirmed model, available tools, and repository fixture. Verify each fresh session sees only its intended variant; an installed global plugin or hook can contaminate a baseline. Keep positive, negative, ambiguous, read-only, and capability-missing cases in the same complete batch. Self-test the scorer with known passing and failing observations; reject unknown cases and missing evidence instead of treating them as skipped passes. Keep prompts separate from observer rubrics. The Deepwright development repository includes a small corpus and offline receipt scorer under `evals/` and `scripts/`; these are development resources, not required plugin runtime files.

Pass correctness, authorization, completeness, and real verification before comparing latency, tool calls, or output size. A receipt's asserted labels and evidence references do not themselves prove behavior: inspect the authorized artifacts. Structural tests are not automatic-trigger accuracy, and small synthetic cases are not general cost or productivity benchmarks. Report inconclusive and non-improving results as such.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.
