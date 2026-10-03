import type { LucideIcon } from "lucide-react"
import { Construction } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** A store screen whose route and navigation exist but whose content lands in a later phase. */
export function SectionPlaceholder({
  title,
  description,
  icon: Icon = Construction,
  note = "This screen is part of an upcoming phase.",
  actions,
}: {
  title: string
  description: string
  icon?: LucideIcon
  note?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} actions={actions} />
      <Empty className="min-h-[50vh] border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{title} is on the way</EmptyTitle>
          <EmptyDescription>{note}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
