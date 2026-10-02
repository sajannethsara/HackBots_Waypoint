"use client"

import { useDeferredValue, useRef, useState } from "react"
import { AtSign, SendHorizontal } from "lucide-react"
import { MENTION_LABEL, MESSAGE_MAX, mentionToken, type MentionOption, type MentionRef } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { mentionIcon } from "./chat-parts"
import { useMentionOptions } from "./use-chat"

/** "@" + letters before the caret opens the picker. */
const TRIGGER = /(?:^|\s)@([^\s@]*)$/

/**
 * Message box with @mentions. The text shows "@TRIP-019" while typing; the picked items are
 * remembered and turned into @[trip:id|TRIP-019] tokens on send, which the server validates.
 */
export function Composer({
  conversationId,
  memberName,
  onSend,
  autoFocus,
}: {
  conversationId: string
  memberName: string
  onSend: (body: string) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [picks, setPicks] = useState<MentionRef[]>([])
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const query = useDeferredValue(menu?.query ?? "")
  const options = useMentionOptions(conversationId, query, !!menu)
  const list = options.data ?? []

  const detect = (value: string, caret: number) => {
    const m = TRIGGER.exec(value.slice(0, caret))
    setMenu(m ? { start: caret - m[1].length - 1, query: m[1] } : null)
    setActive(0)
  }

  const choose = (o: MentionOption) => {
    if (!menu) return
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const insert = `@${o.label} `
    const next = text.slice(0, menu.start) + insert + text.slice(caret)
    setText(next)
    setPicks((p) => (p.some((x) => x.type === o.type && x.id === o.id) ? p : [...p, { type: o.type, id: o.id, label: o.label }]))
    setMenu(null)
    const pos = menu.start + insert.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const submit = () => {
    let body = text.trim()
    if (!body) return
    // Longest labels first so "@Keells Nugegoda" is not eaten by a shorter label.
    for (const p of [...picks].sort((a, b) => b.label.length - a.label.length)) {
      const at = `@${p.label}`
      if (body.includes(at)) body = body.replace(at, mentionToken(p))
    }
    onSend(body)
    setText("")
    setPicks([])
    setMenu(null)
  }

  const openPicker = () => {
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const needsSpace = caret > 0 && !/\s/.test(text[caret - 1])
    const insert = needsSpace ? " @" : "@"
    const next = text.slice(0, caret) + insert + text.slice(caret)
    setText(next)
    detect(next, caret + insert.length)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret + insert.length, caret + insert.length)
    })
  }

  const over = text.length > MESSAGE_MAX - 200

  return (
    <div className="relative border-t bg-background p-3">
      {menu && (
        <div role="listbox" aria-label="Mention" className="absolute right-3 bottom-full left-3 z-10 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {list.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-muted-foreground">
              {options.isFetching ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Searching…
                </span>
              ) : (
                `Nothing matches. You can mention issues, trips, outlets, vehicles and orders that involve ${memberName}.`
              )}
            </p>
          ) : (
            list.map((o, i) => {
              const Icon = mentionIcon(o.type)
              return (
                <div key={`${o.type}:${o.id}`}>
                  {(i === 0 || list[i - 1].type !== o.type) && (
                    <p className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{MENTION_LABEL[o.type]}s</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === active && "bg-accent text-accent-foreground")}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{o.label}</span>
                    {o.hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{o.hint}</span>}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder={`Message ${memberName}…`}
          className="max-h-32 min-h-9 resize-none py-1.5"
          onChange={(e) => {
            setText(e.target.value)
            detect(e.target.value, e.target.selectionStart)
          }}
          onClick={(e) => detect(text, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (menu && list.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length)
                return
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault()
                choose(list[active])
                return
              }
            }
            if (e.key === "Escape" && menu) {
              e.preventDefault()
              setMenu(null)
              return
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button type="button" variant="ghost" size="icon" title="Mention an issue, trip, outlet, vehicle or order" aria-label="Mention" onClick={openPicker}>
          <AtSign />
        </Button>
        <Button type="button" size="icon" disabled={!text.trim()} onClick={submit} aria-label="Send message" title="Send (Enter)">
          <SendHorizontal />
        </Button>
      </div>
      {/* <p className={cn("mt-1.5 px-0.5 text-[10px] text-muted-foreground", over && "text-amber-600")}>
        {over ? `${text.length}/${MESSAGE_MAX}` : "Enter to send · Shift+Enter for a new line"}
      </p> */}
    </div>
  )
}
