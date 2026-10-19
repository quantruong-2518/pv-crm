import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Check,
  FileText,
  GlassCard,
  Icon,
  MetaPill,
  Paperclip,
  PenLine,
  SectionTitle,
  StatCard,
  StatusDot,
  Timeline,
  vnd,
  millions,
  type StatusDotState,
} from '@pv/ui'
import { DOC_STATE_LABEL } from '@pv/contracts'
import { daysUntil } from '@pv/engines'
import { userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { toast, toastDone, toastFail } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import {
  RECORD_CHANNEL_LABEL,
  contractDetailQuery,
  daysPhrase,
  installmentOf,
  overdue,
  today,
  viewInstallment,
  type Contract,
  type Installment,
  type InstallmentCondition,
  type InstallmentView,
} from '@/data/contracts'
import { useDoneCondition } from '@/data/contracts-write'
import { opportunityProfileQuery } from '@/data/opportunities'
import { DueBadge, SideTag } from '@/components/contract-bits'
import { MAIL_BLOCKED, contractChain, useContractRun } from '@/components/contract-run'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { ActionBar } from '@/components/record/action-bar'
import { RecordCard } from '@/components/record/record-card'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { TodoCard, type RungMark, type TodoRung } from '@/components/record/todo-card'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners } from '@/components/run/run-owners'
import { RunBlock } from '@/components/run/run-block'
import { RunContacts } from '@/components/run/run-contacts'
import { OverdueReasonCard } from './installment-overdue-reason'

/** Level 2 of the drill — inside one installment, on the record shell (ADR
 *  0078): the run strip stands on its contract, which the header names as the
 *  way back up; the floating bar is the contract's, the only door to a contact.
 *
 *  The body leads with the unlock checklist as the todo card — the only block
 *  that can change today — then the numbers and the installment's own touches.
 *  The rail carries the run's comms and people, then paperwork and notes. */

const RECORD_DOT: Record<string, StatusDotState> = {
  done: 'ok',
  'awaiting-reply': 'bad',
  scheduled: 'current',
  upcoming: 'next',
}

const DOC_TONE = { complete: 'success', 'awaiting-signature': 'danger', missing: 'draft' } as const

export function InstallmentDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()
  const { code = '', no = '' } = useParams()

  /* The installment lives inside the contract, so there is one read for both
     screens — and the cache is shared with level 1, which is why stepping in
     and back out does not refetch. */
  const { data: contract, isPending, error } = useQuery(contractDetailQuery(code))
  const installment = useMemo(
    () => (contract ? installmentOf(contract, Number(no)) : null),
    [contract, no],
  )

  return (
    <AppShell {...chrome.shell}>
      {contract && installment ? (
        <InstallmentScreen contract={contract} installment={installment} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: 'Không có hợp đồng hoặc đợt này, hoặc hợp đồng không do bạn phụ trách.',
            fallback: 'Không có hợp đồng hoặc đợt này, hoặc hợp đồng không do bạn phụ trách.',
            back: { label: 'Về sổ hợp đồng', onClick: () => navigate('/sales/contracts') },
          }}
        />
      )}
    </AppShell>
  )
}

export default InstallmentDetailPage

// ---------------------------------------------------------------------------

type View = InstallmentView<Installment>

