"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Boxes, CheckCircle2, CircleAlert, ClipboardCheck, PackageMinus, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { LINE_CONDITION_LABEL, LINE_CONDITIONS, type LineCondition, type StoreReceiptResult, type StoreReceivingDetail } from "@waypoint/shared"
import { PageHeader } from "@/components/shared/page-header"
import { QuantityInput } from "@/components/shared/quantity-input"
import { StatCard } from "@/components/shared/stat-card"
import { Stepper } from "@/components/shared/stepper"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { fmtDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useReceiveDelivery, useReceivingDetail } from "../queries"

const STEPS = [
  { key: "verify", label: "Verify" },
  { key: "review", label: "Review" },
  { key: "confirm", label: "Confirm" },
]

interface Count {
  received: number
  condition: LineCondition
  notes: string
}
type Counts = Record<string, Count>

const problemOf = (expected: number, c: Count) => c.received < expected || c.condition !== "GOOD"

/** Count a delivery in against what the driver says was handed over. Expected quantities come from the driver's proof of delivery. */
export function ReceiveWizard({ id }: { id: string }) {
  const { data: detail, isLoading, isError } = useReceivingDetail(id)
  const [step, setStep] = useState(0)
  const [counts, setCounts] = useState<Counts>({})
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StoreReceiptResult | null>(null)
  const receive = useReceiveDelivery(id)

  // Start every line at "received in full, in good condition": the store only touches what is wrong.
  useEffect(() => {
    if (!detail) return
    setCounts((prev) =>
      Object.keys(prev).length ? prev : Object.fromEntries(detail.lines.map((l) => [l.orderLineId, { received: l.expectedQty, condition: "GOOD" as LineCondition, notes: "" }])),
    )
  }, [detail])

  const sums = useMemo(() => {
    const lines = detail?.lines ?? []
    const expected = lines.reduce((s, l) => s + l.expectedQty, 0)
    const received = lines.reduce((s, l) => s + (counts[l.orderLineId]?.received ?? 0), 0)
    const problems = lines.filter((l) => counts[l.orderLineId] && problemOf(l.expectedQty, counts[l.orderLineId])).length
    return { expected, received, short: Math.max(0, expected - received), problems }
  }, [detail, counts])

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />
  if (isError || !detail)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>It may belong to another outlet or no longer exist.</EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/store-manager/deliveries" />}>
          Back to deliveries
        </Button>
      </Empty>
    )

  if (result) return <ReceiptDone result={result} detail={detail} short={sums.short} />

  if (!detail.canReceive)
    return (
      <Empty className="min-h-[50vh] border">
        <EmptyHeader>
          <EmptyTitle>{detail.received ? "Already counted in" : "Not ready to receive"}</EmptyTitle>
          <EmptyDescription>
            {detail.received
              ? `${detail.orderRef} has already been received.`
              : detail.status === "REFUSED"
                ? `${detail.orderRef} was refused, so there is nothing to count.`
                : `${detail.orderRef} can be received once the driver has delivered it.`}
          </EmptyDescription>
        </EmptyHeader>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/store-manager/orders/${detail.orderId}`} />}>
          View order
        </Button>
      </Empty>
    )

  const patch = (lineId: string, p: Partial<Count>) => {
    setError(null)
    setCounts((c) => ({ ...c, [lineId]: { ...c[lineId], ...p } }))
  }

  function confirm() {
    setError(null)
    receive.mutate(
      {
        lines: detail!.lines.filter((l) => counts[l.orderLineId]).map((l) => ({ orderLineId: l.orderLineId, receivedQty: counts[l.orderLineId].received, condition: counts[l.orderLineId].condition, notes: counts[l.orderLineId].notes.trim() || undefined })),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          setResult(r)
          toast.success(`${r.orderRef} received`)
        },
        onError: (e) => setError(e instanceof ApiError ? (e.body.violations?.[0]?.message ?? e.message) : e instanceof Error ? e.message : "Please try again."),
      },
    )
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Receive ${detail.orderRef}`}
        description={detail.deliveredAt ? `Delivered ${fmtDateTime(detail.deliveredAt)}${detail.recipientName ? `, signed for by ${detail.recipientName}` : ""}.` : "Count what arrived against what the driver delivered."}
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/store-manager/deliveries" />}>
            Cancel
          </Button>
        }
      />
      <Card className="px-4 py-3">
        <Stepper steps={STEPS} current={step} />
      </Card>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Receipt not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 0 && <VerifyStep detail={detail} counts={counts} onChange={patch} />}
      {step === 1 && <ReviewStep detail={detail} counts={counts} sums={sums} />}
      {step === 2 && <ConfirmStep detail={detail} counts={counts} notes={notes} onNotes={setNotes} />}

      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-5 md:px-5">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-medium">{sums.received}</span> of {sums.expected} units counted
            {sums.problems > 0 && <span className="text-amber-600"> · {sums.problems} to report</span>}
          </p>
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={receive.isPending}>
                <ArrowLeft data-icon="inline-start" /> Back
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)}>
                Continue <ArrowRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button onClick={confirm} disabled={receive.isPending}>
                {receive.isPending ? <Spinner data-icon="inline-start" /> : <ClipboardCheck data-icon="inline-start" />} Confirm receipt
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VerifyStep({ detail, counts, onChange }: { detail: StoreReceivingDetail; counts: Counts; onChange: (id: string, p: Partial<Count>) => void }) {
  return (
    <div className="grid gap-3">
      <Alert>
        <Boxes />
        <AlertTitle>Count each item</AlertTitle>
        <AlertDescription>Quantities start as delivered. Lower the number for anything missing, and mark anything that arrived in poor condition.</AlertDescription>
      </Alert>

      {/* Phones: one card per item, so nothing is hidden off to the side. */}
      <ul className="grid gap-2 sm:hidden">
        {detail.lines.map((l) => {
          const c = counts[l.orderLineId]
          if (!c) return null
          const short = l.expectedQty - c.received
          const bad = problemOf(l.expectedQty, c)
          return (
            <li key={l.orderLineId} className={cn("grid gap-3 rounded-xl border bg-card p-3", bad && "border-amber-300/70 bg-amber-50/70 dark:bg-amber-500/10")}>
              <div>
                <p className="font-medium">{l.description}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{l.category.toLowerCase()}</span> · ordered {l.orderedQty} · driver delivered {l.expectedQty}
                </p>
                {l.refusedQty > 0 && <p className="text-xs text-red-700 dark:text-red-400">Driver recorded {l.refusedQty} refused{l.reason ? `: ${l.reason}` : ""}</p>}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">You received</span>
                <QuantityInput value={c.received} min={0} max={l.expectedQty} disabled={l.expectedQty === 0} label={`${l.description} received`} onChange={(n) => onChange(l.orderLineId, { received: n })} />
              </div>
              {short > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{short} short</p>}
              <Select value={c.condition} onValueChange={(v) => onChange(l.orderLineId, { condition: v as LineCondition })}>
                <SelectTrigger className="w-full" aria-label={`${l.description} condition`}>
                  <SelectValue>{(v: string) => LINE_CONDITION_LABEL[v as LineCondition]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LINE_CONDITIONS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LINE_CONDITION_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bad && <Input value={c.notes} maxLength={200} onChange={(e) => onChange(l.orderLineId, { notes: e.target.value })} placeholder="Note (optional)" aria-label={`${l.description} note`} />}
            </li>
          )
        })}
      </ul>

      <Card size="sm" className="hidden gap-0 py-0 sm:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="pl-4">Item</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Driver delivered</TableHead>
              <TableHead className="text-right">You received</TableHead>
              <TableHead>Condition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((l) => {
              const c = counts[l.orderLineId]
              if (!c) return null
              const short = l.expectedQty - c.received
              const bad = problemOf(l.expectedQty, c)
              return (
                <TableRow key={l.orderLineId} className={cn(bad && "bg-amber-50/70 dark:bg-amber-500/10")}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{l.description}</p>
                    <p className="text-xs text-muted-foreground capitalize">{l.category.toLowerCase()}</p>
                    {l.refusedQty > 0 && <p className="text-xs text-red-600">Driver recorded {l.refusedQty} refused{l.reason ? `: ${l.reason}` : ""}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.orderedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.expectedQty}</TableCell>
                  <TableCell className="text-right">
                    <div className="grid justify-items-end gap-1">
                      <QuantityInput value={c.received} min={0} max={l.expectedQty} disabled={l.expectedQty === 0} label={`${l.description} received`} onChange={(n) => onChange(l.orderLineId, { received: n })} />
                      {short > 0 && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{short} short</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      <Select value={c.condition} onValueChange={(v) => onChange(l.orderLineId, { condition: v as LineCondition })}>
                        <SelectTrigger size="sm" className="w-32" aria-label={`${l.description} condition`}>
                          <SelectValue>{(v: string) => LINE_CONDITION_LABEL[v as LineCondition]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_CONDITIONS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {LINE_CONDITION_LABEL[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {bad && <Input value={c.notes} maxLength={200} onChange={(e) => onChange(l.orderLineId, { notes: e.target.value })} placeholder="Note (optional)" aria-label={`${l.description} note`} className="h-7 w-44 text-xs" />}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function ReviewStep({ detail, counts, sums }: { detail: StoreReceivingDetail; counts: Counts; sums: { expected: number; received: number; short: number; problems: number } }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Boxes} label="Delivered by driver" value={sums.expected} hint="units" />
        <StatCard icon={ClipboardCheck} tone="green" label="You received" value={sums.received} hint="units" />
        <StatCard icon={PackageMinus} tone={sums.short ? "amber" : "green"} label="Short" value={sums.short} hint={sums.short ? "units missing" : "nothing missing"} />
        <StatCard icon={TriangleAlert} tone={sums.problems ? "red" : "green"} label="Lines to report" value={sums.problems} hint={sums.problems ? "dispatch will be told" : "all good"} />
      </div>
      <Card size="sm" className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="pl-4">Item</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="hidden pr-4 sm:table-cell">Condition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((l) => {
              const c = counts[l.orderLineId]
              if (!c) return null
              const diff = c.received - l.expectedQty
              return (
                <TableRow key={l.orderLineId} className={cn(problemOf(l.expectedQty, c) && "bg-amber-50/70 dark:bg-amber-500/10")}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{l.description}</p>
                    {c.condition !== "GOOD" && <p className="text-xs text-muted-foreground sm:hidden">{LINE_CONDITION_LABEL[c.condition]}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.expectedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.received}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", diff < 0 && "font-medium text-red-600")}>{diff === 0 ? "—" : diff}</TableCell>
                  <TableCell className="hidden pr-4 sm:table-cell">{LINE_CONDITION_LABEL[c.condition]}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function ConfirmStep({ detail, counts, notes, onNotes }: { detail: StoreReceivingDetail; counts: Counts; notes: string; onNotes: (v: string) => void }) {
  const raised: string[] = []
  for (const l of detail.lines) {
    const c = counts[l.orderLineId]
    if (!c) continue
    if (c.received < l.expectedQty) raised.push(`${l.description}: ${l.expectedQty - c.received} missing`)
    if (c.condition !== "GOOD" && c.received > 0) raised.push(`${l.description}: ${c.received} ${LINE_CONDITION_LABEL[c.condition].toLowerCase()}`)
  }
  return (
    <div className="grid max-w-2xl gap-4">
      {raised.length > 0 ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>
            {raised.length} {raised.length === 1 ? "issue" : "issues"} will be reported to dispatch
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {raised.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Everything arrived as delivered</AlertTitle>
          <AlertDescription>Confirming marks {detail.orderRef} as received.</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="receipt-notes">Notes (optional)</FieldLabel>
        <Textarea id="receipt-notes" value={notes} maxLength={500} onChange={(e) => onNotes(e.target.value)} placeholder="Anything else about this delivery." />
        <FieldDescription>Once confirmed, the receipt cannot be changed. Report anything you missed from the order page.</FieldDescription>
      </Field>
    </div>
  )
}

function ReceiptDone({ result, detail, short }: { result: StoreReceiptResult; detail: StoreReceivingDetail; short: number }) {
  const withIssues = result.receiptStatus === "CONFIRMED_WITH_ISSUES"
  return (
    <Card className="mx-auto w-full max-w-lg">
      <div className="grid justify-items-center gap-3 px-6 py-4 text-center">
        <span className={cn("flex size-12 items-center justify-center rounded-full", withIssues ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10")}>
          {withIssues ? <TriangleAlert className="size-6" /> : <CheckCircle2 className="size-6" />}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{result.orderRef} received</h2>
          <p className="text-sm text-muted-foreground">
            {withIssues ? `Counted in with ${result.issues.length} ${result.issues.length === 1 ? "issue" : "issues"} reported to dispatch.` : "Counted in with no problems."}
            {short > 0 ? ` ${short} units were short.` : ""}
          </p>
        </div>
        {result.issues.length > 0 && (
          <ul className="grid w-full gap-1 rounded-lg bg-muted/50 p-3 text-left text-sm">
            {result.issues.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span>{i.type.replace(/^RECEIPT_/, "").replace(/_/g, " ").toLowerCase()}</span>
                <Link href={`/store-manager/issues/${i.id}`} className="font-medium text-primary hover:underline">
                  {i.ref}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button nativeButton={false} render={<Link href={`/store-manager/orders/${detail.orderId}`} />}>
            View order
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/store-manager/deliveries" />}>
            Back to deliveries
          </Button>
        </div>
      </div>
    </Card>
  )
}
