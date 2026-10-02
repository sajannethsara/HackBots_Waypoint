/**
 * Tiny IndexedDB layer for the driver app. One database per driver, three stores:
 *  - kv:     the downloaded bundle, readiness stamp and small settings
 *  - outbox: everything waiting to reach the server (events, GPS pings, issues)
 *  - media:  signatures and photos (base64) waiting for upload
 */

export type OutboxKind = "event" | "location" | "issue" | "chat"

export interface OutboxItem {
  id: string
  kind: OutboxKind
  payload: unknown
  createdAt: string
  attempts: number
  /** Set once the server refuses the record for good; shown to the driver. */
  failed?: string
}

export interface MediaItem {
  id: string
  kind: "SIGNATURE" | "PHOTO"
  mimeType: string
  data: string
}

type Store = "kv" | "outbox" | "media"

const handles = new Map<string, Promise<IDBDatabase>>()

function open(userId: string): Promise<IDBDatabase> {
  let h = handles.get(userId)
  if (!h) {
    h = new Promise((resolve, reject) => {
      const req = indexedDB.open(`waypoint-driver-${userId}`, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore("kv")
        db.createObjectStore("outbox", { keyPath: "id" })
        db.createObjectStore("media", { keyPath: "id" })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    handles.set(userId, h)
  }
  return h
}

async function run<T>(userId: string, store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(userId)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const kvGet = <T>(u: string, key: string) => run<T | undefined>(u, "kv", "readonly", (s) => s.get(key))
export const kvSet = (u: string, key: string, value: unknown) => run(u, "kv", "readwrite", (s) => s.put(value, key)).then(() => undefined)
export const kvDelete = (u: string, key: string) => run(u, "kv", "readwrite", (s) => s.delete(key)).then(() => undefined)

export const outboxAll = (u: string) => run<OutboxItem[]>(u, "outbox", "readonly", (s) => s.getAll())
export const outboxPut = (u: string, item: OutboxItem) => run(u, "outbox", "readwrite", (s) => s.put(item)).then(() => undefined)
export const outboxDelete = (u: string, id: string) => run(u, "outbox", "readwrite", (s) => s.delete(id)).then(() => undefined)

export const mediaGet = (u: string, id: string) => run<MediaItem | undefined>(u, "media", "readonly", (s) => s.get(id))
export const mediaPut = (u: string, item: MediaItem) => run(u, "media", "readwrite", (s) => s.put(item)).then(() => undefined)
export const mediaDelete = (u: string, id: string) => run(u, "media", "readwrite", (s) => s.delete(id)).then(() => undefined)

/** Client UUID. `crypto.randomUUID` needs a secure context, so fall back on plain HTTP dev hosts. */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const mediaAll = (u: string) => run<MediaItem[]>(u, "media", "readonly", (s) => s.getAll())
