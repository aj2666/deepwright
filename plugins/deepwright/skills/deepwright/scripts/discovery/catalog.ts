import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export { loadCatalog, validName, type Skill } from "./metadata.mjs";

export function defaultPluginRoot(): string {
  // Source discovery/ and installed dist/ occupy the same directory depth.
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export function terminalText(value: string): string {
  return value
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/gu, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, " ")
    .trim();
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => "\\u" + character.codePointAt(0)!.toString(16).padStart(4, "0"),
  ) + "\n";
}
