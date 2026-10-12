import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, CircleAlert, Icon } from '@pv/ui'
import {
  ADMISSION_MATCH_KEY_LABEL,
  ADMISSION_VERDICT_LABEL,
  type AdmissionCandidate,
  type AdmissionLeadChoice,
  type AdmissionMatch,
  type AdmissionMatchKey,
} from '@pv/contracts'
import type { AdmissionAction, AdmissionPanel } from '@/data/lead-admission'

/** Module 2 · what the admission gate found, and the choices that verdict
 *  allows — drawn INSIDE the form card, on its surface, with no ground of its
 *  own (law 12) and no tint, so the text keeps the card's own contrast.
 *
 *  Nobody holds a company, only a lead: every reader is told which lead matched
 *  and who holds it, and anyone may open a new lead on the same company. A lead
 *  the reader cannot open (`outOfScope`) keeps its code and owner and loses only
 *  its buttons. A company with several open leads lists them, one row each. */

const leadPath = (code: string) => `/sales/leads/${code}`
const accountPath = (code: string) => `/sales/accounts/${code}`

const NO_ACCESS = 'Bạn không có quyền mở lead này.'
const CREATE_LEAD = 'Tạo lead mới cho công ty này'

/** Empty when an API older than this build sent no owner at all: silence, not
 *  a false "nobody holds it". */
const ownerText = (ownerName: string | null | undefined, lead: string) =>
  ownerName === undefined
    ? ''
    : lead + (ownerName === null ? 'chưa có người phụ trách' : `do ${ownerName} phụ trách`)

const keysText = (keys: readonly AdmissionMatchKey[]) =>
  keys.map((key) => ADMISSION_MATCH_KEY_LABEL[key]).join(' · ')

