import { useState, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AppShell,
  Button,
  GlassCard,
  Icon,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  SegmentedControl,
  Send,
} from '@pv/ui'
import {
  KPI_ASSIGNMENT_OVER_RATIO,
  KPI_METRIC_LABEL,
  RoleId,
  isTieredPeriod,
  kpiAssignmentNeedsSet,
  kpiMetricShare,
  type KpiAssignmentPageResponse,
  type KpiMetricKey,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toastDone } from '@/app/toast'
import {
  kpiAssignmentPageQuery,
  useDraftKpiAssignment,
  useSendKpiAssignment,
} from '@/data/kpi-assignment'
import { kpiCatalogQuery, type BlockQuery, type KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { keyOf, type PeriodPick } from './home-model'
import { NOTE, TILE } from './home-tiles'
import {
  ROLE_PARAM,
  TIERED_SENTENCE,
  UNIT_PARAM,
  bodyOf,
  fieldsOf,
  liveSums,
  savedValues,
  setChip,
  statusHref,
  type Label,
} from './kpi-assign-model'
import { ReceivedCard } from './kpi-assign-received'
import { ChildrenTable } from './kpi-assign-table'
import { monthEnded, useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'

/** The assignment page — `/sales/kpi/assign?month=&role=&unit=` (ADR 0120): one page
 *  for every level. The head of a unit hands what it received down to its
 *  child units and direct members, one role at a time; at the company the
 *  head types the company totals first. Read live from
 *  `GET /sales/kpi/:period/assignments/:role`, one read per role the catalog
 *  carries, so only the roles this unit hands down get a tab.
 *
 *  Typed figures survive a role switch; the sums follow the typing. Fields and
 *  buttons show only to whoever sits on the unit's seat, on an open month,
 *  while no unit below has sent.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a unit's month
 *  is a sum over many people and opens no single object a chain could anchor on. */

type Edits = Record<string, string>
type Entry = { role: RoleId; page: KpiAssignmentPageResponse }

const PILL_TONE: Record<Label['tone'], 'muted' | 'accent' | 'warning' | 'success'> = {
  draft: 'muted',
  running: 'accent',
  warning: 'warning',
  success: 'success',
}

function Head({
  pick,
  onPick,
  meta,
  actions,
}: {
  pick: PeriodPick
  onPick: (p: PeriodPick) => void
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <ScreenHeader
      title="Giao chỉ tiêu"
      meta={meta}
      actions={
        <>
          {actions}
          <MonthPicker pick={pick} onPick={onPick} />
        </>
      }
    />
  )
}

/** One role of the unit: header chips and buttons, the received card, the table. */
function RoleDesk({
  catalog,
  page,
  unitParam,
  edits,
  setEdits,
  tabs,
  pick,
  onPick,
}: {
  catalog: KpiCatalog
  page: KpiAssignmentPageResponse
  unitParam: string | null
  edits: Edits
  setEdits: (next: Edits) => void
  tabs: ReactNode
  pick: PeriodPick
  onPick: (p: PeriodPick) => void
}) {
  const navigate = useNavigate()
  const seesAll = useCan('kpi.view-all')
  const { period, role } = page
  const defs = catalog[role]
  const draft = useDraftKpiAssignment(period, role, unitParam)
  const send = useSendKpiAssignment(period, role, unitParam)
  const [refused, setRefused] = useState<KpiMetricKey[]>([])

  const closed = page.monthClose !== null || monthEnded(period)
  const editable = page.canAct && !closed && !page.resendLocked
  const saved = savedValues(page)
  const fields = fieldsOf(saved, edits)
  const body = editable ? bodyOf(page, defs, fields) : null
  const sums = editable ? liveSums(page, defs, fields) : page.sums
  const busy = draft.isPending || send.isPending
  const saveable = body !== null && fields.dirty && !busy
  const sendable =
    editable &&
    page.parentSent &&
    !busy &&
    !sums.some((s) => s.flag === 'below') &&
    (fields.dirty ? body !== null : page.set === null || page.set.status === 'draft')
  const company = page.unit.kind === 'company'

  const onEdit = (key: string, text: string) => {
    setRefused([])
    setEdits({ ...edits, [key]: text })
  }
  const save = () =>
    body &&
    draft.mutate(body, {
      onSuccess: () => {
        setEdits({})
        toastDone('Đã lưu nháp')
      },
    })
  const go = () => {
    draft.reset()
    send.mutate(
      { unitId: page.unit.id },
      {
        onSuccess: ({ warnings }) => {
          setRefused([])
          const over = warnings.map((w) => KPI_METRIC_LABEL[w.metricKey]).join(', ')
          const ratio = Math.round(KPI_ASSIGNMENT_OVER_RATIO * 100)
          toastDone('Đã gửi xuống', over ? `Vượt ${ratio}% mức nhận: ${over}` : undefined)
        },
        /* A race: the saved draft moved under the press; mark what the screen now reads short. */
        onError: (e) =>
          e.kind === 'invalid-data' &&
          setRefused(sums.filter((s) => s.flag === 'below').map((s) => s.metricKey)),
      },
    )
  }
  const sendNow = () =>
    fields.dirty && body
      ? draft.mutate(body, {
          onSuccess: () => {
            setEdits({})
            go()
          },
        })
      : go()

  const chip = setChip(page, closed)
  const meta = (
    <>
      <MetaPill tone="accent">{page.unit.name}</MetaPill>
      {chip && <MetaPill tone={PILL_TONE[chip.tone]}>{chip.text}</MetaPill>}
      {page.actingFor && <MetaPill>Làm thay {page.actingFor.name}</MetaPill>}
      {page.resendLocked && <MetaPill>Cấp dưới đã giao, không sửa được</MetaPill>}
      {closed && <MetaPill>Tháng đã kết thúc</MetaPill>}
    </>
  )
  const actions = (
    <>
      {company && (page.canAct || seesAll) && (
        <Button
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => navigate(statusHref(period, role))}
        >
          Tình trạng giao
        </Button>
      )}
      {editable && (
        <>
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            disabled={!saveable}
            onClick={save}
          >
            Lưu nháp
          </Button>
          <Button className="pointer-coarse:h-12" disabled={!sendable} onClick={sendNow}>
            <Icon icon={Send} size={16} />
            Gửi xuống
          </Button>
        </>
      )}
    </>
  )

  return (
    <>
      <Head pick={pick} onPick={onPick} meta={meta} actions={actions} />
      {tabs}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)]">
        <ReceivedCard
          page={page}
          defs={defs.filter((d) => company || kpiMetricShare(d) !== 'total')}
          editable={editable}
          fields={fields}
          onEdit={onEdit}
        />
        <ChildrenTable
          page={page}
          defs={defs}
          editable={editable}
          fields={fields}
          saved={saved}
          sums={sums}
          refused={refused}
          errors={[draft.error, send.error]}
          onEdit={onEdit}
        />
      </div>
    </>
  )
}

