"use client"

import { Camera, ImagePlus, RefreshCcw, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Shrink on the device: long edge ≤ 1280 px, JPEG ≈ 70%. Keeps the outbox light on poor networks. */
function toJpeg(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, 1280 / Math.max(w, h))
  const c = document.createElement("canvas")
  c.width = Math.round(w * scale)
  c.height = Math.round(h * scale)
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height)
  return c.toDataURL("image/jpeg", 0.7)
}

async function compress(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const out = toJpeg(bmp, bmp.width, bmp.height)
  bmp.close()
  return out
}

/**
 * Photo for a report or proof of delivery. Asks for camera access and opens a live viewfinder in
 * the app. If the camera is unavailable or blocked, the phone's own camera/gallery picker is offered.
 */
export function PhotoField({ value, onChange, label = "Take photo" }: { value: string | null; onChange: (dataUrl: string | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [camera, setCamera] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const start = () => {
    setProblem(null)
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setProblem("The in-app camera needs a secure connection. Use the phone's camera instead.")
      input.current?.click()
      return
    }
    setCamera(true)
  }

  return (
    <div className="grid gap-2">
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
            setProblem(null)
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
        <Button type="button" variant="outline" className="h-11 w-fit" onClick={start} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <Camera data-icon="inline-start" />} {label}
        </Button>
      )}

      {problem && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-destructive">
          {problem}
          <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => input.current?.click()}>
            <ImagePlus className="size-3" /> Choose a photo
          </button>
        </p>
      )}

      {camera && (
        <Viewfinder
          onClose={() => setCamera(false)}
          onShot={(d) => {
            onChange(d)
            setCamera(false)
          }}
          onDenied={(msg) => {
            setCamera(false)
            setProblem(msg)
          }}
        />
      )}
    </div>
  )
}

/** Full-screen live camera. Triggers the browser's camera permission prompt. */
function Viewfinder({ onClose, onShot, onDenied }: { onClose: () => void; onShot: (dataUrl: string) => void; onDenied: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [ready, setReady] = useState(false)
  const [canFlip, setCanFlip] = useState(false)

  useEffect(() => {
    let dead = false
    const stop = () => stream.current?.getTracks().forEach((t) => t.stop())
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (dead) return s.getTracks().forEach((t) => t.stop())
        stop()
        stream.current = s
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => {})
        }
        setReady(true)
        setCanFlip((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length > 1)
      } catch (e) {
        if (dead) return
        const name = (e as DOMException).name
        onDenied(name === "NotAllowedError" ? "Camera access is blocked. Allow it in your browser settings, or choose a photo instead." : "No camera could be opened. Choose a photo instead.")
      }
    })()
    return () => {
      dead = true
      stop()
    }
  }, [facing, onDenied])

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    onShot(toJpeg(v, v.videoWidth, v.videoHeight))
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <video ref={video} playsInline muted autoPlay className="min-h-0 flex-1 object-cover" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner className="size-6" />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close camera" className="grid size-11 place-items-center rounded-full bg-black/50">
          <X />
        </button>
        {canFlip && (
          <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Switch camera" className="grid size-11 place-items-center rounded-full bg-black/50">
            <RefreshCcw className="size-5" />
          </button>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 grid place-items-center bg-linear-to-t from-black/60 to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={shoot} disabled={!ready} aria-label="Take photo" className="grid size-[4.5rem] place-items-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-50">
          <span className="size-14 rounded-full bg-white" />
        </button>
      </div>
    </div>
  )
}
