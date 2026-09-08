#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { exactObject, nonempty, validateCoverage } from "./evidence-coverage.mjs";

const FILE_LIMIT = 8 * 1024 * 1024;
const RECORD_LIMIT = 32 * 1024 * 1024;
const EVENT_LIMIT = 10_000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => JSON.stringify(value);
const digest = (value) => hash(bytes(value));
const inside = (root, target) => {
  const local = relative(root, target);
  return local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local);
};
const timestamp = (value, label) => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be an ISO UTC timestamp with milliseconds`);
  }
};
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}`);
};
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const safePath = (value) => {
  nonempty(value, "evidence path");
  if (isAbsolute(value) || /[\\:\x00-\x1f\x7f]/u.test(value) || value.split("/").some((part) => ["", ".", ".."].includes(part))) {
    throw new Error("evidence paths must be relative workspace paths without traversal");
  }
};

async function regularBytes(file, cap = FILE_LIMIT) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > cap) throw new Error(`expected a regular file of at most ${cap} bytes: ${file}`);
  const body = await readFile(file);
  if (body.length > cap) throw new Error(`file exceeded its byte limit: ${file}`);
  return body;
}

async function jsonFile(file) {
  return JSON.parse((await regularBytes(file)).toString("utf8"));
}

function validateSpec(spec) {
  exactObject(spec, ["schemaVersion", "runId", "task", "scope", "workspace", "maxAttempts", "deadline"], "run specification");
  if (spec.schemaVersion !== 1) throw new Error("run schemaVersion must be 1");
  if (typeof spec.runId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.runId) || spec.runId.length > 100) {
    throw new Error("runId must be a lowercase hyphenated name of at most 100 characters");
  }
  nonempty(spec.task, "task");
  nonempty(spec.scope, "scope");
  nonempty(spec.workspace, "workspace");
  if (!isAbsolute(spec.workspace)) throw new Error("workspace must be an absolute path");
  integer(spec.maxAttempts, 1, 1000, "maxAttempts");
  timestamp(spec.deadline, "deadline");
}

function validateRecord(record) {
  exactObject(record, ["kind", "summary", "coverage", "files"], "record");
  if (!["decision", "checkpoint", "result"].includes(record.kind)) throw new Error("record kind must be decision, checkpoint, or result");
  nonempty(record.summary, "summary");
  validateCoverage(record.coverage);
  if (!Array.isArray(record.files) || record.files.length > 32) throw new Error("files must contain at most 32 selected evidence files");
  const labels = new Set();
  for (const file of record.files) {
    exactObject(file, ["path", "label"], "selected evidence");
    safePath(file.path);
    nonempty(file.label, "evidence label");
    if (labels.has(file.label)) throw new Error("evidence labels must be unique within a record");
    labels.add(file.label);
  }
}

function envelope(body, previous) {
  return { ...body, previous, sha256: digest({ ...body, previous }) };
}

function verifyEnvelope(value, keys, previous, label) {
  exactObject(value, [...keys, "previous", "sha256"], label);
  const { sha256, ...body } = value;
  if (value.previous !== previous || !sha(sha256) || digest(body) !== sha256) throw new Error(`${label} failed its hash-chain check`);
}

