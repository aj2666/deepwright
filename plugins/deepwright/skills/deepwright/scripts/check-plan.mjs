#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const RULE =
	"Tests alone are not sufficient for behavior-changing work. Every applicable unit, live, and performance block must be checked at the exact head SHA.";
const SUB_BLOCKS = [
	"Depends on.",
	"Files.",
	"Build.",
	"You see.",
	"Verify, unit.",
	"Verify, live.",
	"Verify, performance.",
	"Review gate.",
	"Land or append.",
];
const PROGRAM_H3 = [
	"Authorize and initialize",
	"Assign owners",
	"GitHub mechanics",
	"Verdict and landing",
	"Evidence recipe for each live lane",
];
const PROGRAM_MARKERS = [
	["explicit execution authorization", /explicit (?:go|user|authorization)/i],
	["resolved default branch", /default branch/i],
	["durable run ledger", /\.deepwright\/runs\//],
	["host collaboration capability", /host collaboration/i],
	["GitHub connector or authenticated gh", /GitHub connector[\s\S]*authenticated `?gh`?/i],
	["risk-based independent verification", /risk-based[\s\S]*independent lane/i],
	["exact head SHA", /exact head SHA/i],
	["isolated live-checkout recipe", /isolated (?:worktree|location|checkout)/i],
	["artifact receipts", /artifacts?\//i],
];
const HOW_TO_READ_MARKERS = [
	"One box is one unit of work",
	"Every box names the evidence",
	/Check a box only when (?:the|its) evidence exists/,
  /\bDeepwright\b/i,
	/playbooks\/(?:autopilot-full|autopilot-stack|orchestrate)\.md/,
	RULE,
];
const PERF_ITEMS = ["Metric.", "Probe.", "Baseline.", "Rule."];
const LIVE_LANES = ["Regression lane.", "Primary lane.", "Risk lane."];
const BOX = /^\s*- \[[ x]\] (.*)$/;

const file = process.argv[2];
if (!file) {
	console.error("Usage: node check-plan.mjs <plan.md|->");
	process.exit(2);
}

const label = file === "-" ? "<stdin>" : file;
const raw = fs.readFileSync(file === "-" ? 0 : file, "utf8").split(/\r?\n/);
const problems = [];
const fail = (line, message) => problems.push(`${label}:${line}: ${message}`);
const hasMarker = (text, marker) => marker instanceof RegExp ? marker.test(text) : text.includes(marker);

let start = 0;
if (raw[0] === "---") {
	start = raw.indexOf("---", 1) + 1;
}

const lines = [];
let fence = false;
for (let i = start; i < raw.length; i++) {
	const text = raw[i];
	const n = i + 1;
	if (/^```/.test(text)) fence = !fence;
	lines.push({ n, text, code: fence });
	if (fence) continue;
	const prose = text
		.replace(/`[^`]*`/g, "`")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\]\([^)]*\)/g, "]");
	if (/[\u2013\u2014]/.test(prose)) fail(n, "long dash");
	if (/[\u2018\u2019\u201c\u201d]/.test(prose)) fail(n, "curly quote");
	if (/<(?!https?:\/\/)[^<>]+>/.test(prose)) fail(n, "unfilled placeholder");
	if (/\[[^\]]+\]\(\s*\)/.test(text)) fail(n, "empty Markdown link");
}

const h2 = (l) => (!l.code && l.text.startsWith("## ") ? l.text.slice(3).trim() : null);
const sections = [];
for (const l of lines) {
	const title = h2(l);
	if (title !== null) sections.push({ title, n: l.n, body: [] });
	else if (sections.length) sections.at(-1).body.push(l);
}
const find = (title) => sections.find((s) => s.title === title);
const bodyText = (s) => s.body.map((l) => l.text).join("\n");
const boxes = (ls) => ls.filter((l) => !l.code && BOX.test(l.text)).map((l) => ({ n: l.n, text: l.text.match(BOX)[1] }));

const h1 = lines.findIndex((l) => !l.code && l.text.startsWith("# "));
if (h1 === -1) fail(1, "no H1 title");
const howToRead = find("How to read this");
if (!howToRead) fail(1, 'no "## How to read this" section');
if (h1 !== -1 && howToRead) {
	const intro = lines.slice(h1 + 1).filter((l) => l.n < howToRead.n && l.text.trim() !== "");
	if (intro.length >= 10) fail(lines[h1].n, `intro is ${intro.length} lines, under ten required`);
	for (const marker of HOW_TO_READ_MARKERS) {
		if (!hasMarker(bodyText(howToRead), marker)) fail(howToRead.n, `How to read this lacks "${marker}"`);
	}
	const reading = bodyText(howToRead);
	for (const [label, marker] of [
		["push permissions", /push/i],
		["PR permissions", /\bPRs?\b/i],
		["review permissions", /reviews?/i],
		["branch rewrite permissions", /retarget|rebase/i],
		["merge permissions", /merge/i],
	]) if (!marker.test(reading)) fail(howToRead.n, `How to read this lacks ${label}`);
}

const program = find("Program checklist");
if (!program) fail(1, 'no "## Program checklist" section');
else {
	const h3s = program.body.filter((l) => !l.code && l.text.startsWith("### ")).map((l) => l.text.slice(4).trim());
	let cursor = 0;
	for (const name of PROGRAM_H3) {
		const at = h3s.findIndex((t, i) => i >= cursor && t.startsWith(name));
		if (at === -1) fail(program.n, `Program checklist lacks "### ${name}" in order`);
		else cursor = at + 1;
	}
	for (const [label, marker] of PROGRAM_MARKERS) {
		if (!marker.test(bodyText(program))) fail(program.n, `Program checklist lacks ${label}`);
	}
}

