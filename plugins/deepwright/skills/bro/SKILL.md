---
name: bro
description: "Use when the last answer needs a plain-language restatement; preserve its facts, caveats, and next action."
license: MIT
disable-model-invocation: true
---

# Bro

## Purpose

Make the last assistant answer easier to understand, like one human talking to another. This is a wording pass, not a request to resume the work.

## Instructions

1. Use the last substantive assistant answer, or the passage the user explicitly selected.
2. Lead with its main point. Replace jargon with familiar words and keep only the detail needed to understand the result or next action.
3. Preserve numbers, exact commands or file names the user needs, and whether work is proposed, completed, tested, or uncertain.
4. Return the rewritten answer itself. Avoid a preamble, a rewrite report, forced slang, or a patronizing tone.

## Examples

Original answer:

```text
The implementation is locally validated, but end-to-end qualification remains outstanding and the branch has not been pushed.
```

Rewrite:

```text
The local checks passed. We still need to test the full user flow and upload the changes.
```

The rewrite keeps the difference between local checks and a complete test. It does not claim the work is finished.

## Prerequisites

The only prerequisite is the text to restate; no tools or repository access are needed.

## Limitations

Simplification must not turn "likely" into "proven", or "tested locally" into "ready to ship". Keep the qualifier in familiar words even when removing it would make the sentence shorter.

## Troubleshooting

If no earlier answer or selected passage is available, ask for that text instead of inventing it. If the source contains an apparent error, do not silently change its factual claim. Flag the uncertainty briefly while keeping the answer simple.
