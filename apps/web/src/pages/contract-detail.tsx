import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AiAction, AppShell, Ban, Button, Icon } from '@pv/ui'
import { daysUntil } from '@pv/engines'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import {
  contractDetailQuery,
  contractReadOnlyNote,
  daysPhrase,
  overdue,
  today,
  viewInstallment,
  type Contract,
  type Installment,
  type InstallmentView,
} from '@/data/contracts'
import { CommActionConfirm } from '@/components/comm-action-confirm'
import { InstallmentModal, type ModalInstallment } from '@/components/deal-money/installment-modal'
import { ContractInside } from '@/components/contract-inside'
import { MAIL_BLOCKED, contractChain, hasInside, useContractRun } from '@/components/contract-run'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { ActionBar, type BarContact } from '@/components/record/action-bar'
import { RecordCard } from '@/components/record/record-card'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { ContractStanding, TerminatedBadge } from '@/components/contract-bits'
import { TerminateDrawer, TerminationCard } from '@/components/contract-terminate'
import { RunDocuments } from '@/components/run/run-documents'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { ContractOwners } from '@/components/contract-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { ContractMoney } from './contract-money'
import { ContractTodo } from './contract-todo'

/** Level 1 of the drill — one contract, on the record shell (ADR 0078): run
 *  strip, header, then the body — todo card, money, installments as doors into
 *  level 2, what sits inside the rungs, the assistant last — and the rail: the
 *  run's comms (letters included) and its people. The floating bar only reaches
 *  contacts; mail, the assistant's included, goes through the comm confirm like
 *  every other profile (ADR 0074).
 *
 *  `ContractScreen` is split out so every hook of the profile runs only once
 *  there IS a contract. */

export function ContractDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: contract, isPending, error } = useQuery(contractDetailQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {contract ? (
        <ContractScreen contract={contract} />
      ) : (
        /* Missing and out-of-scope collapse into ONE answer, on purpose: telling
           a caller a contract exists but is not theirs leaks the customer list. */
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: 'Có thể mã sai, hoặc hợp đồng không do bạn phụ trách. Mở lại từ sổ hợp đồng.',
            fallback: 'Không mở được hợp đồng này.',
            back: { label: 'Về sổ hợp đồng', onClick: () => navigate('/sales/contracts') },
          }}
        />
      )}
    </AppShell>
  )
}

export default ContractDetailPage

// ---------------------------------------------------------------------------

function ContractScreen({ contract }: { contract: Contract }) {
  const navigate = useNavigate()
  const run = useContractRun(contract)
  const [composing, setComposing] = useState(false)
  /* The assistant's letter asks the same question the bar's mail button asks. */
  const [mailing, setMailing] = useState<BarContact | null>(null)
  const mailBlocked = useCan('lead.send-email') ? undefined : MAIL_BLOCKED
  const canRecord = useCan('comm.view')
  /* Only an explicit `false` shuts the doors: an API one deploy behind sends none. */
  const readOnly = contract.canEdit === false
  const canTerminate = useCan('contract.terminate') && !readOnly
  const [terminating, setTerminating] = useState(false)
  /* Ended for good (ADR 0107): nothing is owed, so no next installment and no chase. */
  const ended = contract.termination

  /* One clock read for the whole screen. Two reads either side of midnight give
     two levels for one contract, on one render. */
  const now = useMemo(() => today(), [])
  const views = useMemo(
    () => contract.installments.map((d) => viewInstallment(d, now)),
    [contract, now],
  )
  const next = ended ? undefined : views.find((v) => !v.installment.paidAt)
  const subject = { kind: 'contract', code: contract.code } as const
  const { openInstallment, installmentModal } = useInstallmentModal(
    contract,
    views,
    run.workstreamCode,
  )
  const addressee: BarContact = run.contacts.find((c) => c.name === contract.contact) ??
    run.contacts.find((c) => c.primary) ??
    run.contacts[0] ?? { name: contract.contact }

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
              {run.title}
              {ended ? (
                <TerminatedBadge className="ml-3 align-middle tracking-normal" />
              ) : (
                <ContractStanding views={views} className="ml-3 align-middle tracking-normal" />
              )}
            </>
          }
          note={
            !ended && readOnly
              ? contractReadOnlyNote(contract.ownerName, contract.canCollect === true)
              : null
          }
        />
      }
      main={
        <>
          {ended && <TerminationCard termination={ended} currency={contract.currency} />}
          <ContractTodo inside={run.inside} read={run.read} next={next} />
          <ContractMoney
            contract={contract}
            views={views}
            ended={Boolean(ended)}
            onOpen={openInstallment}
          />
          {run.inside && hasInside(run.inside) && (
            <RecordCard>
              <ContractInside contract={run.inside} />
            </RecordCard>
          )}
          {next?.blocking && !mailBlocked && canRecord && (
            <AiAction
              suggestion={
                <>
                  Soạn thư nhắc {contract.contact} làm nốt {next.blocking.what.toLowerCase()}, kèm
                  xin ngày chuyển tiền đợt {next.installment.no}?
                </>
              }
              basis={aiBasis(next, now)}
              empty="Chưa tạo gì. Trợ lý chờ bạn bấm."
              confirmLabel="Soạn thư"
              onConfirm={() => setMailing(addressee)}
              onInspect={() => openInstallment(next.installment.no)}
              inspectLabel="Mở đợt"
            />
          )}
        </>
      }
      railLabel="Lịch sử liên hệ, người liên hệ và tài liệu của hợp đồng"
      rail={
        <>
          <ContractOwners contract={contract} workstreamCode={run.workstreamCode} />
          <RunContacts subject={subject} />
          <CommJourney workstreamCode={run.workstreamCode} subject={subject} />
          <RunDocuments
            workstreamCode={run.workstreamCode}
            canEdit={contract.canEdit !== false || contract.canCollect === true}
            contractCode={contract.code}
          />
        </>
      }
      actionBar={
        <ActionBar
          label="Thao tác hợp đồng"
          subject={subject}
          contacts={run.contacts}
          mailBlocked={mailBlocked}
          onCompose={() => setComposing(true)}
          extra={
            /* Named on the bar, not tucked in the overflow menu: the owner could not find it there. */
            !ended &&
            canTerminate && (
              <Button
                variant="destructive"
                className="pointer-coarse:h-12"
                onClick={() => setTerminating(true)}
              >
                <Icon icon={Ban} size={16} />
                Chấm dứt hợp đồng
              </Button>
            )
          }
        />
      }
    >
      {/* Mounted past the end too, so the closing drawer still slides out and toasts. */}
      {canTerminate && (
        <TerminateDrawer
          contract={contract}
          open={terminating}
          onClose={() => setTerminating(false)}
        />
      )}
      <CommActionConfirm
        channel={mailing ? 'email' : null}
        subject={subject}
        contact={mailing ?? { name: '' }}
        mail={{ onCompose: () => setComposing(true) }}
        onClose={() => setMailing(null)}
      />
      {installmentModal}
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

