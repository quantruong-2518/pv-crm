import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AiAction, AppShell } from '@pv/ui'
import { CONTRACT_KIND_LABEL } from '@pv/contracts'
import { daysUntil } from '@pv/engines'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmy } from '@/lib/date'
import {
  contractDetailQuery,
  daysPhrase,
  today,
  viewInstallment,
  type Contract,
  type Installment,
  type InstallmentView,
} from '@/data/contracts'
import { CommActionConfirm } from '@/components/comm-action-confirm'
import { ContractInside } from '@/components/contract-inside'
import { MAIL_BLOCKED, contractChain, hasInside, useContractRun } from '@/components/contract-run'
import { LetterComposer } from '@/components/mail-letter/letter-composer'
import { ActionBar, type BarContact } from '@/components/record/action-bar'
import { RecordCard } from '@/components/record/record-card'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { RunDocuments } from '@/components/run/run-documents'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunOwners } from '@/components/run/run-owners'
import { RunContacts } from '@/components/run/run-contacts'
import { InstallmentChart, InstallmentList, MoneySummary } from './contract-money'
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
            notFound:
              'Có thể mã sai, hoặc hợp đồng không đứng tên bạn — hỏi người giữ nó, hoặc mở lại từ sổ.',
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
  const kind = contract.kind && CONTRACT_KIND_LABEL[contract.kind]

  /* One clock read for the whole screen. Two reads either side of midnight give
     two levels for one contract, on one render. */
  const now = useMemo(() => today(), [])
  const views = useMemo(
    () => contract.installments.map((d) => viewInstallment(d, now)),
    [contract, now],
  )
  const next = views.find((v) => !v.installment.paidAt)
  const subject = { kind: 'contract', code: contract.code } as const
  const openInstallment = (no: number) =>
    navigate(`/sales/contracts/${contract.code}/installments/${no}`)
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
          title={run.title}
          meta={[
            /* Unless the title already fell back to it. */
            kind && kind !== run.title && `loại ${kind}`,
            contract.ownerName && `phụ trách ${contract.ownerName}`,
            <span className="tnum">ký {dmy(contract.signedAt)}</span>,
          ]}
        />
      }
      main={
        <>
          <ContractTodo inside={run.inside} read={run.read} next={next} />
          <MoneySummary contract={contract} now={now} next={next} />
          <InstallmentChart views={views} />
          <InstallmentList views={views} onOpen={openInstallment} />
          {run.inside && hasInside(run.inside) && (
            <RecordCard>
              <ContractInside contract={run.inside} />
            </RecordCard>
          )}
          {next?.blocking && !mailBlocked && canRecord && (
            <AiAction
              suggestion={
                <>
                  Soạn thư nhắc {contract.contact} làm nốt {next.blocking.what.toLowerCase()}, gộp
                  luôn câu xin ngày chuyển tiền đợt {next.installment.no}?
                </>
              }
              basis={aiBasis(next, now)}
              empty="Chưa tạo gì cả — trợ lý chờ bạn bấm."
              confirmLabel="Soạn thư"
              onConfirm={() => setMailing(addressee)}
              onInspect={() => openInstallment(next.installment.no)}
              inspectLabel="Mở đợt"
            />
          )}
        </>
      }
      railLabel="Liên hệ, người liên hệ và tài liệu của hợp đồng"
      rail={
        <>
          <RunOwners workstreamCode={run.workstreamCode} />
          <CommJourney workstreamCode={run.workstreamCode} subject={subject} />
          <RunContacts subject={subject} />
          <RunDocuments workstreamCode={run.workstreamCode} />
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
      <CommActionConfirm
        channel={mailing ? 'email' : null}
        subject={subject}
        contact={mailing ?? { name: '' }}
        mail={{ onCompose: () => setComposing(true) }}
        onClose={() => setMailing(null)}
      />
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
