import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  Plus,
  SectionTitle,
  StatCard,
  StatusDot,
  Timeline,
  millions,
  type StatusDotState,
} from '@pv/ui'
import { daysUntil } from '@pv/engines'
import { userMessage } from '@/app/api'
import { formatCurrency, message, translate, useI18n, type Lang } from '@/app/i18n'
import { useAppChrome } from '@/app/chrome'
import { useCan, useSession } from '@/app/auth'
import { toast, toastDone, toastFail } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import {
  contractDetailQuery,
  installmentOf,
  overdue,
  today,
  viewInstallment,
  type Contract,
  type Installment,
  type InstallmentCondition,
  type InstallmentView,
} from '@/data/contracts'
import { CONTRACT_DETAIL_COPY, installmentNoText } from '@/data/contract-detail-copy'
import { useDoneCondition } from '@/data/contracts-write'
import {
  conditionSideInline,
  contractReadOnlyCopy,
  MARKED_DONE,
  MARK_FAILED,
  daysPhraseText,
  docStateText,
  recordChannelText,
} from '@/data/installment-copy'
import { opportunityProfileQuery } from '@/data/opportunities'
import { CollectCard, installmentDoorsOf } from '@/components/deal-pay'
import { ReminderForm } from '@/components/deal-money/installment-sections'
import { DueBadge, SideTag, TerminatedBadge } from '@/components/contract-bits'
import { mailBlockedText, contractChain, useContractRun } from '@/components/contract-run'
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

const NOT_FOUND = message(
  'Không có hợp đồng hoặc đợt này, hoặc hợp đồng không do bạn phụ trách.',
  'This contract or installment does not exist, or the contract is not yours to handle.',
  '이 계약 또는 납부 회차가 없거나, 담당하신 계약이 아닙니다.',
)

export function InstallmentDetailPage() {
  const { t } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(
      message(
        'Tìm hợp đồng, khách hàng, số hoá đơn…',
        'Search contracts, customers, invoice numbers…',
        '계약, 고객, 청구서 번호 검색…',
      ),
    ),
  })
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
            notFound: t(NOT_FOUND),
            fallback: t(NOT_FOUND),
            back: {
              label: t(CONTRACT_DETAIL_COPY.backToBook),
              onClick: () => navigate('/sales/contracts'),
            },
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
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const run = useContractRun(contract)
  const [composing, setComposing] = useState<{ to: string | null } | null>(null)
  const mailBlocked = useCan('lead.send-email') ? undefined : mailBlockedText(lang)
  const now = useMemo(() => today(), [])
  const view = viewInstallment(installment, now)
  const subject = { kind: 'contract', code: contract.code } as const
  /* The deal's verdict on this contract's schedule when this reader can read
     the deal; otherwise the permission alone, and the server judges the press. */
  const permitted = useCan('contract.edit')
  const verdict = useQuery(
    opportunityProfileQuery(contract.opportunityCode),
  ).data?.money.contracts.find((c) => c.code === contract.code)?.can.editSchedule
  /* Collecting has its own verdict, read off this contract: the payment PIC,
     the head of sales or the director. */
  const me = useSession((st) => st.actor?.id)
  /* A terminated contract refuses every write (ADR 0107), so no door is offered. */
  const ended = contract.termination !== null
  const editable = (verdict ?? permitted) && contract.canEdit !== false && !ended
  const canDone = editable && !installment.paidAt
  const done = useDoneCondition(contract.code)
  const { blocking } = view
  const doors = installmentDoorsOf(
    installment,
    { editSchedule: editable, recordPayment: contract.canCollect === true && !ended },
    me,
  )

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
              {`${installmentNoText(installment.no, lang)} · ${installment.label}`}
              {ended && !installment.paidAt ? (
                <TerminatedBadge className="ml-3 align-middle tracking-normal" />
              ) : (
                <DueBadge level={view.level} className="ml-3 align-middle tracking-normal" />
              )}
            </>
          }
          note={
            ended
              ? installment.paidAt
                ? t(
                    message(
                      'Hợp đồng đã chấm dứt.',
                      'The contract has been terminated.',
                      '계약이 종료되었습니다.',
                    ),
                  )
                : null
              : contract.canEdit === false
                ? contractReadOnlyCopy(contract.ownerName, contract.canCollect === true, lang)
                : null
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
                      onSuccess: () => toastDone(t(MARKED_DONE)),
                      onError: (e) => toastFail(t(MARK_FAILED), userMessage(e)),
                    },
                  )
                }
              >
                <Icon icon={Check} size={16} />
                {t(message('Đánh dấu xong', 'Mark as done', '완료로 표시'))}
              </Button>
            )
          }
        />
      }
      main={
        <>
          <ConditionsTodo installment={installment} view={view} now={now} ended={ended} />
          <CollectCard
            contract={contract}
            installment={installment}
            canPay={doors.pay}
            canUndo={doors.undo}
            leads={Boolean(blocking && canDone)}
            late={!ended && overdue(view.level)}
          />
          <InstallmentStats installment={installment} view={view} ended={ended} />
          <OverdueReasonCard
            contract={contract}
            installment={installment}
            overdue={!ended && overdue(view.level)}
          />
          <RecordsCard code={contract.code} installment={installment} canRemind={doors.remind} />
        </>
      }
      railLabel={t(
        message(
          'Lịch sử liên hệ, người liên hệ, giấy tờ và ghi chú của đợt',
          'Contact history, contacts, papers and notes of this installment',
          '이 납부 회차의 연락 내역, 연락처, 서류 및 메모',
        ),
      )}
      rail={
        <>
          <RunOwners workstreamCode={run.workstreamCode} focus={contract.code} />
          <RunContacts subject={subject} />
          <CommJourney workstreamCode={run.workstreamCode} subject={subject} />
          <DocsCard installment={installment} />
          <NotesCard installment={installment} />
        </>
      }
      actionBar={
        <ActionBar
          label={t(CONTRACT_DETAIL_COPY.actions)}
          subject={subject}
          contacts={run.contacts}
          mailBlocked={mailBlocked}
          onCompose={(contact) => setComposing({ to: contact.code ?? null })}
        />
      }
    >
      {composing && (
        <LetterComposer
          door="contract"
          code={contract.code}
          leadCode={contract.leadCode}
          to={composing.to}
          onClose={() => setComposing(null)}
        />
      )}
    </RecordShell>
  )
}

