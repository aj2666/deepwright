import type { SearchEntry } from "./workbench.ts";

export const MAX_QUERY_BYTES: number;
export interface RankedEntry {
  readonly score: number;
  readonly matchedTerms: readonly string[];
}
export function searchTerms(text: string): readonly string[];
export function searchDocument(entry: SearchEntry): readonly string[];
export function validateSearch(query: string, limit?: number): void;
export function rankEntries<T extends SearchEntry>(entries: readonly T[], query: string, limit?: number): readonly (T & RankedEntry)[];
