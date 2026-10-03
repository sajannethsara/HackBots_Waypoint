"use client"

import { useEffect, useState } from "react"

/**
 * The brand mark is green on an opaque white square. Turn the white into real transparency once, in the
 * browser, so the mark sits directly on the header in both light and night mode (no box, no blend tricks).
 */
export function TransparentLogo({ className }: { className?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    const img = new Image()
    img.onload = () => {
      const size = 128
      const c = document.createElement("canvas")
      c.width = c.height = size
      const ctx = c.getContext("2d")!
      ctx.drawImage(img, 0, 0, size, size)
      const d = ctx.getImageData(0, 0, size, size)
      for (let i = 0; i < d.data.length; i += 4) {
        const min = Math.min(d.data[i], d.data[i + 1], d.data[i + 2])
        const a = Math.max(0, Math.min(1, (255 - min) / 235))
        if (a === 0) {
          d.data[i + 3] = 0
          continue
        }
        for (let k = 0; k < 3; k++) d.data[i + k] = Math.max(0, Math.min(255, (d.data[i + k] - 255 * (1 - a)) / a))
        d.data[i + 3] = Math.round(a * (d.data[i + 3] / 255) * 255)
      }
      ctx.putImageData(d, 0, 0)
      if (!dead) setSrc(c.toDataURL("image/png"))
    }
    img.src = "/logo-icon.png"
    return () => {
      dead = true
    }
  }, [])

  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={className} /> : <span className={className} />
}