function Code({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>
}

/** Name and code of the company — a plain noun when the gate named none. */
function Company({ account }: { account: AdmissionMatch['account'] }) {
  if (!account) return <>Công ty này</>
  return (
    <>
      Công ty <span className="font-semibold">{account.name}</span> (<Code>{account.code}</Code>)
    </>
  )
}

type Choice = { label: ReactNode; primary?: boolean; run: () => void }

export function LeadAdmissionPanel({
  panel,
  pending,
  onChoose,
}: {
  panel: AdmissionPanel
  pending: boolean
  onChoose: (action: AdmissionAction, leadCode?: string) => void
}) {
  const { match, bookChanged } = panel
  const navigate = useNavigate()
  /* The submit button sits in the sticky bar, far below the card: without
     this the press would look like it did nothing. */
  const box = useRef<HTMLDivElement>(null)
  /* Centred, not nearest: the sticky bar would cover the panel's buttons. */
  useEffect(() => box.current?.scrollIntoView({ block: 'center' }), [match])
  const open = (code: string) => navigate(leadPath(code))

  const { said, rows, choices } = verdictOf(match, { open, choose: onChoose })

  return (
    <div ref={box} className="flex flex-col gap-3">
      {/* The live region holds the words only: buttons inside it are re-read. */}
      <div role="status" className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon icon={CircleAlert} size={16} className="text-warning shrink-0" />
          {ADMISSION_VERDICT_LABEL[match.verdict]}
        </span>

        {bookChanged && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            Sổ vừa thay đổi. Đây là kết quả mới.
          </p>
        )}

        <p className="m-0 max-w-[640px] text-[12.5px] leading-[1.6]">{said}</p>

        {match.matchedOn.length > 0 && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            Trùng theo: {keysText(match.matchedOn)}
          </p>
        )}
      </div>

      {match.verdict === 'needs-review' && match.candidates.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {match.candidates.map((candidate, i) => (
            <CandidateRow
              key={candidate.lead?.code ?? candidate.account?.code ?? i}
              candidate={candidate}
              onOpen={navigate}
            />
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((lead, i) => (
            <LeadRow
              key={lead.code}
              lead={lead}
              primary={i === rows.findIndex((row) => !row.outOfScope)}
              pending={pending}
              onOpen={open}
              onJoin={(code) => onChoose('add-contact', code)}
            />
          ))}
        </ul>
      )}

      {choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {choices.map((choice, i) => (
            <Button
              key={i}
              size="md"
              variant={choice.primary ? 'default' : 'ghost'}
              className="pointer-coarse:h-12"
              disabled={pending}
              onClick={choice.run}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Every open lead the entry may join, matched one first. An API older than
 *  this build sends no list, so the single matched lead stands in for it. */
function leadsOf(match: AdmissionMatch): AdmissionLeadChoice[] {
  if (match.leads.length > 0) return match.leads
  const { lead, outOfScope, newPeople } = match
  return lead?.code ? [{ code: lead.code, ownerName: lead.ownerName, outOfScope, newPeople }] : []
}

/** Joining a lead that already holds the person adds nobody: it is a merge. */
const joinLabel = (lead: AdmissionLeadChoice) =>
  lead.newPeople === 0 ? 'Gộp vào lead' : 'Thêm vào lead'

/** The sentence and the buttons of one verdict. Several open leads go out as
 *  `rows`, each with its own buttons. */
function verdictOf(
  match: AdmissionMatch,
  act: { open: (code: string) => void; choose: (action: AdmissionAction, code?: string) => void },
): { said: ReactNode; rows: AdmissionLeadChoice[]; choices: Choice[] } {
  const createLead = (label: string, primary = false): Choice => ({
    label,
    primary,
    run: () => act.choose('create-lead'),
  })

  switch (match.verdict) {
    case 'same-lead':
    case 'new-contact': {
      const known = match.verdict === 'same-lead'
      const leads = leadsOf(match)
      const held = leads.every((lead) => lead.outOfScope)
      const [only] = leads
      if (leads.length !== 1 || !only) {
        return {
          said: (
            <>
              {known && 'Khách này đã có trong sổ. '}
              <Company account={match.account} />{' '}
              {leads.length <= 1
                ? 'đã có lead đang mở trong sổ.'
                : held
                  ? 'có nhiều lead đang mở. Bạn không có quyền mở lead nào trong số đó.'
                  : 'có nhiều lead đang mở. Chọn một lead, hoặc tạo lead mới.'}
            </>
          ),
          rows: leads,
          choices: [createLead(CREATE_LEAD, held)],
        }
      }
      const { code } = only
      return {
        said: known ? (
          <>
            Khách này đã có trong sổ, ở lead <Code>{code}</Code>
            {ownerText(only.ownerName, ', ')}.{only.outOfScope && ` ${NO_ACCESS}`}
          </>
        ) : (
          <>
            <Company account={match.account} /> có lead đang mở <Code>{code}</Code>
            {ownerText(only.ownerName, ', ')}. Người liên hệ này chưa có trong lead đó.
            {only.outOfScope && ` ${NO_ACCESS}`}
          </>
        ),
        rows: [],
        choices: [
          ...(only.outOfScope
            ? []
            : [
                {
                  label: (
                    <>
                      {joinLabel(only)} <Code>{code}</Code>
                    </>
                  ),
                  primary: true,
                  run: () => act.choose('add-contact', code),
                },
                { label: <OpenLead code={code} />, run: () => act.open(code) },
              ]),
          createLead(CREATE_LEAD, held),
        ],
      }
    }
    case 'returning-account':
      return {
        said: (
          <>
            <Company account={match.account} /> đã có trong sổ và hiện không có lead nào đang mở.
            Lead mới sẽ gắn vào công ty này.
          </>
        ),
        rows: [],
        choices: [createLead(CREATE_LEAD, true)],
      }
    case 'needs-review':
      return {
        said: 'Trong sổ có hồ sơ gần giống thông tin vừa nhập. Xem lại trước khi tạo.',
        rows: [],
        choices: [createLead('Vẫn tạo lead mới')],
      }
    case 'new-account':
      return { said: null, rows: [], choices: [] }
  }
}

function OpenLead({ code }: { code: string }) {
  return (
    <>
      Mở lead <Code>{code}</Code>
    </>
  )
}

/** One open lead of the matched company: who holds it, whether the person is
 *  already on it, and — for a lead the reader can open — joining or opening it. */
function LeadRow({
  lead,
  primary,
  pending,
  onOpen,
  onJoin,
}: {
  lead: AdmissionLeadChoice
  primary: boolean
  pending: boolean
  onOpen: (code: string) => void
  onJoin: (code: string) => void
}) {
  const { code, ownerName, outOfScope, newPeople } = lead

  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
        <span className="font-semibold">
          Lead <Code>{code}</Code>
          {ownerText(ownerName, ' · ')}
        </span>
        <span className="text-muted-foreground">
          {newPeople === 0
            ? 'Người liên hệ này đã có trong lead.'
            : 'Người liên hệ này chưa có trong lead.'}
          {outOfScope && ` ${NO_ACCESS}`}
        </span>
      </span>

      {!outOfScope && (
        <span className="flex flex-wrap items-center gap-2">
          <Button
            size="md"
            variant={primary ? 'default' : 'ghost'}
            className="pointer-coarse:h-12"
            disabled={pending}
            onClick={() => onJoin(code)}
          >
            {joinLabel(lead)} này
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={pending}
            onClick={() => onOpen(code)}
          >
            Mở lead
          </Button>
        </span>
      )}
    </li>
  )
}

/** One possible match. Its company, lead and owner are shown to every reader;
 *  a candidate the reader cannot open only loses its button. */
function CandidateRow({
  candidate,
  onOpen,
}: {
  candidate: AdmissionCandidate
  onOpen: (path: string) => void
}) {
  const { account, lead, outOfScope, matchedOn } = candidate
  const leadCode = lead?.code

  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
        <span className="font-semibold">
          {account && (
            <>
              {account.name} · <Code>{account.code}</Code>
            </>
          )}
          {lead && (
            <>
              {account ? ' · lead' : 'Lead'}
              {leadCode && (
                <>
                  {' '}
                  <Code>{leadCode}</Code>
                </>
              )}
              {ownerText(lead.ownerName, ' · ')}
            </>
          )}
        </span>
        {matchedOn.length > 0 && (
          <span className="text-muted-foreground">Trùng theo: {keysText(matchedOn)}</span>
        )}
        {outOfScope && (
          <span className="text-muted-foreground">Bạn không có quyền mở hồ sơ này.</span>
        )}
      </span>

      {!outOfScope &&
        (leadCode ? (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => onOpen(leadPath(leadCode))}
          >
            <OpenLead code={leadCode} />
          </Button>
        ) : (
          account && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => onOpen(accountPath(account.code))}
            >
              Mở công ty <Code>{account.code}</Code>
            </Button>
          )
        ))}
    </li>
  )
}
