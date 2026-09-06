export function createCatalog(size = 2400) {
  const subjects = ["Cedar", "Harbor", "Orion", "Aster"];
  return Array.from({ length: size }, (_, index) => JSON.stringify({
    id: index + 1,
    title: `${subjects[index % subjects.length]} field guide ${String(index + 1).padStart(4, "0")}`,
    description: `${subjects[index % subjects.length]} observations, maps, and field notes. `.repeat(12),
    tags: [subjects[index % subjects.length].toLowerCase(), "reference", "field"],
    edition: 1 + index % 5,
  }));
}
