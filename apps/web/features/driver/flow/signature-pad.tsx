"use client"

import { Eraser } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

/** Finger-drawn signature. Reports a small PNG data URL (white background) or null when empty. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  const setup = useCallback(() => {
    const c = ref.current
    if (!c) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const { width, height } = c.getBoundingClientRect()
    c.width = Math.round(width * ratio)
    c.height = Math.round(height * ratio)
    const ctx = c.getContext("2d")!
    ctx.scale(ratio, ratio)
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, width, height)
    ctx.lineWidth = 2.4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#0f172a"
  }, [])

  useEffect(() => {
    setup()
  }, [setup])

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
    const ctx = ref.current!.getContext("2d")!
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return
    const p = pos(e)
    const ctx = ref.current!.getContext("2d")!
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (empty) setEmpty(false)
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    onChange(ref.current!.toDataURL("image/png"))
    setEmpty(false)
  }

  const clear = () => {
    setup()
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="grid gap-1.5">
      <div className="relative overflow-hidden rounded-xl border bg-white">
        <canvas ref={ref} className="h-40 w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Sign here</span>}
        <span className="pointer-events-none absolute inset-x-4 bottom-8 border-b border-dashed border-slate-300" />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}>
          <Eraser data-icon="inline-start" /> Clear
        </Button>
      </div>
    </div>
  )
}
