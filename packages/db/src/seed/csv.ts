import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseCsv } from "@waypoint/shared"

/** Competition CSVs live in /data at the repo root (or DATA_DIR). */
export function dataDir(): string {
  const candidates = [
    process.env.DATA_DIR,
    resolve(__dirname, "../../../../data"),
    resolve(process.cwd(), "data"),
    resolve(process.cwd(), "../../data"),
  ].filter(Boolean) as string[]
  const found = candidates.map((c) => resolve(c)).find((c) => existsSync(join(c, "General Data")))
  if (!found) throw new Error(`Dataset folder not found. Tried: ${candidates.join(", ")}`)
  return found
}

export function readCsv(relPath: string) {
  return parseCsv(readFileSync(join(dataDir(), relPath), "utf8"))
}

/** Deterministic PRNG so every fresh install seeds the same demo data. */
export function rng(seedText: string) {
  let h = 2166136261
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
