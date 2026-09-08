# Workflow discovery benchmark

This observer-owned corpus measures suggestions returned from canonical skill and
playbook metadata. It does not launch an agent or execute a selected workflow.
Keep this directory and its reports outside candidate task contexts when running
behavioral evaluations. The existing 39-case workflow evaluation and its receipt
schema remain separate and unchanged.

`queries.json` has 16 tuning and 16 heldout queries. Each split includes ordinary
requests, exact identifiers, ambiguous requests with acceptable alternatives,
and irrelevant inputs that should return no suggestions. Labels were chosen
from workflow purposes before inspecting the new ranker's results. The initial
corpus byte fingerprint is:

```text
983cb55a20af8badb29d056b898166efbe536d462596ea6025a352f8848b41f9
```

The heldout split was withheld from the ranker author until the algorithm was
fixed. That is a coordination procedure, not filesystem isolation or proof of
independence. Once disclosed, these queries are regression cases; use a fresh
undisclosed split for a subsequent claim about generalization. Do not change
labels or thresholds to match observed rankings.

## Run

Use Node 20.19 or newer and the committed Deepwright CLI bundle. If changing the
CLI source, build the bundle before measuring the candidate. The benchmark is
print-only; shell redirection saves an explicitly chosen report.

```sh
node --test scripts/benchmark-discovery.test.mjs
node scripts/benchmark-discovery.mjs --split tuning
node scripts/benchmark-discovery.mjs --iterations 50
```

To isolate algorithm changes from metadata changes, pass an immutable plugin
checkout. The current ranker and both comparators receive one shared metadata
snapshot loaded through that checkout's `skills --json` and `playbooks --json`
commands. These listing commands do not start workflows.

```sh
node scripts/benchmark-discovery.mjs --plugin-root /absolute/baseline/plugins/deepwright --iterations 50
```

`--corpus PATH` selects another complete corpus. `--freeze PATH` optionally
verifies a previously saved observer receipt containing `corpusSha256` and
`heldoutSha256`. The latter hashes `JSON.stringify(corpus.cases.filter(entry =>
entry.split === "heldout"))` as UTF-8. The receipt may include `createdAt` for
provenance; its timestamp does not establish blinding. Missing freeze evidence
is reported as `null`, never as verified.

The report embeds the shared metadata snapshot and identifies Node, corpus,
observer, ranker, CLI and normalized metadata fingerprints. Metadata paths are
relative to the canonical plugin root, which is
reported separately. Capture exact source revisions and relevant uncommitted
changes alongside these fingerprints when preserving an experiment.

Exit codes are `0` when the observed heldout gates pass, `1` when a gate fails or
heldout was not run, and `2` for invalid input or an unavailable capability.
Tuning-only output therefore exits `1` and explicitly marks heldout ineligible.
Failures remain visible in JSON; an output file existing is not a passing result.

## Comparators and measurements

All algorithms receive exactly the same metadata arrays and a maximum of three
results **per bucket**, allowing up to three skills and three playbooks:

- `literal` reproduces the existing case-insensitive, all-term substring filter,
  preserving canonical catalog order, then applies the common result limit.
- `lexical` counts distinct overlapping terms using the same tokenizer and
  metadata projection as BM25. Exact slugs or qualified invocations take
  priority; other ties use canonical name order. It uses no BM25 or corpus IDF.
- `bm25` calls the production `rankEntries` export. It retains its exact-name and
  display-name policies. The comparison therefore tests the complete ranking
  policies, not the BM25 score in isolation.

`hitRateAt3` counts positive queries with at least one acceptable result in the
first three of its corresponding bucket. `meanRelevantRecallAt3` averages the
fraction of labeled alternatives retrieved for each positive query. These are
different denominators. Labels are acceptable suggestions, not an exhaustive
relevance judgment, so the report does not invent a precision score. Irrelevant
inputs and exact-ID first-position success have their own denominators.

`returnedBytes` measures the UTF-8 length of a compact JSON object containing the
selected canonical metadata, with scores and match annotations removed equally
for every algorithm. It includes repeated metadata on separate queries. It is
neither actual CLI wire output size nor model input tokens. Empty results are
smaller but cannot count as useful savings when a relevant workflow was missed.

`rankingLatencyMs` measures the two synchronous rank calls for each query, after
five warmups by default. It excludes catalog loading, process startup,
serialization, validation, and agent work. Samples repeat within one process;
algorithm order is literal, lexical, then BM25. CPU contention and timing order
can affect small differences. Catalog loading time is reported separately.

The accepted heldout gate requires at least 90% positive query hit@3, exact
identifiers first, empty results for irrelevant inputs, and no new per-query
pass/fail regression against either comparator. A shared miss by every comparator
still counts against the absolute 90% requirement.
Aggregate improvement cannot hide an individual regression. Passing these small
selection gates does not automatically authorize promotion, prove a meaningful
advantage over lexical overlap, or establish better automatic triggering.

## Controls

The self-tests exercise a passing reference selector and poor selectors that
return everything or abstain from everything. They reject malformed or
incomplete corpora, unknown labels, duplicate queries, fabricated metadata,
excess results, unstable results, mutations, and changed freeze fingerprints.
They keep tuning-only coverage visibly incomplete and check that metadata text
is treated as data. The tests validate this observer, not agent behavior.
