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
 *  one, so the person loading it does. Every company starts on `apart`, which
 *  is what the panel did before this step: pressing the load button without
 *  touching anything changes nothing about the batch.
 *
 *  Not an AI block (law 9 does not apply): nothing here is proposed, the
 *  clusters are an exact fold of the company cell. */

const MODES: { value: GroupMode; label: string }[] = [
  { value: 'apart', label: 'Riêng' },
  { value: 'together', label: 'Chung' },
  { value: 'split', label: 'Tự chia' },
]

/** One letter per lead a company can be split into. Past the alphabet a
 *  company simply gets no further leads to split into. */
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

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
          onClick={() => setAll('apart')}
        >
          Tất cả: mỗi người một lead
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setAll('together')}
        >
          Tất cả: một lead chung
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
                [cluster.key]: { mode, letters: lettersOf(cluster.key) },
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
  const letters = LETTERS.slice(0, cluster.rows.length).map((letter, i) => ({
    value: String(i),
    label: `Lead ${letter}`,
  }))

  return (
    /* Law 8: a list of people sits on `.glass-b`. */
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-[160px] flex-1 truncate text-[12.5px] font-semibold">
          {cluster.name}
          <span className="text-muted-foreground font-normal">
            {' · '}
            <span className="font-num tnum">{cluster.rows.length}</span> người
          </span>
        </span>
        {/* `quiet`: azure stays with the load button in the footer (law 3). */}
        <SegmentedControl
          label={`Cách nạp ${cluster.name}`}
          hideLabel
          tone="quiet"
          value={mode}
          options={MODES}
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
              className="bg-surface-ink/[3%] flex min-h-10 items-center gap-3 rounded-sm px-3 text-[11.5px]"
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
                      <span className="bg-surface-ink/9 shadow-control flex size-4 items-center justify-center rounded-full">
                        <span className={cn('size-2 rounded-full', mark.primary && 'bg-primary')} />
                      </span>
                    </button>
                  )}
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-foreground truncate">{name}</span>
                {mark?.primary && (
                  <span className="text-accent-foreground shrink-0 text-[11px]">Liên hệ chính</span>
                )}
              </span>
              <span className="text-glass-foreground min-w-0 flex-1 truncate">
                {row.values[fields.email] ?? ''}
              </span>
              {mode === 'split' && (
                <Select
                  label={`Lead của ${name}`}
                  hideLabel
                  size="sm"
                  value={String(letterOf(plan, cluster, row.line))}
                  /* No letter is a "default" here, so none may light up as an
                     active filter: the neutral value follows the chosen one. */
                  neutralValue={String(letterOf(plan, cluster, row.line))}
                  options={letters}
                  onChange={(v) => onLetter(row.line, Number(v))}
                  className="w-[104px] shrink-0"
                />
              )}
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}
