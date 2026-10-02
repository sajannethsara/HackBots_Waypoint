"use client"

import { useState } from "react"
import { Flag } from "lucide-react"
import { ISSUE_TYPE_META, ISSUE_TYPES, type IssueSeverity, type IssueType } from "@waypoint/shared"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useCreateIssue } from "../queries"

/** Dispatcher-raised issue on a trip (e.g. a call from the driver), optionally pinned to one stop. */
export function ReportIssueDialog({
  tripId,
  vehicleId,
  stops,
}: {
  tripId: string
  vehicleId: string
  stops: { id: string; seq: number; outletId: string; orderId: string }[]
}) {
  const create = useCreateIssue()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<IssueType>("LATE_ARRIVAL")
  const [severity, setSeverity] = useState<IssueSeverity>("MEDIUM")
  const [stopId, setStopId] = useState("trip")
  const [description, setDescription] = useState("")

  const submit = () => {
    const stop = stops.find((s) => s.id === stopId)
    create.mutate(
      {
        stage: type.startsWith("RECEIPT") ? "RECEIPT" : type.startsWith("LOAD") || type === "CAPACITY_BREACH" ? "LOADING" : "DELIVERY",
        type,
        severity,
        description,
        tripId,
        vehicleId,
        stopId: stop?.id,
        orderId: stop?.orderId,
        outletId: stop?.outletId,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setDescription("")
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Flag data-icon="inline-start" /> Report issue
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue on this trip</DialogTitle>
          <DialogDescription>For problems phoned in by the driver or spotted on the board.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as IssueType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: IssueType) => ISSUE_TYPE_META[v].label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ISSUE_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Severity</FieldLabel>
              <Select value={severity} onValueChange={(v) => setSeverity(v as IssueSeverity)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel>Where</FieldLabel>
            <Select value={stopId} onValueChange={(v) => setStopId(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => (v === "trip" ? "Whole trip" : (() => { const s = stops.find((x) => x.id === v); return s ? `Stop ${s.seq} · ${s.outletId}` : "" })())}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trip">Whole trip</SelectItem>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    Stop {s.seq} · {s.outletId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>What happened</FieldLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="e.g. Driver reports flooding on the A3 near Ja-Ela, 20 min detour." />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={description.trim().length < 3 || create.isPending} onClick={submit}>
            {create.isPending && <Spinner />} Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
