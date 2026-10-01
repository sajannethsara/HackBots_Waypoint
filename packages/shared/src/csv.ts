/** Minimal RFC-4180 CSV parser (handles quotes). Returns rows keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "")
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])))
}

/** "rear_dock" -> "REAR_DOCK", "Fresh" -> "FRESH" */
export const toEnum = <T extends string>(s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_") as T

/** "Peliyagoda" -> "PELIYAGODA" */
export const depotId = (name: string) => name.trim().toUpperCase().replace(/\s+/g, "_")
