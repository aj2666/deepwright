import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry || entry === "-") return false;
  // With --eval/--print, argv[1] is user data, even if it names this module.
  if (process.execArgv.some((argument) => /^-[ep]/.test(argument) ||
      /^(?:--eval|--print)(?:=|$)/.test(argument))) return false;
  const modulePath = fileURLToPath(moduleUrl);
  if (resolve(entry) === modulePath) return true;

  let entryPath;
  try {
    entryPath = await realpath(entry);
  } catch (error) {
    // An eval/import caller may pass a data argument instead of an entry file.
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
  return entryPath === await realpath(modulePath);
}
