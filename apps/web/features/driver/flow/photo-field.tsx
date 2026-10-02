"use client"

import { Camera, X } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Shrink a camera photo on the device: long edge ≤ 1280 px, JPEG ≈ 70%. Keeps the outbox light on poor networks. */
async function compress(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const c = document.createElement("canvas")
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL("image/jpeg", 0.7)
}

export function PhotoField({ value, onChange, label = "Add photo" }: { value: string | null; onChange: (dataUrl: string | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          setBusy(true)
          try {
            onChange(await compress(f))
          } finally {
            setBusy(false)
          }
        }}
      />
      {value ? (
        <div className="relative w-fit overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Attached" className="h-28 w-auto object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <Camera data-icon="inline-start" />} {label}
        </Button>
      )}
    </div>
  )
}