async function atomicBytes(file, body) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, body, { flag: "wx", mode: 0o600 });
    await link(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

async function advanceHead(root, event) {
  const target = join(root, "head.json");
  const temp = join(root, `.head-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, `${bytes({ sequence: event.sequence, sha256: event.sha256 })}\n`, { flag: "wx", mode: 0o600 });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function initialize(directory, spec, now = new Date()) {
  validateSpec(spec);
  if (Date.parse(spec.deadline) <= now.getTime()) throw new Error("deadline must be in the future when a run starts");
  const workspace = await realpath(spec.workspace);
  if (!(await lstat(workspace)).isDirectory()) throw new Error("workspace must be a directory");
  const manifest = envelope({ schemaVersion: 1, createdAt: now.toISOString(), spec: { ...spec, workspace } }, null);
  const target = resolve(directory);
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target, { mode: 0o700 });
  try {
    await mkdir(join(target, "events"), { mode: 0o700 });
    await mkdir(join(target, "artifacts"), { mode: 0o700 });
    await writeFile(join(target, "run.json"), `${bytes(manifest)}\n`, { flag: "wx", mode: 0o600 });
    await writeFile(join(target, "head.json"), `${bytes({ sequence: 0, sha256: manifest.sha256 })}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  return status(directory, now);
}

async function runDirectory(directory) {
  const root = await realpath(directory);
  for (const name of ["events", "artifacts"]) {
    if (!(await lstat(join(root, name))).isDirectory()) throw new Error(`${name} must be a real directory`);
  }
  return root;
}

async function readRun(directory) {
  const root = await runDirectory(directory);
  const manifest = await jsonFile(join(root, "run.json"));
  verifyEnvelope(manifest, ["schemaVersion", "createdAt", "spec"], null, "run manifest");
  if (manifest.schemaVersion !== 1) throw new Error("unknown manifest schemaVersion");
  timestamp(manifest.createdAt, "createdAt");
  validateSpec(manifest.spec);
  if (Date.parse(manifest.spec.deadline) <= Date.parse(manifest.createdAt)) throw new Error("run deadline does not follow its start");
  const names = (await readdir(join(root, "events"))).sort();
  if (names.length > EVENT_LIMIT) throw new Error("event count exceeds the run limit");
  const head = await jsonFile(join(root, "head.json"));
  exactObject(head, ["sequence", "sha256"], "committed head");
  integer(head.sequence, 0, EVENT_LIMIT, "head sequence");
  if (!sha(head.sha256) || names.length !== head.sequence) throw new Error("run events do not match the committed head: an event is missing or publication was interrupted");
  const events = [];
  let previous = manifest.sha256;
  let attempts = 0;
  let lastTime = manifest.createdAt;
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index + 1).padStart(6, "0")}.json`) throw new Error("run events are missing, out of order, or include an unfinished write");
    const event = await jsonFile(join(root, "events", name));
    verifyEnvelope(event, ["sequence", "at", "kind", "payload"], previous, `event ${index + 1}`);
    if (event.sequence !== index + 1) throw new Error("event sequence does not match its filename");
    timestamp(event.at, "event timestamp");
    if (event.at < lastTime) throw new Error("event timestamps move backwards");
    if (event.kind === "attempt") {
      exactObject(event.payload, ["attempt"], "attempt");
      attempts += 1;
      if (event.payload.attempt !== attempts || attempts > manifest.spec.maxAttempts || event.at >= manifest.spec.deadline) {
        throw new Error("recorded attempt exceeds the run allowance");
      }
    } else if (["decision", "checkpoint", "result"].includes(event.kind)) {
      exactObject(event.payload, ["summary", "coverage", "files"], "stored record");
      const files = event.payload.files;
      if (!Array.isArray(files) || files.length > 32) throw new Error("invalid stored files");
      validateRecord({ kind: event.kind, ...event.payload, files: files.map((file) => ({ path: file.path, label: file.label })) });
      let total = 0;
      for (const file of files) {
        exactObject(file, ["path", "label", "sha256", "bytes"], "stored evidence");
        if (!sha(file.sha256)) throw new Error("invalid evidence hash");
        integer(file.bytes, 0, FILE_LIMIT, "evidence byte count");
        total += file.bytes;
        if (total > RECORD_LIMIT) throw new Error("stored evidence exceeds the record byte limit");
        const body = await regularBytes(join(root, "artifacts", file.sha256));
        if (body.length !== file.bytes || hash(body) !== file.sha256) throw new Error("stored evidence bytes changed");
      }
    } else throw new Error("unknown run event kind");
    events.push(event);
    previous = event.sha256;
    lastTime = event.at;
  }
  if (head.sha256 !== previous) throw new Error("run history does not match the committed head hash");
  return { root, manifest, events, attempts, previous, lastTime };
}

function stateOf(run, now) {
  const { spec } = run.manifest;
  const reasons = [];
  if (run.attempts >= spec.maxAttempts) reasons.push("attempt allowance exhausted");
  if (run.events.length >= EVENT_LIMIT) reasons.push("event limit reached");
  if (now.getTime() >= Date.parse(spec.deadline)) reasons.push("deadline reached");
  if (now.toISOString() < run.lastTime) reasons.push("clock moved backwards");
  return {
    schemaVersion: 1, runId: spec.runId, task: spec.task, scope: spec.scope,
    workspace: spec.workspace, startedAt: run.manifest.createdAt, deadline: spec.deadline,
    maxAttempts: spec.maxAttempts, consumedAttempts: run.attempts,
    remainingAttempts: spec.maxAttempts - run.attempts,
    nextAttemptAllowed: reasons.length === 0, reasons,
    records: run.events.filter((event) => event.kind !== "attempt"),
    integrity: "verified", checkedAt: now.toISOString(),
    limitation: "Verifies recorded bytes and declared attempt allowance only. Records are unsigned; they do not prove agent behavior, current workspace state, permission, or host token/cost usage.",
  };
}

export async function status(directory, now) {
  const run = await readRun(directory);
  return stateOf(run, now ?? new Date());
}

async function locked(directory, operation) {
  const root = await runDirectory(directory);
  const lock = join(root, ".write-lock");
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("run is locked by another writer; a stopped writer's lock requires explicit recovery after confirming it is no longer active");
    throw error;
  }
  try { return await operation(root); }
  finally { await rm(lock, { recursive: true }); }
}

function pendingEvent(run, kind, payload, now) {
  if (run.events.length >= EVENT_LIMIT) throw new Error("event limit reached");
  const at = now.toISOString();
  if (at < run.lastTime) throw new Error("clock moved backwards; refusing to reorder run history");
  const sequence = run.events.length + 1;
  const event = envelope({ sequence, at, kind, payload }, run.previous);
  if (Buffer.byteLength(`${bytes(event)}\n`) > FILE_LIMIT) throw new Error("encoded record exceeds the 8 MiB event limit");
  return event;
}

async function publishEvent(run, event) {
  await atomicBytes(join(run.root, "events", `${String(event.sequence).padStart(6, "0")}.json`), `${bytes(event)}\n`);
  await advanceHead(run.root, event);
  return event;
}

export async function claimAttempt(directory, now) {
  return locked(directory, async () => {
    const run = await readRun(directory);
    const at = now ?? new Date();
    const state = stateOf(run, at);
    if (!state.nextAttemptAllowed) throw new Error(state.reasons.join("; "));
    return publishEvent(run, pendingEvent(run, "attempt", { attempt: run.attempts + 1 }, at));
  });
}

export async function recordEvidence(directory, record, now) {
  validateRecord(record);
  return locked(directory, async () => {
    const run = await readRun(directory);
    const workspace = record.files.length ? await realpath(run.manifest.spec.workspace) : null;
    if (workspace !== null && workspace !== run.manifest.spec.workspace) throw new Error("workspace identity changed");
    const selected = [];
    let total = 0;
    for (const file of record.files) {
      const filePath = await realpath(join(workspace, file.path));
      if (!inside(workspace, filePath) || inside(run.root, filePath)) throw new Error("selected evidence must stay inside the workspace and outside the run record directory");
      const body = await regularBytes(filePath);
      total += body.length;
      if (total > RECORD_LIMIT) throw new Error("selected evidence exceeds 32 MiB per record");
      selected.push({ file, body, sha256: hash(body) });
    }
    const event = pendingEvent(run, record.kind, {
      summary: record.summary, coverage: record.coverage,
      files: selected.map(({ file, body, sha256 }) => ({ ...file, sha256, bytes: body.length })),
    }, now ?? new Date());
    for (const entry of selected) {
      const target = join(run.root, "artifacts", entry.sha256);
      try { await atomicBytes(target, entry.body); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (hash(await regularBytes(target)) !== entry.sha256) throw new Error("existing evidence snapshot is corrupt");
      }
    }
    return publishEvent(run, event);
  });
}

const HELP = `Usage: node run-evidence.mjs <command> <run-directory> [input.json]
  init    <new-directory> <spec.json>    create a run with a fixed attempt allowance and deadline
  claim   <directory>                   record one attempt before starting it
  record  <directory> <record.json>      preserve a scoped decision, checkpoint, or result
  status  <directory>                   verify historical records and show remaining allowance
No command launches agents, runs evidence, changes host limits, or grants permission.
status is read-only; other commands write only the selected run directory (init may create its parents).
Exit: 0 success, 1 refused/invalid/unavailable.\n`;

export async function main(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    const [command, directory, input] = argv;
    const takesInput = ["init", "record"].includes(command);
    if (!["init", "claim", "record", "status"].includes(command) || argv.length !== (takesInput ? 3 : 2) || !directory) throw new Error(HELP);
    const result = command === "init" ? await initialize(directory, await jsonFile(input))
      : command === "record" ? await recordEvidence(directory, await jsonFile(input))
      : command === "claim" ? await claimAttempt(directory)
      : await status(directory);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: error.message }));
    return 1;
  }
}

async function isMain() {
  const entry = process.argv[1];
  if (!entry || entry === "-") return false;
  // Eval/print arguments are caller data, even when they name this module.
  if (process.execArgv.some((argument) => /^-[ep]/.test(argument) ||
      /^(?:--eval|--print)(?:=|$)/.test(argument))) return false;
  const modulePath = fileURLToPath(import.meta.url);
  if (resolve(entry) === modulePath) return true;
  let entryPath;
  try { entryPath = await realpath(entry); }
  catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
  return entryPath === await realpath(modulePath);
}

if (await isMain()) process.exitCode = await main(process.argv.slice(2));
