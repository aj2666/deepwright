#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, validName } from '../plugins/deepwright/skills/deepwright/scripts/discovery/metadata.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const limitation = 'Content changes select review scope, not quality or usage. Dependencies cover local Markdown links and explicit Deepwright invocations; dynamic references require manual review. No files are edited.';
function check(value, message) { if (!value) throw new Error(message); }
function exact(value, keys) {
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), 'Invalid snapshot fields');
}
export function validateSnapshot(value) {
  exact(value, ['schemaVersion', 'skills']);
  check(value.schemaVersion === 1 && Array.isArray(value.skills) && value.skills.length > 0 && value.skills.length <= 1000, 'Invalid snapshot version or catalog');
  const names = new Set();
  for (const skill of value.skills) {
    exact(skill, ['name', 'sha256', 'dependencies']);
    check(typeof skill.name === 'string' && validName(skill.name) && !names.has(skill.name), 'Invalid or duplicate skill name');
    names.add(skill.name);
    check(typeof skill.sha256 === 'string' && /^[a-f0-9]{64}$/.test(skill.sha256), 'Invalid content fingerprint');
    check(Array.isArray(skill.dependencies) && skill.dependencies.length <= 1000 && skill.dependencies.every((name) => typeof name === 'string' && validName(name)) && new Set(skill.dependencies).size === skill.dependencies.length && !skill.dependencies.includes(skill.name), 'Invalid dependencies');
  }
  return value;
}
export async function stocktake(pluginRoot) {
  const catalog = await loadCatalog(pluginRoot);
  const root = await realpath(path.join(pluginRoot, 'skills'));
  let bytes = 0, count = 0;
  const skills = [];
  for (const skill of catalog) {
    const files = [], dependencies = new Set();
    async function walk(directory) {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
        // Installed dependencies and Git administration are outside the maintained catalog.
        if (['node_modules', '.git'].includes(entry.name)) continue;
        check(!entry.isSymbolicLink(), 'Catalog files must not be symlinks');
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(filename); continue; }
        check(entry.isFile(), 'Catalog requires regular files');
        const stat = await lstat(filename);
        bytes += stat.size; count++;
        check(bytes <= 64 * 1024 * 1024 && count <= 10000, 'Catalog exceeds file or byte limit');
        const body = await readFile(filename);
        check(body.length === stat.size, 'Catalog changed while reading');
        files.push([path.relative(path.join(root, skill.name), filename).split(path.sep).join('/'), hash(body)]);
        if (filename.endsWith('.md')) {
          const text = body.toString('utf8');
          for (const match of text.matchAll(/\$deepwright:([a-z0-9]+(?:-[a-z0-9]+)*)/g)) dependencies.add(match[1]);
          const links = [...text.matchAll(/\]\(\s*(?:<([^>\n]+)>|([^\s)]+))/g),
            ...text.matchAll(/^[ \t]{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|([^\s]+))/gm)];
          for (const match of links) {
            let link = (match[1] ?? match[2]).split(/[?#]/)[0];
            try { link = decodeURIComponent(link); } catch { continue; }
            if (!link || /^[a-z]+:/i.test(link)) continue;
            const relative = path.relative(root, path.resolve(path.dirname(filename), link));
            if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)) {
              const owner = relative.split(path.sep)[0];
              if (validName(owner)) dependencies.add(owner);
            }
          }
        }
      }
    }
    await walk(path.join(root, skill.name));
    dependencies.delete(skill.name);
    skills.push({ name: skill.name, sha256: hash(JSON.stringify(files)), dependencies: [...dependencies].sort() });
  }
  return validateSnapshot({ schemaVersion: 1, skills });
}
export function compareStocktakes(before, after) {
  validateSnapshot(before); validateSnapshot(after);
  const left = new Map(before.skills.map((skill) => [skill.name, skill]));
  const right = new Map(after.skills.map((skill) => [skill.name, skill]));
  const added = [...right.keys()].filter((name) => !left.has(name)).sort();
  const removed = [...left.keys()].filter((name) => !right.has(name)).sort();
  const changed = [...right.keys()].filter((name) => left.has(name) && (left.get(name).sha256 !== right.get(name).sha256 || JSON.stringify([...left.get(name).dependencies].sort()) !== JSON.stringify([...right.get(name).dependencies].sort()))).sort();
  const affected = new Set([...added, ...removed, ...changed]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const skill of [...before.skills, ...after.skills]) {
      if (!affected.has(skill.name) && skill.dependencies.some((name) => affected.has(name))) { affected.add(skill.name); expanded = true; }
    }
  }
  const direct = new Set([...added, ...changed]);
  return { schemaVersion: 1, added, removed, changed, dependents: [...affected].filter((name) => right.has(name) && !direct.has(name)).sort(), limitation };
}
async function readSnapshot(filename) {
  const stat = await lstat(filename);
  check(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Snapshot must be a regular file under 8 MiB');
  return JSON.parse(await readFile(filename, 'utf8'));
}
async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node scripts/skill-stocktake.mjs snapshot [plugin-root]\n       node scripts/skill-stocktake.mjs compare <before.json> <after.json>\nPrint-only. Snapshot maintained skill files except .git and node_modules. Save output outside the catalog.\n' + limitation);
    return;
  }
  try {
    let report;
    if (args[0] === 'snapshot' && args.length <= 2) report = await stocktake(args[1] ?? fileURLToPath(new URL('../plugins/deepwright', import.meta.url)));
    else if (args[0] === 'compare' && args.length === 3) report = compareStocktakes(await readSnapshot(args[1]), await readSnapshot(args[2]));
    else throw new Error('Invalid arguments; use --help');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.log(JSON.stringify({ schemaVersion: 1, error: error.message })); process.exitCode = 2; }
}
if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
