import { api } from "@/lib/api"
import type { StoreMediaSaved } from "@waypoint/shared"

/** Shrinks a phone photo to a JPEG that fits comfortably in the database (about 100–300 KB). */
async function compress(file: File, maxEdge = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", quality).split(",")[1]
}

/** Uploads one issue photo and returns its media id. */
export async function uploadIssuePhoto(file: File): Promise<string> {
  const data = await compress(file)
  const id = crypto.randomUUID()
  await api<StoreMediaSaved>("/store/media", { method: "POST", json: { id, kind: "PHOTO", mimeType: "image/jpeg", data } })
  return id
}
