import { Fragment, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ColumnFilter, cn } from '@pv/ui'
import { leadIndustryOptionsQuery } from '@/data/industries'

/** The lead book's industry header filter: one pick, either a whole category
 *  or one industry under it — the two address keys `categoryId` and
 *  `industryId`, never both. Industries not grouped yet sit under their own heading. */

export type IndustryPick = { categoryId?: string; industryId?: string }

function Option({
  picked,
  indent,
  onPick,
  children,
}: {
  picked: boolean
  indent?: boolean
  onPick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      className={cn(
        'motion-std pointer-coarse:min-h-12 flex min-h-10 w-full shrink-0 items-center rounded-md px-3 text-left text-[12.5px]',
        indent ? 'pl-6' : 'font-semibold',
        picked
          ? 'bg-primary/24 text-on-tint-primary font-semibold'
          : 'text-glass-foreground hover:bg-surface-ink/8',
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}

export function IndustryFilter({
  value,
  onChange,
}: {
  value: IndustryPick
  onChange: (next: IndustryPick) => void
}) {
  const { data } = useQuery(leadIndustryOptionsQuery)
  const categories = (data?.categories ?? []).filter((c) => c.active)
  const industries = (data?.industries ?? []).filter((i) => i.active)
  const loose = industries.filter((i) => i.categoryId === null)
  const active = Boolean(value.categoryId || value.industryId)

  return (
    <ColumnFilter label="Ngành" iconOnly active={active}>
      {(close) => {
        const pick = (next: IndustryPick) => {
          onChange({ categoryId: next.categoryId, industryId: next.industryId })
          close()
        }
        const industry = (id: string, name: string) => (
          <Option
            key={id}
            indent
            picked={value.industryId === id}
            onPick={() => pick({ industryId: id })}
          >
            {name}
          </Option>
        )
        return (
          <>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
              {categories.map((c) => (
                <Fragment key={c.id}>
                  <Option
                    picked={value.categoryId === c.id}
                    onPick={() => pick({ categoryId: c.id })}
                  >
                    {c.name}
                  </Option>
                  {industries
                    .filter((i) => i.categoryId === c.id)
                    .map((i) => industry(i.id, i.name))}
                </Fragment>
              ))}
              {loose.length > 0 && (
                <span className="text-muted-foreground px-3 pt-2 text-[11px]">Chưa xếp nhóm</span>
              )}
              {loose.map((i) => industry(i.id, i.name))}
            </div>
            {active && (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12 self-start"
                onClick={() => pick({})}
              >
                Bỏ lọc
              </Button>
            )}
          </>
        )
      }}
    </ColumnFilter>
  )
}
