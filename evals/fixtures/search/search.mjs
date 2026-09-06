export function createSearch(serializedRecords) {
  const records = [...serializedRecords];
  return (query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return { results: [], total: 0 };
    const results = records.map((record) => JSON.parse(record))
      .filter((record) => record.title.toLowerCase().includes(needle))
      .map(({ id, title }) => ({ id, title }));
    return { results, total: results.length };
  };
}
