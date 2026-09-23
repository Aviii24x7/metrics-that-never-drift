/**
 * A small RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
 * escaped quotes ("") and CRLF/LF line endings. Returns an array of objects
 * keyed by the header row. Sufficient for the legacy-ERP export; no dependency.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const header = rows[0]!;
  const records: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.length === 1 && cells[0] === '') continue; // skip blank line
    const rec: Record<string, string> = {};
    header.forEach((key, idx) => {
      rec[key] = cells[idx] ?? '';
    });
    records.push(rec);
  }
  return records;
}

function parseRows(text: string): string[][] {
  // Strip a leading UTF-8 BOM (Excel/Windows exports), which would otherwise
  // corrupt the first header name and silently reject every row.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let fieldStart = true; // are we at the first character of the current field?
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && fieldStart) {
      // A quote only opens a quoted field at the start of a field; elsewhere it
      // is a literal character (so a stray quote can't swallow later rows).
      inQuotes = true;
      fieldStart = false;
    } else if (c === ',') {
      row.push(field);
      field = '';
      fieldStart = true;
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      fieldStart = true;
    } else if (c === '\r') {
      // handled by the following \n; ignore a lone CR
    } else {
      field += c;
      fieldStart = false;
    }
  }
  // last field/row (no trailing newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
