import { Button, GlassCard, SectionTitle, SegmentedControl, Select, cn } from '@pv/ui'
import {
  groupMarks,
  letterOf,
  modeOf,
  withMain,
  type CompanyCluster,
  type GroupMode,
  type GroupPlan,
} from '@/data/import-group'
import type { ImportSpec } from '@/data/intake'

/** Group by company — the step between mapping and loading, shown only when
 *  the file names one company on two or more valid rows.
 *
 *  The file cannot say whether three people at one company are three deals or
 *  one, so the person loading it does. Every company starts on `together`
 *  (the owner's default: one account, one lead); the other two are opt-in.
 *
 *  Not an AI block (law 9 does not apply): nothing here is proposed, the
 *  clusters are an exact fold of the company cell. */

const MODES: { value: GroupMode; label: string }[] = [
  { value: 'together', label: 'Chung một lead' },
  { value: 'apart', label: 'Mỗi người một lead' },
  { value: 'split', label: 'Tự chia lead' },
]

type Fields = NonNullable<ImportSpec['groupBy']>

export function StepGroup({
  clusters,
  plan,
  onPlan,
  fields,
}: {
  clusters: readonly CompanyCluster[]
  plan: GroupPlan
  onPlan: (plan: GroupPlan) => void
  fields: Fields
}) {
  const lettersOf = (key: string) => plan.companies[key]?.letters ?? {}

  const setAll = (mode: GroupMode) =>
    onPlan({
      ...plan,
      companies: Object.fromEntries(
        clusters.map((c) => [c.key, { mode, letters: lettersOf(c.key) }]),
      ),
    })

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle size="lg">Gộp theo công ty</SectionTitle>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-glass-foreground min-w-[200px] flex-1 text-[12.5px]">
          <span className="font-num tnum">{clusters.length}</span> công ty có nhiều người liên hệ
        </span>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setAll('together')}
        >
          Tất cả: chung một lead
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setAll('apart')}
        >
          Tất cả: mỗi người một lead
        </Button>
      </div>

      {clusters.map((cluster) => (
        <CompanyBlock
          key={cluster.key}
          cluster={cluster}
          plan={plan}
          fields={fields}
          onMode={(mode) =>
            onPlan({
              ...plan,
              companies: {
                ...plan.companies,
                [cluster.key]: {
                  mode,
                  /* Splitting carries on from what was on screen: one shared
                     lead stays one until somebody is moved out of it. */
                  letters:
                    mode === 'split' && modeOf(plan, cluster) === 'together'
                      ? Object.fromEntries(cluster.rows.map((r) => [r.line, 0]))
                      : lettersOf(cluster.key),
                },
              },
            })
          }
          onLetter={(line, letter) =>
            onPlan({
              ...plan,
              companies: {
                ...plan.companies,
                [cluster.key]: {
                  mode: 'split',
                  letters: { ...lettersOf(cluster.key), [line]: letter },
                },
              },
            })
          }
          onMain={(line) => onPlan(withMain(plan, cluster, line))}
        />
      ))}
    </section>
  )
}

function CompanyBlock({
  cluster,
  plan,
  fields,
  onMode,
  onLetter,
  onMain,
}: {
  cluster: CompanyCluster
  plan: GroupPlan
  fields: Fields
  onMode: (mode: GroupMode) => void
  onLetter: (line: number, letter: number) => void
  onMain: (line: number) => void
}) {
  const mode = modeOf(plan, cluster)
  const marks = groupMarks(cluster, plan)
  const leads = cluster.rows.map((_, i) => ({ value: String(i), label: `Lead ${i + 1}` }))
  /* What the choice above produces, as a number the person can check. */
  const leadCount =
    cluster.rows.length - marks.size + new Set([...marks.values()].map((m) => m.group)).size
  /* Two people can only be apart or together; a third is what makes a split. */
  const modes = MODES.map((m) =>
    m.value === 'split' ? { ...m, disabled: cluster.rows.length < 3 } : m,
  )

  return (
    /* Law 8: a list of people sits on `.glass-b`. */
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-[160px] flex-1 items-baseline gap-2 text-[12.5px]">
          <span className="min-w-0 truncate font-semibold" title={cluster.name}>
            {cluster.name}
          </span>
          <span className="text-muted-foreground shrink-0">
            <span className="font-num tnum">{cluster.rows.length}</span> người →{' '}
            <span className="font-num tnum">{leadCount}</span> lead
          </span>
        </span>
        {/* `quiet`: azure stays with the load button in the footer (law 3). */}
        <SegmentedControl
          label={`Cách nạp ${cluster.name}`}
          hideLabel
          tone="quiet"
          value={mode}
          options={modes}
          onChange={(v) => onMode(v as GroupMode)}
        />
      </div>

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {cluster.rows.map((row) => {
          const mark = marks.get(row.line)
          const name = row.values[fields.person] ?? ''
          return (
            <li
              key={row.line}
              className="bg-surface-ink/[3%] flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-3 py-1 text-[11.5px] max-sm:py-2"
            >
              {/* The column is held open for the whole company once any of its
                  people is grouped, so names stay aligned down the block. */}
              {marks.size > 0 && (
                <span className="pointer-coarse:w-12 flex w-8 shrink-0 justify-center">
                  {mark && (
                    <button
                      type="button"
                      aria-pressed={mark.primary}
                      aria-label={`Liên hệ chính: ${name}`}
                      onClick={() => onMain(row.line)}
                      className="motion-std hover:bg-surface-ink/8 pointer-coarse:size-12 flex size-8 items-center justify-center rounded-full"
                    >
                      <span className="bg-surface-ink/24 shadow-control flex size-4 items-center justify-center rounded-full">
                        <span className={cn('size-2 rounded-full', mark.primary && 'bg-primary')} />
                      </span>
                    </button>
                  )}
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-foreground truncate" title={name}>
                  {name}
                </span>
                {mark?.primary && (
                  <span className="text-accent-foreground shrink-0 text-[11px]">Liên hệ chính</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full">
                <span
                  className="text-glass-foreground min-w-0 flex-1 truncate"
                  title={row.values[fields.email]}
                >
                  {row.values[fields.email] ?? ''}
                </span>
                {mode === 'split' && (
                  <Select
                    label={`Lead của ${name}`}
                    hideLabel
                    size="lg"
                    value={String(letterOf(plan, cluster, row.line))}
                    /* No letter is a "default" here, so none may light up as an
                     active filter: the neutral value follows the chosen one. */
                    neutralValue={String(letterOf(plan, cluster, row.line))}
                    options={leads}
                    onChange={(v) => onLetter(row.line, Number(v))}
                    className="w-[120px] shrink-0"
                  />
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}