const close = find("Close the program");
if (!close) fail(1, 'no "## Close the program" section');
const programIndex = sections.indexOf(program);
const closeIndex = sections.indexOf(close);
const unitSections = programIndex === -1 || closeIndex === -1 ? [] : sections.slice(programIndex + 1, closeIndex);
if (unitSections.length === 0) fail(1, "no unit sections between Program checklist and Close the program");

const report = [];
for (const pr of unitSections) {
	const heads = [];
	for (const l of pr.body) {
		if (l.code) continue;
		const m = l.text.match(/^\*\*([^*]+)\*\*(.*)$/);
		if (m && SUB_BLOCKS.includes(m[1])) heads.push({ name: m[1], n: l.n, rest: m[2].trim(), lines: [] });
		else if (heads.length) heads.at(-1).lines.push(l);
	}
	const names = heads.map((h) => h.name);
	if (names.join("|") !== SUB_BLOCKS.join("|")) {
		fail(pr.n, `${pr.title}: sub-blocks are [${names.join(", ")}], expected [${SUB_BLOCKS.join(", ")}]`);
	}
	const block = (name) => heads.find((h) => h.name === name);
	const counts = {};
	for (const h of heads) counts[h.name] = boxes(h.lines).length;

	const depends = block("Depends on.");
	if (depends && depends.rest === "") fail(depends.n, `${pr.title}: Depends on names nothing`);
	for (const name of ["Files.", "Build.", "You see.", "Verify, unit.", "Land or append."]) {
		const b = block(name);
		if (b && boxes(b.lines).length === 0) fail(b.n, `${pr.title}: ${name} has no box`);
	}
	for (const name of ["Verify, unit.", "Verify, live.", "Verify, performance."]) {
		const b = block(name);
		if (b && !b.rest.startsWith(RULE)) fail(b.n, `${pr.title}: ${name} does not open with the rule`);
	}

	const live = block("Verify, live.");
	if (live) {
		const lanes = boxes(live.lines);
		const liveText = [live.rest, ...lanes.map((lane) => lane.text)].join("\n");
		const dimensionNotApplicable = /\bn\/a:\s*\S/i.test(liveText);
		if (lanes.length === 0 && !dimensionNotApplicable) fail(live.n, `${pr.title}: Verify, live has no lane or n/a reason`);
		if (!dimensionNotApplicable) {
			for (const label of LIVE_LANES) {
				if (!lanes.some((lane) => lane.text.startsWith(label))) fail(live.n, `${pr.title}: Verify, live lacks "${label}"`);
			}
		}
		for (const lane of lanes) {
			if (/\bn\/a:\s*\S/i.test(lane.text)) continue;
			if (!lane.text.includes("Pass when")) fail(lane.n, `${pr.title}: live lane has no pass predicate`);
			if (!/Save `[^`]+`|\bartifact\b|\bblocked\b|manual evidence/i.test(lane.text)) fail(lane.n, `${pr.title}: live lane names no artifact or blocked evidence path`);
		}
	}

	const perf = block("Verify, performance.");
	if (perf) {
		const perfBoxes = boxes(perf.lines);
		const perfText = [perf.rest, ...perfBoxes.map((item) => item.text)].join("\n");
		if (!/\bn\/a:\s*\S/i.test(perfText)) {
			const items = perfBoxes.map((b) => b.text.split(" ")[0]);
			if (items.join("|") !== PERF_ITEMS.join("|")) fail(perf.n, `${pr.title}: performance boxes are [${items.join(", ")}], expected [${PERF_ITEMS.join(", ")}]`);
		}
	}

	const gate = block("Review gate.");
	if (gate) {
		const gateBoxes = boxes(gate.lines);
		if (/^None:\s*\S/.test(gate.rest)) {
			if (gateBoxes.length) fail(gate.n, `${pr.title}: Review gate says None but has boxes`);
		} else {
			const text = gate.lines.map((l) => l.text).join("\n");
			if (gateBoxes.length === 0) fail(gate.n, `${pr.title}: Review gate has no box`);
			if (!/artifacts?\//i.test(text)) fail(gate.n, `${pr.title}: Review gate names no artifact path`);
			if (!/screenshot|video/i.test(text)) fail(gate.n, `${pr.title}: Review gate names no screenshot or video`);
			if (!/explicit approval/i.test(text)) fail(gate.n, `${pr.title}: Review gate lacks explicit approval`);
		}
	}

	const total = boxes(pr.body).length;
	const cells = SUB_BLOCKS.filter((s) => s !== "Depends on.").map((s) => `${s.replace(/[ ,.]+/g, "-").replace(/-$/, "").toLowerCase()}=${counts[s] ?? 0}`);
	report.push(`${pr.title}  boxes=${total}  ${cells.join(" ")}`);
}

if (closeIndex !== -1) {
	const tail = sections.slice(closeIndex + 1);
	for (const s of tail) {
		if (!s.title.startsWith("Appendix")) fail(s.n, `"## ${s.title}" after Close the program is not an appendix`);
	}
	if (!tail.some((s) => s.title.includes("Prototype evidence"))) fail(close.n, 'no "## Appendix ... Prototype evidence" section');
}

for (const line of report) console.log(line);
console.log(`${unitSections.length} unit section${unitSections.length === 1 ? "" : "s"}, ${problems.length} problems`);
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