/** Every role's page joined into one block: data once all have answered and
 *  one succeeded, the failure once every one failed. */
function joined(
  catalog: BlockQuery<KpiCatalog>,
  roles: readonly RoleId[],
  pages: readonly BlockQuery<KpiAssignmentPageResponse>[],
  pending: boolean,
): BlockQuery<[KpiCatalog, Entry[]]> {
  const entries = roles.flatMap((role, i) => {
    const page = pages[i]?.data
    return page ? [{ role, page }] : []
  })
  const failed = pages.length > 0 && pages.every((p) => p.error)
  return {
    data:
      catalog.data && !pending && (pages.length === 0 || entries.length > 0)
        ? [catalog.data, entries]
        : undefined,
    error: catalog.error ?? (failed ? (pages[0]?.error ?? null) : null),
    isRefetchError: pages.some((p) => p.isRefetchError),
    refetch: () => {
      if (catalog.error) void catalog.refetch()
      pages.filter((p) => p.error).forEach((p) => void p.refetch())
    },
  }
}

/** The contract's rule; the children are exactly the unit's holders of the role. */
const handsDown = (catalog: KpiCatalog, { role, page }: Entry) =>
  kpiAssignmentNeedsSet(catalog[role], page.unit.kind === 'company', page.children.length > 0)

function Desk({
  period,
  unitParam,
  pick,
  onPick,
}: {
  period: string
  unitParam: string | null
  pick: PeriodPick
  onPick: (p: PeriodPick) => void
}) {
  const [params, setParams] = useSearchParams()
  const [edits, setEdits] = useState<Partial<Record<RoleId, Edits>>>({})
  const catalog = useQuery(kpiCatalogQuery)
  const roles = catalog.data ? RoleId.options.filter((r) => catalog.data[r].length > 0) : []
  const pages = useQueries({
    queries: roles.map((role) => kpiAssignmentPageQuery(period, role, unitParam)),
  })
  const all = joined(
    catalog,
    roles,
    pages,
    pages.some((p) => p.isPending),
  )
  const error = isApiError(all.error) ? all.error : null
  /* No seat to read: a retry cannot change that, so it is a sentence, not a failure card. */
  if (error && (error.kind === 'forbidden' || error.kind === 'not-found')) {
    return (
      <>
        <Head pick={pick} onPick={onPick} />
        <GlassCard className={TILE}>
          <p className="text-[12.5px] leading-5">
            {error.kind === 'not-found' && !unitParam
              ? 'Bạn chưa phụ trách đơn vị nào.'
              : userMessage(error)}
          </p>
        </GlassCard>
      </>
    )
  }

  return (
    <>
      {!all.data && <Head pick={pick} onPick={onPick} />}
      <QueryBlock query={all} what="chỉ tiêu cần giao" variant="b">
        {([defs, entries]) => {
          const shown = entries.filter((e) => handsDown(defs, e))
          const entry = shown.find((e) => e.role === params.get(ROLE_PARAM)) ?? shown[0]
          if (!entry) {
            return (
              <>
                <Head pick={pick} onPick={onPick} />
                <p className={NOTE}>Đơn vị này không có vai trò nào cần giao chỉ tiêu.</p>
              </>
            )
          }
          const pickRole = (role: string) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set(ROLE_PARAM, role)
                return next
              },
              { replace: true },
            )
          const tabs = (
            <SegmentedControl
              label="Vai trò"
              hideLabel
              tone="quiet"
              value={entry.role}
              options={shown.map((e) => ({ value: e.role, label: ROLE_LABEL[e.role] }))}
              onChange={pickRole}
              className="self-start"
            />
          )
          return (
            <RoleDesk
              key={entry.role}
              catalog={defs}
              page={entry.page}
              unitParam={unitParam}
              edits={edits[entry.role] ?? {}}
              setEdits={(next) => setEdits({ ...edits, [entry.role]: next })}
              tabs={tabs}
              pick={pick}
              onPick={onPick}
            />
          )
        }}
      </QueryBlock>
    </>
  )
}

export function KpiAssignPage() {
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const [params] = useSearchParams()
  const period = keyOf(pick)
  const unitParam = params.get(UNIT_PARAM)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {isTieredPeriod(period) ? (
          <Desk
            key={`${period}/${unitParam ?? ''}`}
            period={period}
            unitParam={unitParam}
            pick={pick}
            onPick={setPick}
          />
        ) : (
          <>
            <Head pick={pick} onPick={setPick} />
            <p className={NOTE}>{TIERED_SENTENCE}</p>
          </>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiAssignPage
