export function encodeRow(fields) {
  return fields.filter(Boolean).map((field) => {
    const text = String(field);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",");
}

export function exportRows(rows) {
  return rows.map(encodeRow).join("\n");
}
