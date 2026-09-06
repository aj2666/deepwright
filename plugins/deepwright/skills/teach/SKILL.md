---
name: teach
description: "Explain code, a change, or a subsystem in plain language, connecting its mechanics to evidence-backed rationale. Use for $deepwright:teach."
license: MIT
---

# Teach

## Purpose

Explain what a thing is, how it works, and why it is built that way at the person's pace. The goal is understanding. Teaching alone does not authorize a code change.

## Instructions

### Find the question and evidence

Choose what the reader should understand from why they are asking: reviewing a change, debugging behavior, preparing an edit, or learning a subsystem. Infer their starting point from the conversation and skip what they plainly already know. Ask for a file, diff, or topic only when the referent cannot be identified.

Use `$deepwright:how` for mechanics and `$deepwright:why` for rationale when those skills are available. Read the code to get oriented and use the needed skill or skills. Both may help with a subsystem; one may be enough for a small change. Independent research may run in parallel when it saves time, but a one-line question does not need delegation. Keep rationale research within the evidence sources the user authorized.

Preserve confidence language from `$deepwright:why`. A reason inferred from code remains an inference. Neither a passing test nor a plausible design story proves the author's intent.

### Explain one idea at a time

Start with a plain definition and tie it to the case in front of the reader: "A cursor marks a position in a result set. Here, the next request sends the last row's position to fetch the following page."

Explain what happens as the person uses the feature when that makes the mechanism clear. State the problem each relevant part solves. A list of functions and constants is reference material, not an explanation.

Give the smallest complete answer first, usually a sentence or two. In an interactive conversation, let the reader request the next layer. If the user asks for a full walkthrough or the task is one-shot, provide the requested depth in short connected sections rather than stopping before the question is answered.

Keep it a conversation. No quizzes, requests to repeat the explanation, or pacing labels such as "Pause", "the key insight", or "the tricky part". When a natural pause is useful, stop and let the reader respond.

### Add visuals when they clarify

Open the relevant diff or code when the host supports that action and seeing it helps. Use a diagram when it explains relationships faster than prose. A single simple point needs no figure.

For a diagram with several moving parts, introduce them in small stages when a single picture would overload the reader. Redraw the previous picture and add the next meaningful piece, rather than presenting a crowded diagram at the end. Each stage should teach something new.

Use Mermaid when the host renders it. Otherwise use a compact code-native SVG, a structured text diagram, or layered prose. For spatial ideas such as layout, overlap, or scroll position, a before-and-after picture may help. Use image generation only when available and useful; keep labels short. An unavailable image tool is not a blocker for an explanation.

### Finish in plain language

Apply `$deepwright:unslop` when available, or edit directly for the same plain spoken style. Cut filler while keeping the part that makes the mechanism understandable. Use sentence case, precise verbs, and one consistent name for each concept.

Return the explanation itself, not a report of the research or skills used. Lead with the main point and add the evidence or caveat needed to assess it. Include code pointers where they help the reader follow the explanation.

## Examples

Given this illustrative function:

```ts
async function page(after: string | undefined) {
  return db.rows({ after, limit: 20 });
}
```

For "teach me this function", begin: "This function asks the database for up to 20 rows after a given position. The caller supplies that position through `after`, which can also be undefined."

To explain why cursors were chosen over offsets, inspect the available design evidence. Without that evidence, label likely benefits as inference rather than saying that performance was the author's reason. Avoid a diagram unless the reader asks how positions move between requests.

## Prerequisites

Use the supplied code, diff, or accessible source needed to answer the question. No execution is required for a source explanation.

## Troubleshooting

If a referenced skill or source is unavailable, explain the mechanics visible in the provided material and identify the missing evidence. If validation fails to support an assumed behavior, correct the explanation rather than smoothing over the error.

## Limitations

Do not run a program or debugger with side effects solely to teach its behavior without authorization. Do not fabricate a file location, benchmark, design decision, or test result to make the account feel complete.