/** A tile opens the installment modal, built from the contract itself, so a
 *  collector who cannot read the deal still records money here (ADR 0111). */
function useInstallmentModal(
  contract: Contract,
  views: InstallmentView<Installment>[],
  workstreamCode: string | null,
) {
  const mayEdit = useCan('contract.edit')
  const [paying, setPaying] = useState<{ no: number; open: boolean; session: number } | null>(null)
  const view = views.find((v) => v.installment.no === paying?.no)
  /* A terminated contract refuses every write (ADR 0107). */
  const live = contract.termination === null

  return {
    openInstallment: (no: number) =>
      setPaying((prev) => ({ no, open: true, session: (prev?.session ?? 0) + 1 })),
    installmentModal: paying && view && (
      <InstallmentModal
        key={paying.session}
        contract={{
          code: contract.code,
          kind: contract.kind,
          currency: contract.currency,
          can: {
            editSchedule: mayEdit && contract.canEdit !== false && live,
            recordPayment: contract.canCollect === true && live,
          },
        }}
        installment={modalRowOf(view)}
        workstreamCode={workstreamCode}
        collect={live}
        open={paying.open}
        onClose={() => setPaying((prev) => prev && { ...prev, open: false })}
      />
    ),
  }
}

const modalRowOf = ({
  installment: d,
  level,
  daysLeft,
}: InstallmentView<Installment>): ModalInstallment => ({
  no: d.no,
  label: d.label,
  amount: d.amount,
  due: d.due,
  share: d.share,
  paidAt: d.paidAt,
  status: d.paidAt ? 'paid' : overdue(level) ? 'overdue' : 'upcoming',
  days: d.paidAt ? null : Math.abs(daysLeft),
})

/** What the assistant read. The "no reply" clause only when the installment's
 *  latest sent touch is still waiting for one. */
function aiBasis(next: InstallmentView<Installment>, now: string): string {
  const { installment, blocking } = next
  const sent = installment.records
    .filter((r) => r.state === 'done' || r.state === 'awaiting-reply')
    .sort((a, b) => b.at.localeCompare(a.at))[0]
  return [
    `đợt ${installment.no} ${daysPhrase(next.daysLeft)}`,
    blocking && `điều kiện "${blocking.what}" trễ ${-daysUntil(blocking.due, now)} ngày`,
    sent?.state === 'awaiting-reply' && 'lượt nhắc gần nhất chưa có trả lời',
  ]
    .filter(Boolean)
    .join(' · ')
}
