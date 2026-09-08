### Investigation

**You own the answer. Plan, route, write.**

Read-only explanations and architectural judgments: "how does X work?", "why was Y built this way?", "do these module boundaries fit?", "should we use design X or Y?". They produce a cited explanation or a recommendation, not a code change.

For a read-only review of code or a diff for correctness, regressions, or requirement compliance, use [Interrogate](../../interrogate/SKILL.md) and stop this playbook. This includes confidence questions about whether a change preserves required behavior.

1. Trace the relevant source and produce the requested explanation or assessment.
   Use How when wider subsystem exploration is needed and Why when historical
   motivation is part of the question.
2. For uncertain diagnoses or consequential recommendations, use
   [investigation evidence](../references/investigation-evidence.md) to distinguish
   plausible explanations and preserve unresolved claims.
3. Follow the user's requested output format. Do not require a throughput marker,
   an additional prose-editing skill, or a fixed report template.

No writes, PR, or babysit for a read-only request. Do not invoke `$deepwright:architect` unless the user asks to continue into a code change. If the investigation suggests a change, report it and wait for authorization before routing to Bug fix or Feature.

**Reply:** the investigation output. For "are we sure?" answers, include your real judgment with reasons. Push back if the premise is wrong (see Autonomy).
