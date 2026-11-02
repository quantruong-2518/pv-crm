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
import { message, useI18n, type Message } from '@/app/i18n'
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

const MODES: { value: GroupMode; label: Message }[] = [
  { value: 'together', label: message('Chung một lead', 'One shared lead', '하나의 공동 리드') },
  {
    value: 'apart',
    label: message('Mỗi người một lead', 'One lead per person', '사람마다 리드 하나'),
  },
  { value: 'split', label: message('Tự chia lead', 'Split leads manually', '리드 직접 나누기') },
]

type Fields = NonNullable<ImportSpec['groupBy']>

export function StepGroup({
  clusters,
  filtered,
  plan,
  onPlan,
  fields,
}: {
  clusters: readonly CompanyCluster[]
  /** Rows already kept out as duplicates — none of them is listed below. */
  filtered: number
  plan: GroupPlan
  onPlan: (plan: GroupPlan) => void
  fields: Fields
}) {
  const { t } = useI18n()
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
      <SectionTitle size="lg">
        {t(message('Gộp theo công ty', 'Group by company', '회사별로 묶기'))}
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-glass-foreground min-w-[200px] flex-1 text-[12.5px]">
          <span className="font-num tnum">{clusters.length}</span>{' '}
          {t(
            message(
              'công ty có nhiều người liên hệ',
              clusters.length === 1
                ? 'company has several contacts'
                : 'companies have several contacts',
              '개 회사에 연락처가 여러 명 있습니다',
            ),
          )}
          {filtered > 0 && (
            <>
              {t(message(' · đã lọc ', ' · filtered out ', ' · 제외됨 '))}
              <span className="font-num tnum">{filtered}</span>{' '}
              {t(
                message(
                  'dòng trùng',
                  filtered === 1 ? 'duplicate row' : 'duplicate rows',
                  '개 중복 행',
                ),
              )}
            </>
          )}
        </span>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setAll('together')}
        >
          {t(message('Tất cả: chung một lead', 'All: one shared lead', '전체: 공동 리드 하나'))}
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setAll('apart')}
        >
          {t(
            message(
              'Tất cả: mỗi người một lead',
              'All: one lead per person',
              '전체: 사람마다 리드 하나',
            ),
          )}
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
  const { t } = useI18n()
  const mode = modeOf(plan, cluster)
  const marks = groupMarks(cluster, plan)
  const leads = cluster.rows.map((_, i) => ({
    value: String(i),
    label: t(message(`Lead ${i + 1}`, `Lead ${i + 1}`, `리드 ${i + 1}`)),
  }))
  /* What the choice above produces, as a number the person can check. */
  const leadCount =
    cluster.rows.length - marks.size + new Set([...marks.values()].map((m) => m.group)).size
  /* Two people can only be apart or together; a third is what makes a split. */
  const modes = MODES.map((m) => ({
    value: m.value,
    label: t(m.label),
    ...(m.value === 'split' && { disabled: cluster.rows.length < 3 }),
  }))

  return (
    /* Law 8: a list of people sits on `.glass-b`. */
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-[160px] flex-1 items-baseline gap-2 text-[12.5px]">
          <span className="min-w-0 truncate font-semibold" title={cluster.name}>
            {cluster.name}
          </span>
          <span className="text-muted-foreground shrink-0">
            <span className="font-num tnum">{cluster.rows.length}</span>{' '}
            {t(message('người', cluster.rows.length === 1 ? 'person' : 'people', '명'))} →{' '}
            <span className="font-num tnum">{leadCount}</span>{' '}
            {t(message('lead', leadCount === 1 ? 'lead' : 'leads', '리드'))}
          </span>
        </span>
        {/* `quiet`: azure stays with the load button in the footer (law 3). */}
        <SegmentedControl
          label={t(
            message(
              `Cách nạp ${cluster.name}`,
              `How to load ${cluster.name}`,
              `${cluster.name} 등록 방식`,
            ),
          )}
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
                      aria-label={t(
                        message(
                          `Liên hệ chính: ${name}`,
                          `Primary contact: ${name}`,
                          `주 연락처: ${name}`,
                        ),
                      )}
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
                  <span className="text-accent-foreground shrink-0 text-[11px]">
                    {t(message('Liên hệ chính', 'Primary contact', '주 연락처'))}
                  </span>
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
                    label={t(message(`Lead của ${name}`, `Lead for ${name}`, `${name}의 리드`))}
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