/** One rung per checklist line, in contract order: the blocking line is the
 *  current one, any other late line waits. On a terminated contract nothing is
 *  owed, so no line is current or late and the day count is dropped. */
function conditionRung(
  c: InstallmentCondition,
  blocking: boolean,
  now: string,
  ended: boolean,
  lang: Lang,
): TodoRung {
  const msg = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  const late = !ended && !c.doneAt && daysUntil(c.due, now) < 0
  const mark: RungMark = c.doneAt
    ? 'done'
    : ended
      ? 'future'
      : blocking
        ? 'current'
        : late
          ? 'waiting'
          : 'future'
  return {
    key: c.id,
    label: c.what,
    mark,
    caption: [
      conditionSideInline(c.side, lang),
      c.who,
      msg(`hạn ${dm(c.due)}`, `due ${dm(c.due)}`, `기한 ${dm(c.due)}`),
      c.doneAt
        ? msg(`xong ${dm(c.doneAt)}`, `done ${dm(c.doneAt)}`, `완료 ${dm(c.doneAt)}`)
        : !ended && daysPhraseText(daysUntil(c.due, now), lang),
    ]
      .filter(Boolean)
      .join(' · '),
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
  ended,
}: {
  installment: Installment
  view: View
  now: string
  ended: boolean
}) {
  const { t, lang } = useI18n()
  const { blocking } = view
  return (
    <TodoCard
      rungs={installment.conditions.map((c) =>
        conditionRung(c, blocking?.id === c.id, now, ended, lang),
      )}
      rungsLabel={t(message('Điều kiện mở khoá', 'Unlock conditions', '해제 조건'))}
      layout="list"
      next={
        blocking &&
        !ended && (
          <div className="flex flex-col items-start gap-2">
            <SideTag side={blocking.side} long />
            <p className="m-0 text-[12.5px] leading-[1.6]">
              {t(
                message(
                  'Đây là việc duy nhất còn thiếu. Xong là kế toán xuất được hoá đơn.',
                  'This is the only thing still missing. Once done, accounting can issue the invoice.',
                  '남은 일은 이것 하나입니다. 완료되면 회계팀이 청구서를 발행할 수 있습니다.',
                ),
              )}
            </p>
          </div>
        )
      }
    />
  )
}

