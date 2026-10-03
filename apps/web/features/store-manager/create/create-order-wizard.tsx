"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Save, Send } from "lucide-react"
import { toast } from "sonner"
import type { StoreOrderSaved, StoreTemp } from "@waypoint/shared"
import { PageHeader } from "@/components/shared/page-header"
import { Stepper } from "@/components/shared/stepper"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, type Violation } from "@/lib/api"
import { fmtNum } from "@/lib/format"
import { useOrderRules, useSaveOrder, useStoreOrder, useStoreProducts, useUpdateOrder } from "../queries"
import { OrderSuccess } from "./order-success"
import { StepDelivery } from "./step-delivery"
import { StepProducts } from "./step-products"
import { StepReview } from "./step-review"
import { StepType } from "./step-type"
import { EMPTY_DRAFT, sizeProblem, STEPS, toInput, totals, type OrderDraft } from "./wizard-state"

const newRequestId = () => crypto.randomUUID()

/** Create Order: Order type → Products → Delivery → Review, then a success screen with the order reference. */
export function CreateOrderWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const editId = params.get("edit") // a submitted order dispatch has not planned yet
  const resumeId = editId ?? params.get("draft")
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT)
  const [violations, setViolations] = useState<Violation[]>([])
  const [submitted, setSubmitted] = useState<StoreOrderSaved | null>(null)
  const requestId = useRef(newRequestId())
  const hydrated = useRef(false)

  const { data: rules } = useOrderRules()
  const { data: products, isLoading: loadingProducts } = useStoreProducts(draft.temp)
  const { data: existing, isError: draftMissing } = useStoreOrder(resumeId)
  const save = useSaveOrder()
  const update = useUpdateOrder(editId ?? "")
  const saving = save.isPending || update.isPending

  // Resume a saved draft once: restore its lines and details and jump to the products step.
  useEffect(() => {
    if (hydrated.current || !existing || !rules) return
    hydrated.current = true
    if (existing.status !== (editId ? "SUBMITTED" : "DRAFT")) return void router.replace(`/store-manager/orders/${existing.id}`)
    const stillValid = existing.deliveryDate >= rules.earliestDate && existing.deliveryDate <= rules.latestDate && !rules.closedDates.includes(existing.deliveryDate)
    setDraft({
      draftId: editId ? undefined : existing.id,
      temp: existing.temp,
      qty: Object.fromEntries(existing.lines.flatMap((l) => (l.productId ? [[l.productId, l.quantity]] : []))),
      deliveryDate: stillValid ? existing.deliveryDate : undefined,
      windowPref: existing.windowPref ?? undefined,
      notes: existing.notes ?? "",
    })
    setStep(1)
  }, [existing, rules, router, editId])

  const t = useMemo(() => totals(draft, products ?? []), [draft, products])
  const problem = sizeProblem(t, draft.temp, rules)

  const patch = (p: Partial<OrderDraft>) => {
    setViolations([])
    setDraft((d) => ({ ...d, ...p }))
  }
  const setType = (temp: StoreTemp) => patch(temp === draft.temp ? {} : { temp, qty: {} })
  const setQty = (id: string, qty: number) => patch({ qty: { ...draft.qty, [id]: qty } })

  const canContinue = step === 0 ? !!draft.temp : step === 1 ? t.items > 0 && !problem : step === 2 ? !!draft.deliveryDate : true

  function persist(mode: "draft" | "submit") {
    setViolations([])
    if (editId) {
      const { clientRequestId: _id, draftId: _draft, mode: _mode, ...changes } = toInput(draft, "submit", requestId.current)
      return update.mutate(changes, {
        onSuccess: (order) => {
          toast.success(`Order ${order.ref} updated`)
          router.push(`/store-manager/orders/${order.id}`)
        },
        onError: (e) => {
          const v = e instanceof ApiError ? (e.body.violations ?? []) : []
          setViolations(v)
          toast.error("Changes not saved", { description: v[0]?.message ?? (e instanceof Error ? e.message : "Please try again.") })
        },
      })
    }
    save.mutate(toInput(draft, mode, requestId.current), {
      onSuccess: (order) => {
        if (mode === "submit") {
          setSubmitted(order)
          toast.success(`Order ${order.ref} submitted`)
        } else {
          setDraft((d) => ({ ...d, draftId: order.id }))
          toast.success(`Draft ${order.ref} saved`, { action: { label: "My drafts", onClick: () => router.push("/store-manager/orders?tab=drafts") } })
        }
      },
      onError: (e) => {
        const v = e instanceof ApiError ? (e.body.violations ?? []) : []
        setViolations(v)
        toast.error(mode === "submit" ? "Order not submitted" : "Draft not saved", { description: v[0]?.message ?? (e instanceof Error ? e.message : "Please try again.") })
      },
    })
  }

  function again() {
    requestId.current = newRequestId()
    hydrated.current = true
    setDraft(EMPTY_DRAFT)
    setViolations([])
    setSubmitted(null)
    setStep(0)
  }

  if (submitted) return <OrderSuccess order={submitted} onAnother={again} />

  if (resumeId && draftMissing)
    return (
      <div className="grid gap-3">
        <PageHeader title="Create order" description="That order could not be found, or it can no longer be edited." />
        <Button className="w-fit" variant="outline" nativeButton={false} render={<Link href="/store-manager/orders?tab=drafts" />}>
          Back to my orders
        </Button>
      </div>
    )

  const last = step === STEPS.length - 1
  return (
    <div className="grid gap-4">
      <PageHeader
        title={editId ? `Edit order${existing ? ` ${existing.ref}` : ""}` : draft.draftId ? "Continue draft" : "Create order"}
        description={editId ? "Dispatch has not planned this order yet, so you can still change it." : "Four quick steps. Nothing reaches dispatch until you submit."}
        actions={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={editId ? `/store-manager/orders/${editId}` : "/store-manager/orders"} />}>
            Cancel
          </Button>
        }
      />
      <Card className="px-4 py-3">
        <Stepper steps={STEPS} current={step} />
      </Card>

      {step === 0 && <StepType rules={rules} value={draft.temp} onChange={setType} />}
      {step === 1 && <StepProducts products={products} loading={loadingProducts} draft={draft} onQty={setQty} problem={problem} />}
      {step === 2 && <StepDelivery rules={rules} draft={draft} onChange={patch} />}
      {step === 3 && rules && products && <StepReview rules={rules} products={products} draft={draft} violations={violations} />}

      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-5 md:px-5">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-medium">{t.items}</span> item{t.items === 1 ? "" : "s"} · <span className="font-medium">{t.units}</span> units
            <span className="hidden text-muted-foreground sm:inline">
              {" "}
              · {fmtNum(t.weightKg, 1)} kg · {fmtNum(t.volumeM3, 2)} m³
            </span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                <ArrowLeft data-icon="inline-start" /> Back
              </Button>
            )}
            {step > 0 && !editId && (
              <Button variant="outline" onClick={() => persist("draft")} disabled={saving || t.items === 0}>
                {save.isPending && save.variables?.mode === "draft" ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />} Save draft
              </Button>
            )}
            {last ? (
              <Button onClick={() => persist("submit")} disabled={saving || !canContinue || !!problem}>
                {saving && save.variables?.mode !== "draft" ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />} {editId ? "Save changes" : "Submit order"}
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} disabled={!canContinue}>
                Continue <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