function InstallmentScreen({
  contract,
  installment,
}: {
  contract: Contract
  installment: Installment
}) {
  const navigate = useNavigate()
  const run = useContractRun(contract)
  const [composing, setComposing] = useState(false)
  const mailBlocked = useCan('lead.send-email') ? undefined : MAIL_BLOCKED
  const now = useMemo(() => today(), [])
  const view = viewInstallment(installment, now)
  const subject = { kind: 'contract', code: contract.code } as const
  /* The deal's verdict on this contract's schedule when this reader can read
     the deal; otherwise the permission alone, and the server judges the press. */
  const permitted = useCan('contract.edit')
  const verdict = useQuery(
    opportunityProfileQuery(contract.opportunityCode),
  ).data?.money.contracts.find((c) => c.code === contract.code)?.can.editSchedule
  const canDone = (verdict ?? permitted) && !installment.paidAt
  const done = useDoneCondition(contract.code)
  const { blocking } = view

  return (
    <RecordShell
      strip={
        <RunStrip
          workstreamCode={run.workstreamCode}
          current={subject}
          fallback={contractChain(contract, navigate)}
        />
      }
      header={
        <RecordHeader
          title={
            <>
              {`Đợt ${installment.no} · ${installment.label}`}
              <DueBadge level={view.level} className="ml-3 align-middle tracking-normal" />
            </>
          }
          actions={
            blocking &&
            canDone && (
              <Button
                size="lg"
                disabled={done.isPending}
                onClick={() =>
                  done.mutate(
                    { no: installment.no, id: blocking.id },
                    {
                      onSuccess: () => toastDone('Đã đánh dấu xong.'),
                      onError: (e) => toastFail('Không đánh dấu được.', userMessage(e)),
                    },
                  )
                }
              >
                <Icon icon={Check} size={16} />
                Đánh dấu xong
              </Button>
            )
          }
          meta={[
            `${installment.share}% giá trị hợp đồng`,
            <>
              thuộc hợp đồng{' '}
              <Link
                to={`/sales/contracts/${contract.code}`}
                className="text-foreground underline underline-offset-2"
              >
                {run.title}
              </Link>
            </>,
          ]}
        />
      }
      main={
        <>
          <ConditionsTodo installment={installment} view={view} now={now} />
          <InstallmentStats installment={installment} view={view} />
          <OverdueReasonCard
            contract={contract}
            installment={installment}
            overdue={overdue(view.level)}
          />
          <RecordsCard installment={installment} />
        </>
      }
      railLabel="Lịch sử liên hệ, người liên hệ, giấy tờ và ghi chú của đợt"
      rail={
        <>
          <RunOwners workstreamCode={run.workstreamCode} focus={contract.code} />
          <CommJourney workstreamCode={run.workstreamCode} subject={subject} />
          <RunContacts subject={subject} />
          <DocsCard installment={installment} />
          <NotesCard installment={installment} />
        </>
      }
      actionBar={
        <ActionBar
          label="Thao tác hợp đồng"
          subject={subject}
          contacts={run.contacts}
          mailBlocked={mailBlocked}
          onCompose={() => setComposing(true)}
        />
      }
    >
      {composing && (
        <LetterComposer
          door="contract"
          code={contract.code}
          leadCode={contract.leadCode}
          onClose={() => setComposing(false)}
        />
      )}
    </RecordShell>
  )
}

/** One rung per checklist line, in contract order: the blocking line is the
 *  current one, any other late line waits. */
function conditionRung(c: InstallmentCondition, blocking: boolean, now: string): TodoRung {
  const late = !c.doneAt && daysUntil(c.due, now) <= 0
  const mark: RungMark = c.doneAt ? 'done' : blocking ? 'current' : late ? 'waiting' : 'future'
  return {
    key: c.id,
    label: c.what,
    mark,
    caption: [
      c.side === 'ours' ? 'bên ta' : 'bên khách',
      c.who,
      `hạn ${dm(c.due)}`,
      c.doneAt ? `xong ${dm(c.doneAt)}` : daysPhrase(daysUntil(c.due, now)),
    ].join(' · '),
    late,
  }
}

/** The unlock checklist as the todo card. Its one door, marking the blocking
 *  line done, is the header's (`InstallmentScreen`); contact goes through the
 *  floating bar only. */
function ConditionsTodo({
  installment,
  view,
  now,
}: {
  installment: Installment
  view: View
  now: string
}) {
  const { blocking } = view
  return (
    <TodoCard
      rungs={installment.conditions.map((c) => conditionRung(c, blocking?.id === c.id, now))}
      rungsLabel="Điều kiện mở khoá"
      layout="list"
      next={
        blocking && (
          <div className="flex flex-col items-start gap-2">
            <SideTag side={blocking.side} long />
            <p className="m-0 text-[12.5px] leading-[1.6]">
              Đây là việc duy nhất còn thiếu. Xong là kế toán xuất được hoá đơn.
            </p>
          </div>
        )
      }
    />
  )
}

