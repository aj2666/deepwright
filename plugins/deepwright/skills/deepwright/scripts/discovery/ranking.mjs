export const MAX_QUERY_BYTES = 4096;

const stopWords = new Set((
  "a an and are as at be been being by can could do does for from had has have " +
  "i in into is it its me my of on or our please so than that the their them there " +
  "these they this those to us use was we were what when which who will with would " +
  "you your deepwright"
).split(" "));

function inflection(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(?:sses|shes|ches|xes|zes)$/u.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/u.test(word)) return word.slice(0, -1);
  return word;
}

export function searchTerms(text) {
  return (text.normalize("NFKC").replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => !stopWords.has(word))
    .map(inflection);
}

export function searchDocument(entry) {
  const name = searchTerms(entry.name);
  const display = searchTerms(entry.displayName ?? "");
  return [...name, ...name, ...name, ...display, ...display, ...searchTerms(entry.description)];
}

export function validateSearch(query, limit = 3) {
  if (typeof query !== "string" || Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
    throw new RangeError("find query must be a string of at most " + MAX_QUERY_BYTES + " UTF-8 bytes");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw new RangeError("limit must be an integer from 1 to 10");
  }
}

export function rankEntries(entries, query, limit = 3) {
  validateSearch(query, limit);
  const terms = [...new Set(searchTerms(query))];
  const exactQuery = query.normalize("NFKC").trim().toLowerCase().replace(/^\$?deepwright:/u, "");
  if (exactQuery.length === 0 || entries.length === 0) return [];
  const documents = entries.map((entry) => {
    const tokens = searchDocument(entry);
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { entry, counts, length: tokens.length };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const frequencies = new Map(terms.map((term) => [term, documents.filter((document) => document.counts.has(term)).length]));
  const hits = documents.flatMap(({ entry, counts, length }) => {
    const exact = entry.name.normalize("NFKC").toLowerCase() === exactQuery ? 2
      : (entry.displayName ?? "").normalize("NFKC").toLowerCase() === exactQuery ? 1 : 0;
    const matchedTerms = terms.filter((term) => counts.has(term));
    if (!exact && matchedTerms.length === 0) return [];
    const score = matchedTerms.reduce((sum, term) => {
      const frequency = counts.get(term);
      const documentFrequency = frequencies.get(term);
      const inverseFrequency = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      return sum + inverseFrequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / averageLength));
    }, 0);
    return [{ entry, exact, matchedTerms, score }];
  });
  const exactBoost = Math.max(0, ...hits.map((hit) => hit.score)) + 1;
  return hits.map(({ entry, exact, score, matchedTerms }) => ({
    ...entry, score: score + exact * exactBoost, matchedTerms,
  })).sort((left, right) => right.score - left.score || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)).slice(0, limit);
}
