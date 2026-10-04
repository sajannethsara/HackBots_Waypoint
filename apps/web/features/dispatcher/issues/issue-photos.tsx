"use client"

import { useState } from "react"
import { Camera, ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, Maximize2 } from "lucide-react"
import { ROLE_LABEL, type Role } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fmtDateTime } from "@/lib/format"
import type { IssueDetail, IssuePhotoAsset } from "@/lib/types"
import { cn } from "@/lib/utils"

const SYSTEM_EMAIL = "system@waypoint.lk"
const src = (p: IssuePhotoAsset) => `/api/media/${p.id}`
const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg")

/** The photos the reporter sent with the issue: thumbnails here, full size in a viewer. */
export function IssuePhotos({ issue }: { issue: IssueDetail }) {
  const photos = issue.photos ?? []
  const [open, setOpen] = useState<number | null>(null)
  const [broken, setBroken] = useState<Set<string>>(() => new Set())
  const markBroken = (id: string) => setBroken((s) => new Set(s).add(id))

  // Raised by live monitoring: nobody could have attached a photo, so there is nothing to show.
  if (!photos.length && issue.reportedBy.email === SYSTEM_EMAIL) return null
  const reporter = `${issue.reportedBy.name} (${ROLE_LABEL[issue.reportedBy.role as Role] ?? issue.reportedBy.role})`

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="size-4 text-muted-foreground" /> Photo evidence
          {photos.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"} from {issue.reportedBy.name}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!photos.length ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm">
            <ImageOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="grid gap-0.5">
              <p className="font-medium">No photos attached</p>
              <p className="text-xs text-muted-foreground">{reporter} did not send any photos with this issue. If you need to see it, ask in the issue chat.</p>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`View photo ${i + 1} of ${photos.length}`}
                >
                  {broken.has(p.id) ? (
                    <PhotoUnavailable />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API behind the session cookie
                    <img src={src(p)} alt={`Photo ${i + 1} attached to ${issue.ref}`} loading="lazy" onError={() => markBroken(p.id)} className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{i + 1}</span>
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                    <Maximize2 className="size-5 text-white drop-shadow" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {photos.length > 0 && (
        <PhotoViewer issue={issue} photos={photos} reporter={reporter} index={open} broken={broken} onBroken={markBroken} onIndex={setOpen} />
      )}
    </Card>
  )
}

function PhotoViewer({
  issue,
  photos,
  reporter,
  index,
  broken,
  onBroken,
  onIndex,
}: {
  issue: IssueDetail
  photos: IssuePhotoAsset[]
  reporter: string
  index: number | null
  broken: Set<string>
  onBroken: (id: string) => void
  onIndex: (i: number | null) => void
}) {
  const p = index == null ? null : photos[index]
  const many = photos.length > 1
  const go = (step: number) => index != null && onIndex((index + step + photos.length) % photos.length)

  return (
    <Dialog open={p != null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent
        className="gap-3 p-3 sm:max-w-3xl"
        onKeyDown={(e) => {
          if (!many) return
          if (e.key === "ArrowRight") go(1)
          if (e.key === "ArrowLeft") go(-1)
        }}
      >
        {p && index != null && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle>
                {issue.ref} · photo {index + 1} of {photos.length}
              </DialogTitle>
              <DialogDescription>
                Sent by {reporter} · {fmtDateTime(p.createdAt)} · {fmtSize(p.sizeBytes)}
              </DialogDescription>
            </DialogHeader>

            <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-black">
              {broken.has(p.id) ? (
                <PhotoUnavailable dark />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- served by the API behind the session cookie
                <img key={p.id} src={src(p)} alt={`Photo ${index + 1} attached to ${issue.ref}`} onError={() => onBroken(p.id)} className="max-h-[70vh] w-full object-contain" />
              )}
              {many && (
                <>
                  <Button size="icon" variant="secondary" className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full opacity-90" onClick={() => go(-1)} aria-label="Previous photo">
                    <ChevronLeft />
                  </Button>
                  <Button size="icon" variant="secondary" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full opacity-90" onClick={() => go(1)} aria-label="Next photo">
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {many && (
                <div className="flex gap-1.5">
                  {photos.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onIndex(i)}
                      aria-label={`Show photo ${i + 1}`}
                      aria-current={i === index}
                      className={cn("size-12 overflow-hidden rounded-md border-2 bg-muted transition", i === index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100")}
                    >
                      {broken.has(t.id) ? (
                        <ImageOff className="m-auto size-4 text-muted-foreground" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- served by the API behind the session cookie
                        <img src={src(t)} alt="" className="size-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" nativeButton={false} render={<a href={src(p)} target="_blank" rel="noreferrer" />}>
                  <ExternalLink data-icon="inline-start" /> Open original
                </Button>
                <Button size="sm" variant="outline" nativeButton={false} render={<a href={src(p)} download={`${issue.ref}-photo-${index + 1}.${ext(p.mimeType)}`} />}>
                  <Download data-icon="inline-start" /> Download
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PhotoUnavailable({ dark }: { dark?: boolean }) {
  return (
    <span className={cn("flex size-full flex-col items-center justify-center gap-1 p-4 text-xs", dark ? "text-white/70" : "text-muted-foreground")}>
      <ImageOff className="size-5" />
      Photo unavailable
    </span>
  )
}