function InstallmentStats({
  installment,
  view,
  ended,
}: {
  installment: Installment
  view: View
  ended: boolean
}) {
  const { t, lang } = useI18n()
  const invoice = installment.docs.find((d) => d.name.includes('Hoá đơn')) // i18n-ignore: matches the stored name
  return (
    <RecordCard>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="compact"
          label={t(message('Số tiền', 'Amount', '금액'))}
          value={millions(installment.amount, 0)}
          source={formatCurrency(installment.amount, 'VND')}
        />
        <StatCard
          size="compact"
          label={t(message('Hạn thanh toán', 'Payment due', '납부 기한'))}
          value={dm(installment.due)}
          source={
            installment.paidAt
              ? undefined
              : ended
                ? t(message('hợp đồng đã chấm dứt', 'contract terminated', '계약 종료됨'))
                : daysPhraseText(view.daysLeft, lang)
          }
        />
        <StatCard
          size="compact"
          label={t(message('Điều kiện mở khoá', 'Unlock conditions', '해제 조건'))}
          value={`${view.doneConditions}/${view.totalConditions}`}
          source={
            ended
              ? undefined
              : view.blocking
                ? t(
                    message(
                      `còn 1 · ${conditionSideInline(view.blocking.side, 'vi')}`,
                      `1 left · ${conditionSideInline(view.blocking.side, 'en')}`,
                      `1건 남음 · ${conditionSideInline(view.blocking.side, 'ko')}`,
                    ),
                  )
                : t(message('xong cả hai bên', 'done on both sides', '양측 모두 완료'))
          }
        />
        <StatCard
          size="compact"
          label={t(message('Hoá đơn', 'Invoice', '청구서'))}
          value={
            invoice?.state === 'complete'
              ? t(message('Đã xuất', 'Issued', '발행됨'))
              : t(message('Chưa xuất', 'Not issued', '미발행'))
          }
          source={
            invoice?.hint ?? t(message('chưa tới lượt', 'not its turn yet', '아직 차례가 아님'))
          }
        />
      </div>
    </RecordCard>
  )
}

function DocsCard({ installment }: { installment: Installment }) {
  const { t, lang } = useI18n()
  return (
    <RunBlock title={t(message('Giấy tờ', 'Papers', '서류'))}>
      {installment.docs.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
          {t(message('Chưa có tệp nào.', 'No files yet.', '아직 파일이 없습니다.'))}
        </p>
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
                {docStateText(doc.state, lang)}
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
function RecordsCard({
  code,
  installment,
  canRemind,
}: {
  code: string
  installment: Installment
  canRemind: boolean
}) {
  const { t, lang } = useI18n()
  const [adding, setAdding] = useState(false)
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <SectionTitle
        size="detail"
        hint={t(
          message(
            'Gồm lượt đã nhắc, khách trả lời và lượt sắp nhắc.',
            'Includes reminders sent, customer replies and upcoming reminders.',
            '보낸 알림, 고객 답변, 예정된 알림이 포함됩니다.',
          ),
        )}
        actions={
          canRemind && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              aria-expanded={adding}
              onClick={() => setAdding((was) => !was)}
            >
              <Icon icon={Plus} size={16} />
              {t(message('Ghi lần nhắc', 'Log a reminder', '알림 기록'))}
            </Button>
          )
        }
      >
        {t(
          message(
            `${installment.records.length} lượt chạm`,
            `${installment.records.length} touches`,
            `접점 ${installment.records.length}건`,
          ),
        )}
      </SectionTitle>

      {adding && <ReminderForm code={code} no={installment.no} onClose={() => setAdding(false)} />}

      {installment.records.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
          {t(
            message(
              'Chưa có lượt nào. Lịch nhắc bắt đầu 14 ngày trước hạn.',
              'No touches yet. The reminder schedule starts 14 days before the due date.',
              '아직 접점이 없습니다. 알림 일정은 기한 14일 전에 시작됩니다.',
            ),
          )}
        </p>
      ) : (
        <Timeline
          items={installment.records.map((r) => ({
            id: r.id,
            state: RECORD_DOT[r.state],
            title: r.what,
            meta: (
              <div className="flex flex-wrap items-center gap-2">
                <MetaPill>{recordChannelText(r.channel, lang)}</MetaPill>
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
  const { t } = useI18n()
  const unavailable = () =>
    toast(t(message('Chưa dùng được.', 'Not available yet.', '아직 사용할 수 없습니다.')))
  return (
    <RunBlock title={t(message('Ghi chú', 'Notes', '메모'))}>
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
        <span className="text-on-tint-primary text-[12.5px] font-semibold">
          {t(message('Lời hứa của khách', 'Customer promise', '고객 약속'))}
        </span>
        <p className="text-on-tint-primary-muted m-0 text-[12px] leading-[1.6]">
          {t(
            message(
              'Chưa có dòng nào. Ghi lại ngày khách hẹn, ai hẹn và hẹn qua kênh nào.',
              'Nothing yet. Record the date the customer promised, who promised and through which channel.',
              '아직 기록이 없습니다. 고객이 약속한 날짜, 약속한 사람, 약속한 채널을 기록하세요.',
            ),
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="pointer-coarse:h-12 self-start"
          onClick={unavailable}
        >
          <Icon icon={PenLine} size={16} />
          {t(message('Ghi lời hứa', 'Record promise', '약속 기록'))}
        </Button>
      </div>

      <button
        type="button"
        className="text-muted-foreground motion-std bg-surface-ink/6 hover:bg-surface-ink/12 flex min-h-12 items-center gap-2 rounded-md p-3 text-[12.5px]"
        onClick={unavailable}
      >
        <Icon icon={Paperclip} size={16} />
        {t(message('Viết ghi chú mới…', 'Write a new note…', '새 메모 작성…'))}
      </button>
    </RunBlock>
  )
}