function InstallmentStats({ installment, view }: { installment: Installment; view: View }) {
  const invoice = installment.docs.find((d) => d.name.includes('Hoá đơn'))
  return (
    <RecordCard>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="compact"
          label="Số tiền"
          value={millions(installment.amount, 0)}
          source={vnd(installment.amount)}
        />
        <StatCard
          size="compact"
          label="Hạn thanh toán"
          value={dm(installment.due)}
          source={installment.paidAt ? `về ${dm(installment.paidAt)}` : daysPhrase(view.daysLeft)}
        />
        <StatCard
          size="compact"
          label="Điều kiện mở khoá"
          value={`${view.doneConditions}/${view.totalConditions}`}
          source={
            view.blocking
              ? `còn 1 · bên ${view.blocking.side === 'ours' ? 'ta' : 'khách'}`
              : 'xong cả hai bên'
          }
        />
        <StatCard
          size="compact"
          label="Hoá đơn"
          value={invoice?.state === 'complete' ? 'Đã xuất' : 'Chưa xuất'}
          source={invoice?.hint ?? 'chưa tới lượt'}
        />
      </div>
    </RecordCard>
  )
}

function DocsCard({ installment }: { installment: Installment }) {
  return (
    <RunBlock title="Giấy tờ">
      {installment.docs.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">Chưa có tệp nào.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {installment.docs.map((doc) => (
            <div key={doc.id} className="bg-surface-ink/6 flex items-center gap-3 rounded-md p-3">
              <Icon icon={FileText} size={16} className="text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{doc.name}</span>
                <span className="text-muted-foreground text-[12px]">{doc.hint}</span>
              </span>
              <Badge tone={DOC_TONE[doc.state]} className="shrink-0">
                {DOC_STATE_LABEL[doc.state]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </RunBlock>
  )
}

/** The installment's own touches — the chase cadence, sent and queued. Kept:
 *  they live in their own table, so the rail's comm list never shows them. */
function RecordsCard({ installment }: { installment: Installment }) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <SectionTitle size="detail" hint="Gồm lượt đã nhắc, khách trả lời và lượt sắp nhắc.">
        {installment.records.length} lượt chạm
      </SectionTitle>

      {installment.records.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
          Chưa có lượt nào. Lịch nhắc bắt đầu 14 ngày trước hạn.
        </p>
      ) : (
        <Timeline
          items={installment.records.map((r) => ({
            id: r.id,
            state: RECORD_DOT[r.state],
            title: r.what,
            meta: (
              <div className="flex flex-wrap items-center gap-2">
                <MetaPill>{RECORD_CHANNEL_LABEL[r.channel]}</MetaPill>
                <span className="text-muted-foreground tnum text-[12px]">
                  {r.state === 'upcoming' || r.state === 'scheduled' ? dm(r.at) : dmhm(r.at)} ·{' '}
                  {r.detail}
                </span>
              </div>
            ),
          }))}
        />
      )}
    </GlassCard>
  )
}

function NotesCard({ installment }: { installment: Installment }) {
  return (
    <RunBlock title="Ghi chú">
      {installment.notes.map((note) => (
        <div key={note.id} className="bg-surface-ink/6 flex flex-col gap-2 rounded-md p-3">
          <div className="flex items-center gap-2">
            <StatusDot state="ok" />
            <span className="text-[12px]">{note.who}</span>
            <span className="text-muted-foreground tnum ml-auto text-[12px]">{dmhm(note.at)}</span>
          </div>
          <p className="m-0 text-[12.5px] leading-[1.6]">{note.text}</p>
        </div>
      ))}

      <div className="bg-accent flex flex-col gap-2 rounded-md p-3 shadow-[inset_0_1px_0_var(--sheen-b)]">
        <span className="text-on-tint-primary text-[12.5px] font-semibold">Lời hứa của khách</span>
        <p className="text-on-tint-primary-muted m-0 text-[12px] leading-[1.6]">
          Chưa có dòng nào. Ghi lại ngày khách hẹn, ai hẹn và hẹn qua kênh nào.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="pointer-coarse:h-12 self-start"
          onClick={() => toast('Chưa dùng được.')}
        >
          <Icon icon={PenLine} size={16} />
          Ghi lời hứa
        </Button>
      </div>

      <button
        type="button"
        className="text-muted-foreground motion-std bg-surface-ink/6 hover:bg-surface-ink/12 flex min-h-12 items-center gap-2 rounded-md p-3 text-[12.5px]"
        onClick={() => toast('Chưa dùng được.')}
      >
        <Icon icon={Paperclip} size={16} />
        Viết ghi chú mới…
      </button>
    </RunBlock>
  )
}
